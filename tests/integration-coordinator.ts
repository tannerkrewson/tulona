import {
  AsyncStorageDatabase,
  CatalogRepository,
  DatasetManager,
  exportRawStorage,
  GLOBAL_METADATA_KEY,
  JOURNAL_INDEX_KEY,
  operationJournalKey,
  PersistenceError,
  type AsyncStorageLike,
} from '../src/data';
import type { CatalogCollection } from '../src/domain';
import {
  BootCoordinator,
  BootCoordinatorError,
  destinationAfterBoot,
} from '../src/orchestration/boot-coordinator';
import { errorText } from '../src/ui/error-text';

const ids = {
  dataset: '11111111-1111-4111-8111-111111111111',
  activity: '22222222-2222-4222-8222-222222222222',
  routine: '33333333-3333-4333-8333-333333333333',
  step: '44444444-4444-4444-8444-444444444444',
};

const nowMs = new Date('2026-08-30T12:00:00.000Z').getTime();

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

  async getAllKeys(): Promise<readonly string[]> {
    return [...this.values.keys()];
  }
}

class NoEnumerationStorage implements AsyncStorageLike {
  private readonly values = new Map<string, string>();

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

async function rejects(
  action: () => Promise<unknown>,
  check: (error: unknown) => void
): Promise<void> {
  try {
    await action();
  } catch (error) {
    check(error);
    return;
  }
  throw new Error('Expected action to reject');
}

async function corruptMetadataRemainsExportable(): Promise<void> {
  const database = new AsyncStorageDatabase(new MemoryStorage());
  const coordinator = new BootCoordinator(database, new DatasetManager(database), {
    now: () => nowMs,
  });
  assert(
    errorText(new PersistenceError('corruption', 'bad metadata')).startsWith('Corruption error:'),
    'persistence categories must remain visible in UI errors'
  );
  await database.write(GLOBAL_METADATA_KEY, '{malformed metadata');

  await rejects(coordinator.hydrate.bind(coordinator), (error) => {
    assert(error instanceof BootCoordinatorError, 'metadata failure must identify the coordinator');
    assert(error.stage === 'metadata', 'metadata failure must identify its boot stage');
    assert(error.category === 'metadata', 'boot failure must retain its persistence category');
  });
  const raw = JSON.parse(await coordinator.exportRawData()) as {
    entries: { key: string; value: string | null }[];
  };
  assert(
    raw.entries.some(
      (entry) => entry.key === GLOBAL_METADATA_KEY && entry.value === '{malformed metadata'
    ),
    'raw export must preserve corrupt metadata verbatim'
  );

  await rejects(
    () => exportRawStorage(new AsyncStorageDatabase(new NoEnumerationStorage())),
    (error) => {
      assert(
        error instanceof PersistenceError,
        'unsupported raw export must report a persistence error'
      );
      assert(error.category === 'read', 'unsupported raw export must report a read failure');
      assert(
        error.message.includes('does not support key enumeration'),
        'unsupported raw export must explain why enumeration is unavailable'
      );
    }
  );
}

function bootRoutingPreservesDeepLinks(): void {
  assert(
    destinationAfterBoot({ kind: 'tabs' }, '/history') === null,
    'boot must preserve a valid history deep link'
  );
  assert(
    destinationAfterBoot({ kind: 'tabs' }, '/folder/folder-id') === null,
    'boot must preserve a valid folder deep link'
  );
  assert(
    destinationAfterBoot({ kind: 'tabs' }, '/(tabs)') === null,
    'boot must not replace an already-resolved tab route'
  );
  assert(
    destinationAfterBoot({ kind: 'tabs' }, '/activity/activity-id') === null,
    'boot must preserve an activity deep link'
  );
  assert(
    destinationAfterBoot({ kind: 'tabs' }, '/') === '/(tabs)',
    'boot must route the root path to the tabs'
  );
  assert(
    destinationAfterBoot({ kind: 'runner', routineId: ids.routine }, '/history') ===
      `/routine/${ids.routine}`,
    'an active routine must override a non-runner deep link'
  );
  assert(
    destinationAfterBoot({ kind: 'chooser' }, '/routine/other') === '/routine-chooser',
    'an awaiting routine must override a non-chooser deep link'
  );
}

async function activeDatasetHydratesInOrder(): Promise<void> {
  const database = new AsyncStorageDatabase(new MemoryStorage());
  const manager = new DatasetManager(database);
  const namespace = await manager.create('Integration dataset', ids.dataset);
  await manager.activate(namespace.datasetId);

  const catalog = new CatalogRepository(database, namespace);
  const catalogValue: CatalogCollection = {
    folders: [],
    activities: [
      {
        id: ids.activity,
        kind: 'activity',
        name: 'Focus',
        folderId: null,
        sortOrder: 0,
        color: '#112233',
        iconName: null,
        createdAt: new Date(nowMs).toISOString(),
        updatedAt: new Date(nowMs).toISOString(),
        archivedAt: null,
      },
    ],
    routines: [
      {
        id: ids.routine,
        kind: 'routine',
        name: 'Focus routine',
        folderId: null,
        sortOrder: 0,
        color: null,
        iconName: null,
        createdAt: new Date(nowMs).toISOString(),
        updatedAt: new Date(nowMs).toISOString(),
        archivedAt: null,
        steps: [
          {
            id: ids.step,
            activityId: ids.activity,
            name: 'Focus step',
            durationMs: 60_000,
            sortOrder: 0,
            color: null,
            iconName: null,
            createdAt: new Date(nowMs).toISOString(),
            updatedAt: new Date(nowMs).toISOString(),
            archivedAt: null,
          },
        ],
      },
    ],
  };
  await catalog.write(catalogValue);

  await database.write('journal-recovery-key', 'old');
  const journalEntry = {
    id: '55555555-5555-4555-8555-555555555555',
    datasetId: namespace.datasetId,
    kind: 'integration-test',
    status: 'applying',
    changes: [{ key: 'journal-recovery-key', oldValue: 'old', newValue: 'new' }],
    createdAt: new Date(nowMs).toISOString(),
    updatedAt: new Date(nowMs).toISOString(),
    error: null,
  };
  await database.write(operationJournalKey(journalEntry.id), JSON.stringify(journalEntry));
  await database.write(JOURNAL_INDEX_KEY, JSON.stringify([journalEntry.id]));

  const coordinator = new BootCoordinator(database, manager, { now: () => nowMs });
  const result = await coordinator.hydrate();
  assert(result.metadataStatus === 'valid', 'active metadata must hydrate as valid');
  assert(
    result.recoveredOperationIds.includes(journalEntry.id),
    'unfinished journal entries must recover before feature hydration'
  );
  assert(
    (await database.read('journal-recovery-key')) === 'new',
    'journal recovery must apply changes'
  );
  assert(result.destination.kind === 'tabs', 'inactive routine state must open normal tabs');
  assert(
    result.runtime?.stores.tracker.getState().catalog?.activities[0]?.id === ids.activity,
    'tracker store must be hydrated'
  );
  assert((await coordinator.hydrate()) === result, 'successful boot result should be reused');

  await result.runtime!.stores.settings.getState().update({
    logicalDayRolloverHour: 3,
    weekStartsOn: 1,
    alarmSettings: { enabled: true, sound: true, volume: 0.25 },
  });
  assert(
    result.runtime!.settings.logicalDayRolloverHour === 3 &&
      result.runtime!.settings.weekStartsOn === 1 &&
      result.runtime!.settings.alarmSettings.volume === 0.25,
    'settings mutations must update the active runtime immediately'
  );
  assert(
    new Date(result.runtime!.stores.tracker.getState().selectedRange.startMs).getHours() === 3,
    'settings mutations must update the authoritative tracker range'
  );
  assert(
    result.runtime!.stores.habits.getState().logicalDayRolloverHour === 3 &&
      result.runtime!.stores.habits.getState().weekStartsOn === 1,
    'settings mutations must update the authoritative habit store'
  );

  const active = await result.runtime!.services.routine.startRoutine(ids.routine);
  assert(active.status === 'running', 'routine start must persist running state');
  const alarm = await result.runtime!.services.routineAlarm.check(active, nowMs + 60_000);
  assert(alarm.reason === 'not-prepared', 'settings mutations must update active alarm behavior');
  await result.runtime!.stores.settings.getState().setRoutineAlarmEnabled(false);
  const disabledAlarm = await result.runtime!.services.routineAlarm.check(active, nowMs + 60_000);
  assert(
    disabledAlarm.reason === 'disabled',
    'disabling alarms must reach the active alarm service'
  );
  await result.runtime!.stores.settings.getState().setRoutineAlarmEnabled(true);
  let resetNotifications = 0;
  const unsubscribeFromReset = coordinator.subscribeToReset(() => {
    resetNotifications += 1;
  });
  coordinator.reset();
  assert(resetNotifications === 1, 'boot reset must notify the mounted gate');
  unsubscribeFromReset();
  const running = await coordinator.hydrate();
  assert(running.destination.kind === 'runner', 'running routine must route to runner');
  assert(
    running.activeRoutine?.routineId === ids.routine,
    'runner route must identify active routine'
  );

  await running.runtime!.services.routine.done(nowMs);
  coordinator.reset();
  const awaiting = await coordinator.hydrate();
  assert(
    awaiting.destination.kind === 'chooser',
    'awaiting routine must route to activity chooser'
  );
}

async function run(): Promise<void> {
  bootRoutingPreservesDeepLinks();
  await corruptMetadataRemainsExportable();
  await activeDatasetHydratesInOrder();
}

run().catch((error: unknown) => {
  throw error;
});
