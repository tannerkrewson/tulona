import { createId, monthKey, trackerMonthCollectionSchema } from '@domain';
import type { MonthKey, Transition, TrackerMonthCollection } from '@domain';
import { DateTime } from 'luxon';

import type { KeyValueDatabase } from './database';
import { DatasetStore } from './dataset-store';
import { PersistenceError } from './errors';
import { OperationJournal } from './journal';
import type { JournalChange, RecoveryReport } from './journal';
import type { DatasetNamespace } from './namespaces';

function emptyMonth(month: MonthKey): TrackerMonthCollection {
  return { month, transitions: [], latestTransitions: [] };
}

function isStoredTransition(value: unknown): value is Transition {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.timestamp === 'string' &&
    typeof candidate.status === 'string' &&
    (candidate.activityId === null || typeof candidate.activityId === 'string')
  );
}

/**
 * Months are fully schema-validated when written; loading the whole history
 * only checks structure, because full validation dominated startup on large
 * histories. The tracker engine still ignores records with invalid IDs or times.
 */
function parseMonth(key: string, month: MonthKey, value: string): TrackerMonthCollection {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new PersistenceError('corruption', 'Stored tracker month is not valid JSON', key, error);
  }
  const collection = parsed as Partial<TrackerMonthCollection> | null;
  if (
    !collection ||
    collection.month !== month ||
    !Array.isArray(collection.transitions) ||
    !collection.transitions.every(isStoredTransition)
  ) {
    throw new PersistenceError('validation', `Stored tracker month ${month} is malformed`, key);
  }
  return {
    ...collection,
    month,
    transitions: collection.transitions,
    latestTransitions: Array.isArray(collection.latestTransitions)
      ? collection.latestTransitions
      : [],
  };
}

function validateMonth(value: string): MonthKey {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))
    throw new RangeError(`Invalid tracker month "${value}"`);
  return value as MonthKey;
}

function sortTransitions(transitions: readonly Transition[]): Transition[] {
  return [...transitions].sort(
    (left, right) =>
      left.timestamp.localeCompare(right.timestamp) || left.id.localeCompare(right.id)
  );
}

function latestCache(transitions: readonly Transition[]): Transition[] {
  const latest = new Map<string, Transition>();
  for (const transition of sortTransitions(transitions))
    latest.set(transition.activityId ?? 'none', transition);
  return [...latest.values()];
}

function monthKeys(start: MonthKey, end: MonthKey): MonthKey[] {
  const [startYear, startMonth] = start.split('-').map(Number);
  const [endYear, endMonth] = end.split('-').map(Number);
  const result: MonthKey[] = [];
  let year = startYear;
  let currentMonth = startMonth;
  while (year < endYear || (year === endYear && currentMonth <= endMonth)) {
    result.push(`${year}-${String(currentMonth).padStart(2, '0')}` as MonthKey);
    currentMonth += 1;
    if (currentMonth === 13) {
      currentMonth = 1;
      year += 1;
    }
  }
  return result;
}

export interface TrackerRepositoryApi {
  readMonth(month: MonthKey): Promise<TrackerMonthCollection>;
  readMonths(start: MonthKey, end: MonthKey): Promise<Transition[]>;
  readRange(startMs: number, endMs: number): Promise<Transition[]>;
  /** Optional full-history read used by one-time compatibility backfills. */
  readAll?(): Promise<Transition[]>;
  writeMonth(collection: TrackerMonthCollection): Promise<void>;
  upsertTransitions(
    transitions: readonly Transition[],
    operationId?: string,
    operationKind?: string
  ): Promise<void>;
  upsertTransitionsWithChanges?(
    transitions: readonly Transition[],
    companionChanges: readonly JournalChange[],
    operationId?: string,
    operationKind?: string
  ): Promise<void>;
  writeCrossMonth(
    collections: readonly TrackerMonthCollection[],
    operationId: string,
    operationKind?: string
  ): Promise<void>;
  recoverJournal(): Promise<RecoveryReport>;
}

/**
 * Month buckets stay the durable unit, but the whole history is read once into
 * memory: every tracker question (active session, neighbors, ranges) is then
 * answered without touching storage. Writes made through this repository update
 * the cache; writes from anywhere else (sync, restores, journal recovery, other
 * tabs) drop it so the next read reloads.
 */
export class TrackerRepository implements TrackerRepositoryApi {
  private readonly store: DatasetStore;
  private readonly journal: OperationJournal;
  private readonly monthPrefix: string;
  private months: Map<MonthKey, TrackerMonthCollection> | null = null;
  private timeline: Transition[] | null = null;
  private loading: Promise<Map<MonthKey, TrackerMonthCollection>> | null = null;
  private generation = 0;
  private ownKeys = new Set<string>();
  private unsubscribers: (() => void)[] = [];

  constructor(
    private readonly database: KeyValueDatabase,
    private readonly namespace: DatasetNamespace
  ) {
    this.store = new DatasetStore(database);
    this.journal = new OperationJournal(database);
    this.monthPrefix = `${namespace.key('tracker')}:`;
  }

  /** Releases the in-memory history and stops observing storage. */
  dispose(): void {
    this.invalidate();
  }

  async readMonth(month: MonthKey): Promise<TrackerMonthCollection> {
    const normalizedMonth = validateMonth(month);
    const months = await this.loadedMonths();
    return months.get(normalizedMonth) ?? emptyMonth(normalizedMonth);
  }

  async readMonths(start: MonthKey, end: MonthKey): Promise<Transition[]> {
    const normalizedStart = validateMonth(start);
    const normalizedEnd = validateMonth(end);
    if (normalizedStart > normalizedEnd) throw new RangeError('Tracker month range is reversed');
    const months = await this.loadedMonths();
    const selected = [...months.keys()]
      .filter((month) => month >= normalizedStart && month <= normalizedEnd)
      .sort();
    return selected.flatMap((month) => months.get(month)?.transitions ?? []);
  }

  /** Includes the prior bucket so a range beginning mid-month has its state. */
  async readRange(startMs: number, endMs: number): Promise<Transition[]> {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs)
      throw new RangeError('Invalid tracker range');
    const firstMonth = DateTime.fromMillis(startMs, { zone: 'local' })
      .startOf('month')
      .minus({ months: 1 });
    return this.readMonths(monthKey(firstMonth.toJSDate()), monthKey(endMs));
  }

  /**
   * The full ordered history. The same array is returned until the history
   * changes, so callers must treat it as immutable.
   */
  async readAll(): Promise<Transition[]> {
    const months = await this.loadedMonths();
    if (!this.timeline) {
      this.timeline = [...months.keys()]
        .sort()
        .flatMap((month) => months.get(month)?.transitions ?? []);
    }
    return this.timeline;
  }

  private async loadedMonths(): Promise<Map<MonthKey, TrackerMonthCollection>> {
    if (this.months) return this.months;
    if (this.loading) return this.loading;
    const generation = this.generation;
    this.observeStorage();
    const loading = this.readMonthsFromStorage().then((months) => {
      if (generation === this.generation) {
        this.months = months;
        this.timeline = null;
      }
      return months;
    });
    this.loading = loading;
    try {
      return await loading;
    } finally {
      if (this.loading === loading) this.loading = null;
    }
  }

  private async readMonthsFromStorage(): Promise<Map<MonthKey, TrackerMonthCollection>> {
    const months = new Map<MonthKey, TrackerMonthCollection>();
    if (!this.database.keys) {
      for (const month of monthKeys('1970-01' as MonthKey, monthKey(Date.now()))) {
        const collection = await this.store.read(
          this.namespace,
          'tracker',
          trackerMonthCollectionSchema,
          month
        );
        if (collection && collection.transitions.length > 0) months.set(month, collection);
      }
      return months;
    }
    const keys = (await this.database.keys()).filter(
      (key) =>
        key.startsWith(this.monthPrefix) &&
        /^\d{4}-(0[1-9]|1[0-2])$/.test(key.slice(this.monthPrefix.length))
    );
    const values = await this.database.multiRead(keys);
    for (const key of keys) {
      const value = values.get(key);
      if (value === null || value === undefined) continue;
      const month = key.slice(this.monthPrefix.length) as MonthKey;
      months.set(month, parseMonth(key, month, value));
    }
    return months;
  }

  private observeStorage(): void {
    if (this.unsubscribers.length > 0) return;
    const onWrite = (keys: readonly string[], source?: string) => {
      const foreign = keys.some(
        (key) => key.startsWith(this.monthPrefix) && (source === 'sync' || !this.ownKeys.has(key))
      );
      if (foreign) this.invalidate();
    };
    const onExternalWrite = (keys: readonly string[]) => {
      if (keys.some((key) => key.startsWith(this.monthPrefix))) this.invalidate();
    };
    const unsubscribeWrites = this.database.subscribeToWrites?.(onWrite);
    const unsubscribeExternal = this.database.subscribeToExternalWrites?.(onExternalWrite);
    if (unsubscribeWrites) this.unsubscribers.push(unsubscribeWrites);
    if (unsubscribeExternal) this.unsubscribers.push(unsubscribeExternal);
  }

  private invalidate(): void {
    this.generation += 1;
    this.months = null;
    this.timeline = null;
    this.loading = null;
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
  }

  async writeMonth(collection: TrackerMonthCollection): Promise<void> {
    const normalizedMonth = validateMonth(collection.month);
    if (
      collection.transitions.some(
        (transition) => monthKey(transition.timestamp) !== normalizedMonth
      )
    ) {
      throw new PersistenceError(
        'validation',
        'A tracker month cannot contain transitions from another month'
      );
    }
    await this.writeCollections(
      [
        {
          month: normalizedMonth,
          collection: {
            ...collection,
            month: normalizedMonth,
            latestTransitions: [],
          },
        },
      ],
      `tracker-month-write-${normalizedMonth}-${createId()}`
    );
  }

  async upsertTransitions(
    transitions: readonly Transition[],
    operationId?: string,
    operationKind?: string
  ): Promise<void> {
    if (transitions.length === 0) return;
    const grouped = new Map<MonthKey, Transition[]>();
    for (const transition of transitions) {
      const month = monthKey(transition.timestamp);
      grouped.set(month, [...(grouped.get(month) ?? []), transition]);
    }
    const nextCollections = await Promise.all(
      [...grouped.entries()].map(async ([month, additions]) => {
        const current = await this.readMonth(month);
        const byId = new Map(current.transitions.map((transition) => [transition.id, transition]));
        for (const transition of additions) byId.set(transition.id, transition);
        const nextTransitions = sortTransitions([...byId.values()]);
        return {
          month,
          collection: {
            month,
            transitions: nextTransitions,
            latestTransitions: latestCache(nextTransitions),
          },
        };
      })
    );
    await this.writeCollections(
      nextCollections,
      operationId ?? `tracker-upsert-${Date.now()}-${transitions[0].id}`,
      operationKind
    );
  }

  async upsertTransitionsWithChanges(
    transitions: readonly Transition[],
    companionChanges: readonly JournalChange[],
    operationId?: string,
    operationKind = 'tracker-transition-with-companion'
  ): Promise<void> {
    if (transitions.length === 0 && companionChanges.length === 0) return;
    const grouped = new Map<MonthKey, Transition[]>();
    for (const transition of transitions) {
      const month = monthKey(transition.timestamp);
      grouped.set(month, [...(grouped.get(month) ?? []), transition]);
    }
    const nextCollections = await Promise.all(
      [...grouped.entries()].map(async ([month, additions]) => {
        const current = await this.readMonth(month);
        const byId = new Map(current.transitions.map((transition) => [transition.id, transition]));
        for (const transition of additions) byId.set(transition.id, transition);
        const nextTransitions = sortTransitions([...byId.values()]);
        return {
          month,
          collection: {
            month,
            transitions: nextTransitions,
            latestTransitions: latestCache(nextTransitions),
          },
        };
      })
    );
    await this.writeCollections(
      nextCollections,
      operationId ?? `tracker-companion-${Date.now()}-${createId()}`,
      operationKind,
      companionChanges
    );
  }

  async writeCrossMonth(
    collections: readonly TrackerMonthCollection[],
    operationId: string,
    operationKind = 'tracker-month-write'
  ): Promise<void> {
    const nextCollections = collections.map((collection) => ({
      month: validateMonth(collection.month),
      collection,
    }));
    if (new Set(nextCollections.map(({ month }) => month)).size !== nextCollections.length) {
      throw new PersistenceError('validation', 'A cross-month operation cannot repeat a month');
    }
    await this.writeCollections(nextCollections, operationId, operationKind);
  }

  async recoverJournal(): Promise<RecoveryReport> {
    return this.journal.recoverUnfinished();
  }

  private async writeCollections(
    collections: readonly { month: MonthKey; collection: TrackerMonthCollection }[],
    operationId: string,
    operationKind = 'tracker-month-write',
    companionChanges: readonly JournalChange[] = []
  ): Promise<void> {
    const months = await this.loadedMonths();
    const generation = this.generation;
    const changes: JournalChange[] = [];
    const nextMonths = new Map<MonthKey, TrackerMonthCollection>();
    for (const { month, collection } of collections) {
      if (collection.transitions.some((transition) => monthKey(transition.timestamp) !== month)) {
        throw new PersistenceError(
          'validation',
          `Tracker month ${month} contains a transition from another month`
        );
      }
      const normalized = {
        ...collection,
        month,
        transitions: sortTransitions(collection.transitions),
        latestTransitions: latestCache(collection.transitions),
      };
      const parsed = trackerMonthCollectionSchema.safeParse(normalized);
      if (!parsed.success)
        throw new PersistenceError(
          'validation',
          `Tracker month failed validation: ${parsed.error.message}`
        );
      changes.push({
        key: this.namespace.key('tracker', month),
        newValue: JSON.stringify(parsed.data),
      });
      nextMonths.set(month, parsed.data);
    }
    const keys = new Set(changes.map((change) => change.key));
    for (const change of companionChanges) {
      if (!change.key || keys.has(change.key)) {
        throw new PersistenceError('validation', 'Companion journal changes must have unique keys');
      }
      keys.add(change.key);
      changes.push(change);
    }
    for (const key of keys) this.ownKeys.add(key);
    try {
      await this.journal.run({
        id: operationId,
        datasetId: this.namespace.datasetId,
        kind: operationKind,
        changes,
      });
    } catch (error) {
      this.invalidate();
      throw error;
    } finally {
      for (const key of keys) this.ownKeys.delete(key);
    }
    if (generation !== this.generation || this.months !== months) return;
    for (const [month, collection] of nextMonths) {
      if (collection.transitions.length === 0) months.delete(month);
      else months.set(month, collection);
    }
    this.timeline = null;
  }
}

export function createTrackerRepository(
  database: KeyValueDatabase,
  namespace: DatasetNamespace
): TrackerRepository {
  return new TrackerRepository(database, namespace);
}
