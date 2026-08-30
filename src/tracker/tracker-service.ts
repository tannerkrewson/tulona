import {
  createId,
  isUuid,
  monthKey,
  timestampMs,
  toTimestamp,
  type IsoTimestamp,
  type TimeTransition,
  type TrackerMonthCollection,
  type UUID,
} from '@domain';
import type { TrackerRepositoryApi } from '@data';
import { PersistenceError } from '@data';

import {
  latestValidTransition,
  materializeTransitionIntervals,
  orderTransitions,
  queryTransitions,
  type TrackerQuery,
  type TrackerRange,
  type TransitionInput,
} from './tracker-engine';

export type TimestampInput = Date | number | string;

export interface SwitchActivityOptions {
  timestamp?: TimestampInput;
  source?: TimeTransition['source'];
  note?: string | null;
  id?: UUID;
}

/** A non-tracker value committed in the same journal as a tracker switch. */
export interface TrackerCompanionChange {
  key: string;
  newValue: string | null;
}

export interface TransitionEditInput {
  activityId?: UUID | null;
  timestamp?: TimestampInput;
  source?: TimeTransition['source'];
  note?: string | null;
}

export interface HistoricalConfirmation {
  confirm?: boolean;
}

export type HistoricalConfirmationInput = HistoricalConfirmation | boolean;

export type TrackerMutationKind =
  'insert' | 'edit' | 'reassign' | 'adjust-latest' | 'delete' | 'merge';

export interface TrackerMutation {
  kind: TrackerMutationKind;
  previous: TimeTransition | null;
  current: TimeTransition | null;
  /** Activities whose derived interval boundaries may have changed. */
  affectedActivityIds?: UUID[];
}

export type TrackerMutationListener = (mutation: TrackerMutation) => Promise<unknown>;

export interface TrackerServiceOptions {
  now?: () => TimestampInput;
  onMutation?: TrackerMutationListener;
}

export interface TrackerServiceApi {
  getActiveTransition(at?: TimestampInput): Promise<TimeTransition | null>;
  activeTransition(at?: TimestampInput): Promise<TimeTransition | null>;
  switchActivity(
    activityId: UUID | null,
    timestampOrOptions?: TimestampInput | SwitchActivityOptions
  ): Promise<TimeTransition>;
  switchActivityWithCompanion?(
    activityId: UUID | null,
    options: SwitchActivityOptions,
    companionChanges: readonly TrackerCompanionChange[]
  ): Promise<TimeTransition>;
  adjustLatestStart(timestamp: TimestampInput): Promise<TimeTransition>;
  adjustLatest(timestamp: TimestampInput): Promise<TimeTransition>;
  query(range: TrackerRange, nowMs?: number): Promise<TrackerQuery>;
  queryRange(range: TrackerRange, nowMs?: number): Promise<TrackerQuery>;
  materialize(
    transitions: readonly TimeTransition[],
    range: TrackerRange,
    nowMs: number
  ): ReturnType<typeof materializeTransitionIntervals>;
  insertTransition(input: TransitionInput): Promise<TimeTransition>;
  insertMissedSwitch(input: TransitionInput): Promise<TimeTransition>;
  editTransition(id: UUID, input: TransitionEditInput): Promise<TimeTransition>;
  reassignTransition(id: UUID, activityId: UUID | null): Promise<TimeTransition>;
  deleteTransition(id: UUID, confirmation?: HistoricalConfirmationInput): Promise<TimeTransition>;
  mergeTransition(id: UUID, confirmation?: HistoricalConfirmationInput): Promise<TimeTransition>;
  mergeTransitions(id: UUID, confirmation?: HistoricalConfirmationInput): Promise<TimeTransition>;
}

function validation(message: string): never {
  throw new PersistenceError('validation', message);
}

function assertUuid(value: string, label: string): asserts value is UUID {
  if (!isUuid(value)) validation(`${label} must be a UUID`);
}

function normalizeTimestamp(value: TimestampInput, label: string): IsoTimestamp {
  try {
    return toTimestamp(value);
  } catch (error) {
    validation(
      `${label} must be a valid timestamp: ${error instanceof Error ? error.message : error}`
    );
  }
}

function normalizeNow(now: TimestampInput): number {
  try {
    const value = timestampMs(now);
    if (!Number.isFinite(value)) validation('Current time must be finite');
    return value;
  } catch (error) {
    validation(
      `Current time must be a valid timestamp: ${error instanceof Error ? error.message : error}`
    );
  }
}

function assertNotFuture(timestamp: IsoTimestamp, nowMs: number): void {
  if (timestampMs(timestamp) > nowMs) validation('Transition timestamps cannot be in the future');
}

function assertRange(range: TrackerRange): void {
  if (
    !Number.isFinite(range.startMs) ||
    !Number.isFinite(range.endMs) ||
    range.endMs < range.startMs
  ) {
    throw new RangeError('Invalid tracker range');
  }
}

function isConfirmed(confirmation: HistoricalConfirmationInput): boolean {
  return (
    confirmation === true ||
    (typeof confirmation === 'object' && confirmation !== null && confirmation.confirm === true)
  );
}

function isSwitchOptions(
  value: TimestampInput | SwitchActivityOptions
): value is SwitchActivityOptions {
  return value !== null && typeof value === 'object' && !(value instanceof Date);
}

function createTransition(input: TransitionInput, createdAt: IsoTimestamp): TimeTransition {
  const id = input.id ?? createId();
  assertUuid(id, 'Transition ID');
  if (input.activityId !== null) assertUuid(input.activityId, 'Activity ID');
  return {
    id,
    activityId: input.activityId,
    timestamp: normalizeTimestamp(input.timestamp, 'Transition timestamp'),
    source: input.source ?? 'manual',
    status: 'recorded',
    createdAt,
    correctionOfId: null,
    note: input.note ?? null,
  };
}

function replaceInCollection(
  collection: TrackerMonthCollection,
  oldTransition: TimeTransition,
  nextTransition: TimeTransition
): TrackerMonthCollection {
  return {
    month: collection.month,
    transitions: collection.transitions.map((transition) =>
      transition.id === oldTransition.id ? nextTransition : transition
    ),
    latestTransitions: [],
  };
}

export class TrackerService implements TrackerServiceApi {
  private readonly now: () => TimestampInput;
  private readonly onMutation: TrackerMutationListener | null;

  constructor(
    private readonly repository: TrackerRepositoryApi,
    options: TrackerServiceOptions = {}
  ) {
    this.now = options.now ?? (() => Date.now());
    this.onMutation = options.onMutation ?? null;
  }

  async getActiveTransition(at: TimestampInput = this.now()): Promise<TimeTransition | null> {
    const atMs = normalizeNow(at);
    return latestValidTransition(await this.readHistory(atMs), atMs);
  }

  async activeTransition(at?: TimestampInput): Promise<TimeTransition | null> {
    return this.getActiveTransition(at ?? this.now());
  }

  async switchActivity(
    activityId: UUID | null,
    timestampOrOptions: TimestampInput | SwitchActivityOptions = {}
  ): Promise<TimeTransition> {
    if (activityId !== null) assertUuid(activityId, 'Activity ID');
    const options = isSwitchOptions(timestampOrOptions)
      ? timestampOrOptions
      : { timestamp: timestampOrOptions };
    const now = normalizeNow(this.now());
    const timestamp = normalizeTimestamp(options.timestamp ?? now, 'Switch timestamp');
    assertNotFuture(timestamp, now);
    const current = latestValidTransition(
      await this.readHistory(timestampMs(timestamp)),
      timestampMs(timestamp)
    );
    if (current?.activityId === activityId) return current;

    return this.insertTransition({
      id: options.id,
      activityId,
      timestamp,
      source: options.source ?? 'manual',
      note: options.note,
    });
  }

  async switchActivityWithCompanion(
    activityId: UUID | null,
    options: SwitchActivityOptions,
    companionChanges: readonly TrackerCompanionChange[]
  ): Promise<TimeTransition> {
    if (activityId !== null) assertUuid(activityId, 'Activity ID');
    const now = normalizeNow(this.now());
    const timestamp = normalizeTimestamp(options.timestamp ?? now, 'Switch timestamp');
    assertNotFuture(timestamp, now);
    const current = latestValidTransition(
      await this.readHistory(timestampMs(timestamp)),
      timestampMs(timestamp)
    );
    if (current?.activityId === activityId && companionChanges.length === 0) return current;
    if (current?.activityId === activityId) {
      if (!this.repository.upsertTransitionsWithChanges) {
        throw new PersistenceError(
          'journal',
          'The tracker repository cannot atomically commit a companion change'
        );
      }
      await this.repository.upsertTransitionsWithChanges(
        [],
        companionChanges,
        `tracker-companion-${options.id ?? createId()}`,
        'tracker-routine-start'
      );
      return current;
    }
    return this.insertTransitionWithCompanion(
      {
        id: options.id,
        activityId,
        timestamp,
        source: options.source ?? 'manual',
        note: options.note,
      },
      companionChanges
    );
  }

  async adjustLatestStart(timestamp: TimestampInput): Promise<TimeTransition> {
    const now = normalizeNow(this.now());
    const nextTimestamp = normalizeTimestamp(timestamp, 'Adjusted start');
    assertNotFuture(nextTimestamp, now);
    const transitions = orderTransitions(await this.readHistory(now));
    const latest = latestValidTransition(transitions, now);
    if (!latest) validation('Cannot adjust the start without a recorded transition');
    const valid = transitions.filter((transition) => transition.status === 'recorded');
    const latestIndex = valid.findIndex((transition) => transition.id === latest.id);
    const previous = latestIndex > 0 ? valid[latestIndex - 1] : undefined;
    if (previous && timestampMs(nextTimestamp) < timestampMs(previous.timestamp)) {
      validation('Adjusted start cannot precede the immediately preceding transition');
    }
    if (nextTimestamp === latest.timestamp) return latest;
    const next = { ...latest, timestamp: nextTimestamp };
    const result = await this.replaceTransition(latest, next, 'tracker-transition-adjust-latest');
    await this.notifyMutation({
      kind: 'adjust-latest',
      previous: latest,
      current: result,
      affectedActivityIds: [previous?.activityId, latest.activityId].filter(
        (value): value is UUID => value !== undefined && value !== null
      ),
    });
    return result;
  }

  async adjustLatest(timestamp: TimestampInput): Promise<TimeTransition> {
    return this.adjustLatestStart(timestamp);
  }

  async query(range: TrackerRange, currentNowMs = normalizeNow(this.now())): Promise<TrackerQuery> {
    assertRange(range);
    const transitions = await this.repository.readRange(range.startMs, range.endMs);
    return queryTransitions(transitions, range, currentNowMs);
  }

  async queryRange(range: TrackerRange, currentNowMs?: number): Promise<TrackerQuery> {
    return this.query(range, currentNowMs ?? normalizeNow(this.now()));
  }

  materialize(transitions: readonly TimeTransition[], range: TrackerRange, currentNowMs: number) {
    return materializeTransitionIntervals(transitions, { ...range, nowMs: currentNowMs });
  }

  async insertTransition(input: TransitionInput): Promise<TimeTransition> {
    return this.insertTransitionWithCompanion(input, []);
  }

  private async insertTransitionWithCompanion(
    input: TransitionInput,
    companionChanges: readonly TrackerCompanionChange[]
  ): Promise<TimeTransition> {
    const now = normalizeNow(this.now());
    const transition = createTransition(input, normalizeTimestamp(now, 'Created at'));
    assertNotFuture(transition.timestamp, now);
    const existing = await this.readHistory(now);
    if (existing.some((candidate) => candidate.id === transition.id)) {
      throw new PersistenceError('conflict', `Transition "${transition.id}" already exists`);
    }
    this.assertInsertionOrder(existing, transition, now);
    if (companionChanges.length > 0) {
      if (!this.repository.upsertTransitionsWithChanges) {
        throw new PersistenceError(
          'journal',
          'The tracker repository cannot atomically commit a companion change'
        );
      }
      await this.repository.upsertTransitionsWithChanges(
        [transition],
        companionChanges,
        `tracker-transition-insert-${transition.id}`,
        'tracker-routine-start'
      );
    } else {
      await this.repository.upsertTransitions(
        [transition],
        `tracker-transition-insert-${transition.id}`,
        'tracker-transition-insert'
      );
    }
    const prior = latestValidTransition(existing, timestampMs(transition.timestamp));
    await this.notifyMutation({
      kind: 'insert',
      previous: null,
      current: transition,
      affectedActivityIds: [prior?.activityId, transition.activityId].filter(
        (value): value is UUID => value !== undefined && value !== null
      ),
    });
    return transition;
  }

  async insertMissedSwitch(input: TransitionInput): Promise<TimeTransition> {
    return this.insertTransition(input);
  }

  async editTransition(id: UUID, input: TransitionEditInput): Promise<TimeTransition> {
    return this.editTransitionWithKind(id, input, 'edit');
  }

  private async editTransitionWithKind(
    id: UUID,
    input: TransitionEditInput,
    mutationKind: Extract<TrackerMutationKind, 'edit' | 'reassign'>
  ): Promise<TimeTransition> {
    assertUuid(id, 'Transition ID');
    const now = normalizeNow(this.now());
    const transitions = await this.readHistory(now);
    const current = transitions.find((transition) => transition.id === id);
    if (!current) validation(`Unknown transition "${id}"`);
    if (current.status !== 'recorded') validation('Only recorded transitions can be edited');
    const nextTimestamp = normalizeTimestamp(
      input.timestamp ?? current.timestamp,
      'Transition timestamp'
    );
    assertNotFuture(nextTimestamp, now);
    const next: TimeTransition = {
      ...current,
      activityId: input.activityId === undefined ? current.activityId : input.activityId,
      timestamp: nextTimestamp,
      source: input.source ?? current.source,
      note: input.note === undefined ? current.note : input.note,
    };
    if (next.activityId !== null) assertUuid(next.activityId, 'Activity ID');
    if (JSON.stringify(current) === JSON.stringify(next)) return current;
    this.assertEditOrder(transitions, current, next, now);
    const result = await this.replaceTransition(current, next, 'tracker-transition-edit');
    const prior = orderTransitions(transitions)
      .filter(
        (transition) =>
          transition.id !== current.id &&
          transition.status === 'recorded' &&
          timestampMs(transition.timestamp) < timestampMs(next.timestamp)
      )
      .at(-1);
    await this.notifyMutation({
      kind: mutationKind,
      previous: current,
      current: result,
      affectedActivityIds: [prior?.activityId, current.activityId, next.activityId].filter(
        (value): value is UUID => value !== undefined && value !== null
      ),
    });
    return result;
  }

  async reassignTransition(id: UUID, activityId: UUID | null): Promise<TimeTransition> {
    return this.editTransitionWithKind(id, { activityId }, 'reassign');
  }

  async deleteTransition(
    id: UUID,
    confirmation: HistoricalConfirmationInput = {}
  ): Promise<TimeTransition> {
    return this.removeTransition(id, confirmation, 'tracker-transition-delete');
  }

  private async removeTransition(
    id: UUID,
    confirmation: HistoricalConfirmationInput,
    operationKind: string
  ): Promise<TimeTransition> {
    assertUuid(id, 'Transition ID');
    if (!isConfirmed(confirmation)) {
      validation('Deleting a historical transition requires confirmation');
    }
    const now = normalizeNow(this.now());
    const transitions = await this.readHistory(now);
    const target = transitions.find((transition) => transition.id === id);
    if (!target) validation(`Unknown transition "${id}"`);
    const prior = orderTransitions(transitions)
      .filter((transition) => transition.status === 'recorded' && transition.id !== target.id)
      .filter((transition) => timestampMs(transition.timestamp) < timestampMs(target.timestamp))
      .at(-1);
    const month = monthKey(target.timestamp);
    const collection = await this.repository.readMonth(month);
    await this.repository.writeCrossMonth(
      [
        {
          ...collection,
          transitions: collection.transitions.filter((transition) => transition.id !== id),
          latestTransitions: [],
        },
      ],
      `tracker-transition-${operationKind.replace('tracker-transition-', '')}-${id}`,
      operationKind
    );
    await this.notifyMutation({
      kind: operationKind.endsWith('merge') ? 'merge' : 'delete',
      previous: target,
      current: null,
      affectedActivityIds: [prior?.activityId, target.activityId].filter(
        (value): value is UUID => value !== undefined && value !== null
      ),
    });
    return target;
  }

  async mergeTransition(
    id: UUID,
    confirmation: HistoricalConfirmationInput = {}
  ): Promise<TimeTransition> {
    const now = normalizeNow(this.now());
    const transitions = orderTransitions(await this.readHistory(now)).filter(
      (transition) => transition.status === 'recorded'
    );
    const index = transitions.findIndex((transition) => transition.id === id);
    if (index < 0) validation(`Unknown transition "${id}"`);
    if (index <= 0) validation('The first transition cannot be merged with a preceding state');
    return this.removeTransition(id, confirmation, 'tracker-transition-merge');
  }

  async mergeTransitions(
    id: UUID,
    confirmation: HistoricalConfirmationInput = {}
  ): Promise<TimeTransition> {
    return this.mergeTransition(id, confirmation);
  }

  private async readHistory(now: number): Promise<TimeTransition[]> {
    return this.repository.readRange(0, now);
  }

  private async notifyMutation(mutation: TrackerMutation): Promise<void> {
    if (this.onMutation) await this.onMutation(mutation);
  }

  private assertInsertionOrder(
    transitions: readonly TimeTransition[],
    candidate: TimeTransition,
    now: number
  ): void {
    const valid = orderTransitions(transitions).filter(
      (transition) => transition.status === 'recorded' && transitionTimeAtOrBefore(transition, now)
    );
    if (valid.some((transition) => transition.timestamp === candidate.timestamp)) {
      validation('A recorded transition already exists at that timestamp');
    }
  }

  private assertEditOrder(
    transitions: readonly TimeTransition[],
    current: TimeTransition,
    candidate: TimeTransition,
    now: number
  ): void {
    if (candidate.timestamp === current.timestamp) return;
    const valid = orderTransitions(transitions).filter(
      (transition) =>
        transition.id !== current.id &&
        transition.status === 'recorded' &&
        transitionTimeAtOrBefore(transition, now)
    );
    const candidateMs = timestampMs(candidate.timestamp);
    const previous = valid
      .filter((transition) => timestampMs(transition.timestamp) < candidateMs)
      .at(-1);
    const next = valid.find((transition) => timestampMs(transition.timestamp) > candidateMs);
    if (previous && candidateMs <= timestampMs(previous.timestamp)) {
      validation('Edited transition must remain after the preceding transition');
    }
    if (next && candidateMs >= timestampMs(next.timestamp)) {
      validation('Edited transition must remain before the following transition');
    }
  }

  private async replaceTransition(
    current: TimeTransition,
    next: TimeTransition,
    kind: string
  ): Promise<TimeTransition> {
    const operationId = `${kind}-${current.id}-${encodeURIComponent(
      [next.activityId ?? 'none', next.timestamp, next.source, next.note ?? ''].join('|')
    )}`;
    const oldMonth = monthKey(current.timestamp);
    const newMonth = monthKey(next.timestamp);
    if (oldMonth === newMonth) {
      const collection = await this.repository.readMonth(oldMonth);
      await this.repository.writeCrossMonth(
        [replaceInCollection(collection, current, next)],
        operationId,
        kind
      );
      return next;
    }
    const [oldCollection, newCollection] = await Promise.all([
      this.repository.readMonth(oldMonth),
      this.repository.readMonth(newMonth),
    ]);
    await this.repository.writeCrossMonth(
      [
        {
          ...oldCollection,
          transitions: oldCollection.transitions.filter(
            (transition) => transition.id !== current.id
          ),
          latestTransitions: [],
        },
        {
          ...newCollection,
          transitions: [...newCollection.transitions, next],
          latestTransitions: [],
        },
      ],
      operationId,
      kind
    );
    return next;
  }
}

function transitionTimeAtOrBefore(transition: TimeTransition, now: number): boolean {
  try {
    return timestampMs(transition.timestamp) <= now;
  } catch {
    return false;
  }
}

export function createTrackerService(
  repository: TrackerRepositoryApi,
  options?: TrackerServiceOptions
): TrackerService {
  return new TrackerService(repository, options);
}
