import {
  AsyncStorageDatabase,
  createCatalogRepository,
  createDatasetManager,
  createHabitRepository,
  createSettingsRepository,
  PersistenceError,
} from '../src/data';
import { createCatalogService } from '../src/catalog/catalog-service';
import { createHabitService } from '../src/habits/habit-service';
import { createOnboardingService } from '../src/onboarding/onboarding-service';
import { createSettingsService, DEFAULT_SETTINGS } from '../src/settings/settings-service';
import { createSettingsStore } from '../src/settings/settings-store';
import type { AsyncStorageLike } from '../src/data';

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

async function assertRejects(action: () => Promise<unknown>, message: string): Promise<void> {
  try {
    await action();
  } catch {
    return;
  }
  throw new Error(message);
}

async function createServices(
  database: AsyncStorageDatabase,
  manager: ReturnType<typeof createDatasetManager>
) {
  const namespace = await manager.create('Starter test', '11111111-1111-4111-8111-111111111111');
  await manager.activate(namespace.datasetId);
  const catalogService = createCatalogService(createCatalogRepository(database, namespace));
  return {
    catalogService,
    habitService: createHabitService(createHabitRepository(database, namespace), {
      catalog: catalogService,
    }),
    namespace,
  };
}

async function run(): Promise<void> {
  const database = new AsyncStorageDatabase(new MemoryStorage());
  const manager = createDatasetManager(database);
  const services = await createServices(database, manager);
  const settingsService = createSettingsService(
    createSettingsRepository(database, services.namespace)
  );

  const defaults = await settingsService.read();
  assert(defaults.logicalDayRolloverHour === 0, 'settings default to midnight');
  assert(defaults.appearance === 'system', 'settings default to system appearance');
  assert(defaults.minimumActivityDurationMs === 0, 'short activity filtering defaults to off');
  await settingsService.setLogicalDayRolloverHour(3);
  await settingsService.setWeekStartsOn(1);
  await settingsService.setRoutineAlarmEnabled(true);
  await settingsService.setRoutineAlarmVolume(0.5);
  await settingsService.setShowArchived(true);
  await settingsService.setMinimumActivityDurationMs(5000);
  const updated = await settingsService.read();
  assert(updated.logicalDayRolloverHour === 3, 'settings service persists rollover changes');
  assert(updated.weekStartsOn === 1, 'settings service persists week-start changes');
  assert(
    updated.alarmSettings.enabled && updated.alarmSettings.volume === 0.5,
    'alarm settings persist'
  );
  assert(updated.showArchived, 'settings service persists archived visibility');
  assert(updated.minimumActivityDurationMs === 5000, 'minimum activity duration persists');
  await assertRejects(
    () => settingsService.setLogicalDayRolloverHour(24),
    'invalid rollover values must be rejected before a write'
  );

  const store = createSettingsStore(settingsService);
  await store.getState().hydrate();
  await store.getState().setAppearance('dark');
  assert(
    store.getState().settings?.appearance === 'dark',
    'store reloads after durable settings writes'
  );
  assert(store.getState().persistenceError === null, 'successful settings writes clear errors');

  const failingService = createSettingsService({
    read: async () => DEFAULT_SETTINGS,
    readWithRecovery: async () => ({ settings: DEFAULT_SETTINGS, status: 'valid' as const }),
    write: async () => {
      throw new PersistenceError('write', 'settings write failed');
    },
  });
  const failingStore = createSettingsStore(failingService);
  await failingStore.getState().hydrate();
  await assertRejects(
    () => failingStore.getState().setShowArchived(true),
    'settings store must expose durable write failures'
  );
  assert(
    failingStore.getState().persistenceError?.message === 'settings write failed',
    'settings write errors remain visible'
  );

  const emptyDatabase = new AsyncStorageDatabase(new MemoryStorage());
  const emptyManager = createDatasetManager(emptyDatabase);
  let createdServiceCount = 0;
  const emptyOnboarding = createOnboardingService(emptyManager, {
    createServices: async () => {
      createdServiceCount += 1;
      throw new Error('starter services should not be called for an empty start');
    },
  });
  assert(
    (await emptyOnboarding.status()) === 'needs-choice',
    'new devices need an explicit onboarding choice'
  );
  const emptyResult = await emptyOnboarding.startEmpty();
  assert(emptyResult.starterData === null, 'empty onboarding adds no starter records');
  assert(createdServiceCount === 0, 'empty onboarding does not construct starter services');
  assert((await emptyOnboarding.status()) === 'complete', 'empty onboarding activates a workspace');

  const starterDatabase = new AsyncStorageDatabase(new MemoryStorage());
  const starterManager = createDatasetManager(starterDatabase);
  const starterOnboarding = createOnboardingService(starterManager, {
    createServices: async (namespace) => {
      const catalogService = createCatalogService(
        createCatalogRepository(starterDatabase, namespace)
      );
      return {
        catalogService,
        habitService: createHabitService(createHabitRepository(starterDatabase, namespace), {
          catalog: catalogService,
        }),
      };
    },
  });
  const firstStarter = await starterOnboarding.startWithStarterData();
  assert(
    firstStarter.starterData?.createdFolders === 6,
    'starter setup creates six category folders'
  );
  assert(
    firstStarter.starterData?.createdActivities === 8,
    'starter setup creates the listed activities'
  );
  assert(
    firstStarter.starterData?.createdHabits === 3,
    'starter setup creates editable starter habits'
  );
  const secondStarter = await starterOnboarding.startWithStarterData();
  assert(
    secondStarter.starterData?.createdFolders === 0 &&
      secondStarter.starterData.createdActivities === 0 &&
      secondStarter.starterData.createdHabits === 0,
    'repeating starter setup is idempotent'
  );
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
