import { createId, monthKey, trackerMonthCollectionSchema } from '@domain';
import type { MonthKey, Transition, TrackerMonthCollection } from '@domain';

import type { KeyValueDatabase } from './database';
import { DatasetStore } from './dataset-store';
import { PersistenceError } from './errors';
import { OperationJournal } from './journal';
import type { RecoveryReport } from './journal';
import type { DatasetNamespace } from './namespaces';

function emptyMonth(month: MonthKey): TrackerMonthCollection {
  return { month, transitions: [], latestTransitions: [] };
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
  writeMonth(collection: TrackerMonthCollection): Promise<void>;
  upsertTransitions(
    transitions: readonly Transition[],
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

export class TrackerRepository implements TrackerRepositoryApi {
  private readonly store: DatasetStore;
  private readonly journal: OperationJournal;

  constructor(
    database: KeyValueDatabase,
    private readonly namespace: DatasetNamespace
  ) {
    this.store = new DatasetStore(database);
    this.journal = new OperationJournal(database);
  }

  async readMonth(month: MonthKey): Promise<TrackerMonthCollection> {
    const normalizedMonth = validateMonth(month);
    return (
      (await this.store.read(
        this.namespace,
        'tracker',
        trackerMonthCollectionSchema,
        normalizedMonth
      )) ?? emptyMonth(normalizedMonth)
    );
  }

  async readMonths(start: MonthKey, end: MonthKey): Promise<Transition[]> {
    const normalizedStart = validateMonth(start);
    const normalizedEnd = validateMonth(end);
    if (normalizedStart > normalizedEnd) throw new RangeError('Tracker month range is reversed');
    const months = monthKeys(normalizedStart, normalizedEnd);
    if (months.length === 0) return [];
    const collections = await Promise.all(months.map((month) => this.readMonth(month)));
    return sortTransitions(collections.flatMap((collection) => collection.transitions));
  }

  /** Includes the prior bucket so a range beginning mid-month has its state. */
  async readRange(startMs: number, endMs: number): Promise<Transition[]> {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs)
      throw new RangeError('Invalid tracker range');
    const startDate = new Date(startMs);
    startDate.setDate(1);
    startDate.setMonth(startDate.getMonth() - 1);
    return this.readMonths(monthKey(startDate), monthKey(endMs));
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
    operationKind = 'tracker-month-write'
  ): Promise<void> {
    const changes = [];
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
    }
    await this.journal.run({
      id: operationId,
      datasetId: this.namespace.datasetId,
      kind: operationKind,
      changes,
    });
  }
}

export function createTrackerRepository(
  database: KeyValueDatabase,
  namespace: DatasetNamespace
): TrackerRepository {
  return new TrackerRepository(database, namespace);
}
