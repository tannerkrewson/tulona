import {
  activeRoutineSchema,
  monthKey,
  routineHistoryCollectionSchema,
  routineRunHistorySchema,
} from '@domain';
import type { ActiveRoutine, MonthKey, RoutineHistoryCollection, RoutineRunHistory } from '@domain';

import type { KeyValueDatabase } from './database';
import { DatasetStore } from './dataset-store';
import { PersistenceError } from './errors';
import { OperationJournal } from './journal';
import type { JournalChange, RecoveryReport } from './journal';
import type { DatasetNamespace } from './namespaces';

function emptyHistory(month: MonthKey): RoutineHistoryCollection {
  return { month, runs: [] };
}

function validateMonth(value: string): MonthKey {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))
    throw new RangeError(`Invalid routine history month "${value}"`);
  return value as MonthKey;
}

export interface RoutineRepositoryApi {
  readActive(): Promise<ActiveRoutine | null>;
  writeActive(activeRoutine: ActiveRoutine): Promise<void>;
  clearActive(): Promise<void>;
  readHistory(month: MonthKey): Promise<RoutineHistoryCollection>;
  appendHistory(run: RoutineRunHistory, operationId?: string): Promise<void>;
  persistAwaiting?(
    activeRoutine: ActiveRoutine,
    run: RoutineRunHistory,
    operationId?: string
  ): Promise<void>;
  finalize(
    activeRoutine: ActiveRoutine,
    run: RoutineRunHistory,
    operationId?: string
  ): Promise<void>;
  prepareActiveWrite?(activeRoutine: ActiveRoutine): JournalChange;
  recoverJournal(): Promise<RecoveryReport>;
}

export class RoutineRepository implements RoutineRepositoryApi {
  private readonly store: DatasetStore;
  private readonly journal: OperationJournal;

  constructor(
    database: KeyValueDatabase,
    private readonly namespace: DatasetNamespace
  ) {
    this.store = new DatasetStore(database);
    this.journal = new OperationJournal(database);
  }

  async readActive(): Promise<ActiveRoutine | null> {
    return this.store.read(this.namespace, 'active-routine', activeRoutineSchema);
  }

  async writeActive(activeRoutine: ActiveRoutine): Promise<void> {
    await this.store.write(this.namespace, 'active-routine', activeRoutineSchema, activeRoutine);
  }

  async clearActive(): Promise<void> {
    await this.store.remove(this.namespace, 'active-routine');
  }

  prepareActiveWrite(activeRoutine: ActiveRoutine): JournalChange {
    const parsed = activeRoutineSchema.safeParse(activeRoutine);
    if (!parsed.success)
      throw new PersistenceError(
        'validation',
        `Active routine failed validation: ${parsed.error.message}`
      );
    return {
      key: this.namespace.key('active-routine'),
      newValue: JSON.stringify(parsed.data),
    };
  }

  async readHistory(month: MonthKey): Promise<RoutineHistoryCollection> {
    const normalizedMonth = validateMonth(month);
    return (
      (await this.store.read(
        this.namespace,
        'routine-history',
        routineHistoryCollectionSchema,
        normalizedMonth
      )) ?? emptyHistory(normalizedMonth)
    );
  }

  async appendHistory(run: RoutineRunHistory, operationId?: string): Promise<void> {
    const parsed = routineRunHistorySchema.safeParse(run);
    if (!parsed.success)
      throw new PersistenceError(
        'validation',
        `Routine history failed validation: ${parsed.error.message}`
      );
    const month = monthKey(run.completedAt);
    const current = await this.readHistory(month);
    const existing = current.runs.find((candidate) => candidate.id === run.id);
    if (existing) {
      if (
        JSON.stringify(routineRunHistorySchema.parse(existing)) !==
        JSON.stringify(routineRunHistorySchema.parse(run))
      )
        throw new PersistenceError(
          'conflict',
          `Routine run "${run.id}" already has different history`
        );
      return;
    }
    await this.writeHistory(
      { month, runs: [...current.runs, run] },
      operationId ?? `routine-history-${run.id}`
    );
  }

  /** Persists completion history while retaining the chooser's active state. */
  async persistAwaiting(
    activeRoutine: ActiveRoutine,
    run: RoutineRunHistory,
    operationId = `routine-awaiting-${run.id}`
  ): Promise<void> {
    const parsedActive = activeRoutineSchema.safeParse(activeRoutine);
    if (!parsedActive.success)
      throw new PersistenceError(
        'validation',
        `Active routine failed validation: ${parsedActive.error.message}`
      );
    const parsedRun = routineRunHistorySchema.safeParse(run);
    if (!parsedRun.success)
      throw new PersistenceError(
        'validation',
        `Routine history failed validation: ${parsedRun.error.message}`
      );
    if (activeRoutine.status !== 'awaiting-next-activity' || run.status !== 'completed') {
      throw new PersistenceError(
        'validation',
        'Only completed routines can be retained while awaiting the next activity'
      );
    }

    const currentActive = await this.readActive();
    const history = await this.readHistory(monthKey(run.completedAt));
    const existing = history.runs.find((candidate) => candidate.id === run.id);
    if (existing) {
      if (
        JSON.stringify(routineRunHistorySchema.parse(existing)) !==
        JSON.stringify(routineRunHistorySchema.parse(run))
      )
        throw new PersistenceError(
          'conflict',
          `Routine run "${run.id}" already has different history`
        );
      if (!currentActive || currentActive.id !== activeRoutine.id) return;
    }
    if (currentActive && currentActive.id !== activeRoutine.id) {
      throw new PersistenceError(
        'conflict',
        'Cannot retain a routine other than the persisted active routine'
      );
    }
    if (!currentActive) {
      throw new PersistenceError(
        'conflict',
        'Cannot retain a completed routine without an active routine'
      );
    }
    if (run.routineId !== activeRoutine.routineId) {
      throw new PersistenceError(
        'conflict',
        'Routine history does not match the active routine definition'
      );
    }

    const month = monthKey(run.completedAt);
    const historyValue = JSON.stringify(
      routineHistoryCollectionSchema.parse(
        existing ? history : { month, runs: [...history.runs, run] }
      )
    );
    const activeValue = JSON.stringify(activeRoutineSchema.parse(activeRoutine));
    await this.journal.run({
      id: operationId,
      datasetId: this.namespace.datasetId,
      kind: 'routine-awaiting-next-activity',
      changes: [
        { key: this.namespace.key('routine-history', month), newValue: historyValue },
        { key: this.namespace.key('active-routine'), newValue: activeValue },
      ],
    });
  }

  async finalize(
    activeRoutine: ActiveRoutine,
    run: RoutineRunHistory,
    operationId = `routine-finalize-${run.id}`
  ): Promise<void> {
    const currentActive = await this.readActive();
    const history = await this.readHistory(monthKey(run.completedAt));
    const existing = history.runs.find((candidate) => candidate.id === run.id);
    if (existing) {
      if (
        JSON.stringify(routineRunHistorySchema.parse(existing)) !==
        JSON.stringify(routineRunHistorySchema.parse(run))
      )
        throw new PersistenceError(
          'conflict',
          `Routine run "${run.id}" already has different history`
        );
      if (currentActive?.id === activeRoutine.id) await this.clearActive();
      return;
    }
    if (currentActive && currentActive.id !== activeRoutine.id) {
      throw new PersistenceError(
        'conflict',
        'Cannot finalize a routine other than the persisted active routine'
      );
    }
    if (!currentActive)
      throw new PersistenceError('conflict', 'Cannot finalize a routine without an active routine');
    if (run.routineId !== activeRoutine.routineId) {
      throw new PersistenceError(
        'conflict',
        'Routine history does not match the active routine definition'
      );
    }
    const month = monthKey(run.completedAt);
    const historyValue = JSON.stringify(
      routineHistoryCollectionSchema.parse({ month, runs: [...history.runs, run] })
    );
    await this.journal.run({
      id: operationId,
      datasetId: this.namespace.datasetId,
      kind: 'routine-finalize',
      changes: [
        { key: this.namespace.key('routine-history', month), newValue: historyValue },
        { key: this.namespace.key('active-routine'), newValue: null },
      ],
    });
  }

  async recoverJournal(): Promise<RecoveryReport> {
    return this.journal.recoverUnfinished();
  }

  private async writeHistory(
    history: RoutineHistoryCollection,
    operationId: string
  ): Promise<void> {
    const result = routineHistoryCollectionSchema.safeParse(history);
    if (!result.success)
      throw new PersistenceError(
        'validation',
        `Routine history failed validation: ${result.error.message}`
      );
    const key = this.namespace.key('routine-history', history.month);
    await this.journal.run({
      id: operationId,
      datasetId: this.namespace.datasetId,
      kind: 'routine-history-write',
      changes: [{ key, newValue: JSON.stringify(result.data) }],
    });
  }
}

export function createRoutineRepository(
  database: KeyValueDatabase,
  namespace: DatasetNamespace
): RoutineRepository {
  return new RoutineRepository(database, namespace);
}
