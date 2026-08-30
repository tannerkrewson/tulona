import {
  AsyncStorageDatabase,
  CatalogRepository,
  DatasetManager,
  HabitRepository,
  JOURNAL_INDEX_KEY,
  OperationJournal,
  PersistenceError,
  RoutineRepository,
  SettingsRepository,
  TrackerRepository,
  operationJournalKey,
} from '../src/data/index';
import type { AsyncStorageLike } from '../src/data/index';
import type { ActiveRoutine, Activity, Habit, RoutineRunHistory } from '../src/domain/index';

class MemoryStorage implements AsyncStorageLike {
  readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function run(): Promise<void> {
  const storage = new MemoryStorage();
  const database = new AsyncStorageDatabase(storage);
  const manager = new DatasetManager(database);
  const namespace = await manager.create('Test dataset', '11111111-1111-4111-8111-111111111111');
  await manager.activate(namespace.datasetId);

  const activity: Activity = {
    id: '22222222-2222-4222-8222-222222222222',
    kind: 'activity',
    name: 'Focus',
    folderId: null,
    sortOrder: 0,
    color: null,
    iconName: null,
    createdAt: '2026-08-29T00:00:00.000Z',
    updatedAt: '2026-08-29T00:00:00.000Z',
    archivedAt: '2026-08-30T00:00:00.000Z',
  };
  const catalog = new CatalogRepository(database, namespace);
  await catalog.writeActivities([activity]);
  assert(
    (await catalog.readActivities())[0].archivedAt !== null,
    'catalog repository must retain archived records'
  );

  const habit: Habit = {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Read',
    sortOrder: 0,
    schedule: { kind: 'daily' },
    trigger: null,
    description: null,
    color: null,
    iconName: null,
    createdAt: '2026-08-29T00:00:00.000Z',
    updatedAt: '2026-08-29T00:00:00.000Z',
    archivedAt: '2026-08-30T00:00:00.000Z',
  };
  const habits = new HabitRepository(database, namespace);
  await habits.writeHabits([habit]);
  await habits.updateSignals(habit.id, '2026-08-29', { manual: true }, '2026-08-29T01:00:00.000Z');
  await habits.updateSignals(
    habit.id,
    '2026-08-29',
    { automatic: false },
    '2026-08-29T02:00:00.000Z'
  );
  const state = (await habits.readMonth('2026-08'))?.states[0];
  assert(
    state?.manual === true && state.automatic === false,
    'habit signals must update independently'
  );

  const tracker = new TrackerRepository(database, namespace);
  await tracker.upsertTransitions(
    [
      {
        id: '44444444-4444-4444-8444-444444444444',
        activityId: activity.id,
        timestamp: '2026-08-15T12:00:00.000Z',
        source: 'manual',
        status: 'recorded',
        createdAt: '2026-08-15T12:00:00.000Z',
        correctionOfId: null,
        note: null,
      },
      {
        id: '55555555-5555-4555-8555-555555555555',
        activityId: null,
        timestamp: '2026-09-15T12:00:00.000Z',
        source: 'manual',
        status: 'recorded',
        createdAt: '2026-09-15T12:00:00.000Z',
        correctionOfId: null,
        note: null,
      },
    ],
    'cross-month-check'
  );
  assert(
    (await tracker.readMonth('2026-08')).transitions.length === 1,
    'tracker writes August bucket'
  );
  assert(
    (await tracker.readMonth('2026-09')).transitions.length === 1,
    'tracker writes September bucket'
  );
  await tracker.upsertTransitions(
    [
      {
        id: '44444444-4444-4444-8444-444444444444',
        activityId: activity.id,
        timestamp: '2026-08-15T12:00:00.000Z',
        source: 'manual',
        status: 'recorded',
        createdAt: '2026-08-15T12:00:00.000Z',
        correctionOfId: null,
        note: null,
      },
      {
        id: '55555555-5555-4555-8555-555555555555',
        activityId: null,
        timestamp: '2026-09-15T12:00:00.000Z',
        source: 'manual',
        status: 'recorded',
        createdAt: '2026-09-15T12:00:00.000Z',
        correctionOfId: null,
        note: null,
      },
    ],
    'cross-month-check'
  );
  assert(
    (await tracker.readMonth('2026-09')).transitions.length === 1,
    'journaled tracker operation is idempotent'
  );

  const settings = new SettingsRepository(database, namespace);
  assert(
    (await settings.read()).logicalDayRolloverHour === 0,
    'settings provide midnight defaults'
  );
  await database.write(namespace.key('settings'), '{"settingsVersion":1}');
  const recoveredSettings = await settings.readWithRecovery();
  assert(
    recoveredSettings.status === 'recovered' && recoveredSettings.error?.category === 'validation',
    'malformed settings are visibly recovered'
  );
  assert(
    (await database.read(namespace.key('settings'))) === '{"settingsVersion":1}',
    'settings recovery must not overwrite malformed raw data'
  );

  await database.write('raw-key', 'old');
  const journal = new OperationJournal(database);
  await journal.run({
    id: 'same-operation',
    datasetId: namespace.datasetId,
    kind: 'test',
    changes: [{ key: 'raw-key', newValue: 'new' }],
  });
  await journal.run({
    id: 'same-operation',
    datasetId: namespace.datasetId,
    kind: 'test',
    changes: [{ key: 'raw-key', newValue: 'new' }],
  });
  assert(
    (await database.read('raw-key')) === 'new',
    'replaying a committed journal does not duplicate the change'
  );

  const recoveryEntry = {
    id: 'interrupted-operation',
    datasetId: namespace.datasetId,
    kind: 'test',
    status: 'applying',
    changes: [{ key: 'recover-key', oldValue: null, newValue: 'recovered' }],
    createdAt: '2026-08-29T00:00:00.000Z',
    updatedAt: '2026-08-29T00:00:00.000Z',
    error: null,
  };
  await database.write(operationJournalKey(recoveryEntry.id), JSON.stringify(recoveryEntry));
  await database.write(JOURNAL_INDEX_KEY, JSON.stringify([recoveryEntry.id]));
  const report = await journal.recoverUnfinished();
  assert(
    report.recovered.includes(recoveryEntry.id),
    'unfinished journal entries recover on startup'
  );
  assert(
    (await database.read('recover-key')) === 'recovered',
    'journal recovery applies the target state'
  );

  const routine = new RoutineRepository(database, namespace);
  const activeRoutine: ActiveRoutine = {
    id: '66666666-6666-4666-8666-666666666666',
    routineId: '77777777-7777-4777-8777-777777777777',
    routineSnapshot: {
      id: '77777777-7777-4777-8777-777777777777',
      name: 'Focus block',
      steps: [
        {
          id: '88888888-8888-4888-8888-888888888888',
          activityId: activity.id,
          name: 'Focus',
          durationMs: 60_000,
          sortOrder: 0,
          color: null,
          iconName: null,
        },
      ],
      capturedAt: '2026-08-29T03:00:00.000Z',
    },
    status: 'running',
    startedAt: '2026-08-29T03:00:00.000Z',
    pausedAt: null,
    completedAt: null,
    currentStepIndex: 0,
    currentStepStartedAt: '2026-08-29T03:00:00.000Z',
    pausedDurationMs: 0,
    stepSessions: [
      {
        stepId: '88888888-8888-4888-8888-888888888888',
        status: 'active',
        startedAt: '2026-08-29T03:00:00.000Z',
        completedAt: null,
        addedTimeMs: 0,
      },
    ],
  };
  await routine.writeActive(activeRoutine);
  const completedRun: RoutineRunHistory = {
    id: '99999999-9999-4999-8999-999999999999',
    routineId: activeRoutine.routineId,
    routineSnapshot: activeRoutine.routineSnapshot,
    status: 'completed',
    startedAt: activeRoutine.startedAt,
    completedAt: '2026-08-29T04:00:00.000Z',
    durationMs: 3_600_000,
    stepSessions: [
      {
        stepId: '88888888-8888-4888-8888-888888888888',
        status: 'completed',
        startedAt: activeRoutine.startedAt,
        completedAt: '2026-08-29T04:00:00.000Z',
        addedTimeMs: 0,
      },
    ],
  };
  await routine.finalize(activeRoutine, completedRun);
  await routine.finalize(activeRoutine, completedRun);
  assert((await routine.readActive()) === null, 'routine finalization clears the active object');
  assert(
    (await routine.readHistory('2026-08')).runs.length === 1,
    'routine finalization is idempotent'
  );

  await database.write(namespace.key('catalog'), '{"folders":[]}');
  try {
    await catalog.read();
    throw new Error('corrupt catalog should fail validation');
  } catch (error) {
    assert(
      error instanceof PersistenceError && error.category === 'validation',
      'corrupt catalog errors are categorized'
    );
  }
}

run().catch((error: unknown) => {
  throw error;
});
