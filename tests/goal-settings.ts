import {
  AsyncStorageDatabase,
  createDatasetManager,
  createGoalRepository,
  type AsyncStorageLike,
} from '../src/data';
import { createGoalService } from '../src/goals';
import {
  DEFAULT_GOAL_HISTORICAL_CIRCLE_COUNT,
  DEFAULT_GOAL_STATUS_DEFINITIONS,
  MAX_GOAL_HISTORICAL_CIRCLE_COUNT,
  MIN_GOAL_HISTORICAL_CIRCLE_COUNT,
  goalSettingsSchema,
} from '../src/domain';

const ids = {
  dataset: '11111111-1111-4111-8111-111111111111',
  goal: '22222222-2222-4222-8222-222222222222',
  custom: '33333333-3333-4333-8333-333333333333',
  used: '44444444-4444-4444-8444-444444444444',
};

const now = '2026-09-16T12:00:00.000Z';

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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function rejects(action: () => Promise<unknown>, message: string): Promise<void> {
  try {
    await action();
  } catch {
    return;
  }
  throw new Error(message);
}

async function run(): Promise<void> {
  const database = new AsyncStorageDatabase(new MemoryStorage());
  const namespace = await createDatasetManager(database).create('Goal settings test', ids.dataset);
  const repository = createGoalRepository(database, namespace);
  const service = createGoalService(repository, { now: () => now, weekStartsOn: 1 });

  const fresh = await service.readSettings();
  assert(
    fresh.historicalCircleCount === DEFAULT_GOAL_HISTORICAL_CIRCLE_COUNT,
    'fresh goal settings must default to eight historical circles'
  );
  assert(
    fresh.statusDefinitions.length === DEFAULT_GOAL_STATUS_DEFINITIONS.length &&
      fresh.statusDefinitions.every(
        (definition, index) =>
          definition.name === DEFAULT_GOAL_STATUS_DEFINITIONS[index]?.name &&
          definition.color === DEFAULT_GOAL_STATUS_DEFINITIONS[index]?.color &&
          definition.sortOrder === index
      ),
    'fresh goal settings must seed the four semantic status definitions'
  );
  const persistedFreshSettings = await database.read(namespace.key('goal-settings'));
  assert(
    persistedFreshSettings !== null &&
      JSON.parse(persistedFreshSettings).historicalCircleCount ===
        DEFAULT_GOAL_HISTORICAL_CIRCLE_COUNT,
    'fresh goal settings must persist the default circle count in the active dataset'
  );

  assert(
    goalSettingsSchema.safeParse(fresh).success,
    'goal settings with the default circle count must satisfy the schema'
  );
  assert(
    !goalSettingsSchema.safeParse({ ...fresh, historicalCircleCount: 0 }).success &&
      !goalSettingsSchema.safeParse({
        ...fresh,
        historicalCircleCount: MAX_GOAL_HISTORICAL_CIRCLE_COUNT + 1,
      }).success &&
      !goalSettingsSchema.safeParse({ ...fresh, historicalCircleCount: 1.5 }).success,
    'historical circle counts outside the bounded integer range must fail schema validation'
  );
  assert(
    goalSettingsSchema.safeParse({
      ...fresh,
      historicalCircleCount: MIN_GOAL_HISTORICAL_CIRCLE_COUNT,
    }).success &&
      goalSettingsSchema.safeParse({
        ...fresh,
        historicalCircleCount: MAX_GOAL_HISTORICAL_CIRCLE_COUNT,
      }).success,
    'the configured historical circle count range must include both bounds'
  );

  const updated = await service.updateSettings({
    reviewDay: 4,
    historicalCircleCount: MAX_GOAL_HISTORICAL_CIRCLE_COUNT,
  });
  assert(
    updated.reviewDay === 4 && updated.historicalCircleCount === 52,
    'goal settings updates must persist review day and circle count together'
  );
  const reloaded = await createGoalService(repository).readSettings();
  assert(
    reloaded.reviewDay === 4 && reloaded.historicalCircleCount === 52,
    'goal settings must round-trip through a newly created service'
  );
  await rejects(
    () => service.updateSettings({ historicalCircleCount: MIN_GOAL_HISTORICAL_CIRCLE_COUNT - 1 }),
    'goal settings must reject a circle count below the minimum'
  );

  const custom = await service.createStatusDefinition({
    id: ids.custom,
    name: 'Needs review',
    color: 'green',
  });
  const renamed = await service.updateStatusDefinition(custom.id, {
    name: 'Review later',
    color: 'red',
  });
  assert(
    renamed.name === 'Review later' && renamed.color === 'red',
    'status definitions must support renaming and recoloring'
  );
  const reordered = await service.reorderStatusDefinitions([
    custom.id,
    ...fresh.statusDefinitions.map((definition) => definition.id),
  ]);
  assert(
    reordered[0]?.id === custom.id &&
      reordered.every((definition, index) => definition.sortOrder === index),
    'status definitions must support complete reordering'
  );
  await service.deleteStatusDefinition(custom.id);
  assert(
    !(await service.readSettings()).statusDefinitions.some(
      (definition) => definition.id === custom.id
    ),
    'unused custom statuses must be deletable'
  );

  await rejects(
    () => repository.writeSettings({ ...fresh, statusDefinitions: [] }),
    'goal settings must retain at least one status definition'
  );
  const goal = await service.createGoal({ id: ids.goal, title: 'Review weekly progress' });
  const used = await service.createStatusDefinition({
    id: ids.used,
    name: 'Used status',
    color: 'yellow',
  });
  await service.setWeeklyStatus({
    goalId: goal.id,
    weekStart: new Date(2026, 8, 16, 12),
    statusId: used.id,
  });
  await rejects(
    () => service.deleteStatusDefinition(used.id),
    'statuses referenced by weekly history must not be deleted'
  );

  console.log('Validated persisted goal settings, status management, bounds, and history safety.');
}

run().catch((error: unknown) => {
  throw error;
});
