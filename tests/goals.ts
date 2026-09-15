import {
  AsyncStorageDatabase,
  createDatasetManager,
  createGoalRepository,
  type AsyncStorageLike,
} from '../src/data';
import { GoalService, createGoalService } from '../src/goals';
import {
  DEFAULT_GOAL_STATUS_DEFINITIONS,
  activitySchema,
  goalSchema,
  goalWeekIdentity,
  type Goal,
  type GoalStatusDefinition,
} from '../src/domain';

const ids = {
  dataset: '11111111-1111-4111-8111-111111111111',
  activity: '22222222-2222-4222-8222-222222222222',
  habit: '33333333-3333-4333-8333-333333333333',
  first: '44444444-4444-4444-8444-444444444444',
  future: '55555555-5555-4555-8555-555555555555',
  completed: '66666666-6666-4666-8666-666666666666',
  gaveUp: '77777777-7777-4777-8777-777777777777',
  customStatus: '88888888-8888-4888-8888-888888888888',
  usedStatus: '99999999-9999-4999-8999-999999999999',
};

const now = '2026-09-16T12:00:00.000Z';
const currentWeekDate = new Date(2026, 8, 16, 12, 0, 0, 0);
const previousWeekDate = new Date(2026, 8, 9, 12, 0, 0, 0);

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

function serviceFor(repository: ReturnType<typeof createGoalRepository>): GoalService {
  return createGoalService(repository, {
    now: () => now,
    rolloverHour: 0,
    weekStartsOn: 1,
  });
}

function baseGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: ids.first,
    title: 'A goal',
    description: null,
    sourceLinks: [],
    overallStatus: 'in-progress',
    evaluationMode: 'manual',
    rules: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function run(): Promise<void> {
  const weekIdentity = goalWeekIdentity(currentWeekDate, { weekStartsOn: 1 });
  assert(weekIdentity.weekStart === '2026-09-14', 'Monday week identity must start on Monday');
  assert(weekIdentity.weekEnd === '2026-09-20', 'week identity must include six following days');
  assert(
    goalWeekIdentity(previousWeekDate, { weekStartsOn: 1 }).weekStart === '2026-09-07',
    'historical dates must resolve to their own canonical week'
  );
  assert(
    goalWeekIdentity(new Date(2026, 8, 14, 1, 59), {
      weekStartsOn: 1,
      rolloverHour: 2,
    }).weekStart === '2026-09-07',
    'dates before rollover belong to the preceding logical week'
  );
  assert(
    goalWeekIdentity(new Date(2026, 8, 14, 2, 0), {
      weekStartsOn: 1,
      rolloverHour: 2,
    }).weekStart === '2026-09-14',
    'dates at rollover belong to the new logical week'
  );

  const ordinaryActivity = {
    id: ids.activity,
    kind: 'activity' as const,
    name: 'Focus',
    folderId: null,
    sortOrder: 0,
    color: null,
    iconName: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
  assert(activitySchema.safeParse(ordinaryActivity).success, 'ordinary activities remain valid');
  assert(
    !activitySchema.safeParse({ ...ordinaryActivity, unsupportedGoalField: null }).success,
    'activities must not accept fields from the removed goal feature'
  );
  assert(
    !goalSchema.safeParse({ ...baseGoal(), color: '#123456' }).success,
    'goals must not persist a custom color field'
  );
  assert(
    !goalSchema.safeParse({ ...baseGoal(), title: '   ' }).success,
    'goals must reject whitespace-only titles'
  );
  const migratedGoal = goalSchema.safeParse({
    ...baseGoal(),
    evaluationMode: undefined,
    rules: undefined,
  });
  assert(
    migratedGoal.success &&
      migratedGoal.data.evaluationMode === 'manual' &&
      migratedGoal.data.rules.length === 0,
    'goals written before automatic evaluation must default to manual with no rules'
  );

  const database = new AsyncStorageDatabase(new MemoryStorage());
  const datasetManager = createDatasetManager(database);
  const namespace = await datasetManager.create('Goals test dataset', ids.dataset);
  const repository = createGoalRepository(database, namespace);
  const service = serviceFor(repository);

  const freshSettings = await service.readSettings();
  assert(freshSettings.reviewDay === 0, 'fresh goals must have a defined Sunday review day');
  assert(
    freshSettings.statusDefinitions.length === 4,
    'fresh goals must seed four global status definitions'
  );
  assert(
    freshSettings.statusDefinitions.every(
      (definition, index) =>
        definition.name === DEFAULT_GOAL_STATUS_DEFINITIONS[index]?.name &&
        definition.color === DEFAULT_GOAL_STATUS_DEFINITIONS[index]?.color &&
        definition.sortOrder === index
    ),
    'fresh goals must seed the ordered green/yellow/red/light-grey defaults'
  );
  assert(
    (await database.read(namespace.key('goal-settings'))) !== null,
    'fresh goal settings must be persisted in the active dataset'
  );
  await rejects(
    () =>
      repository.writeSettings({
        ...freshSettings,
        statusDefinitions: freshSettings.statusDefinitions.map((definition) => ({
          ...definition,
          sortOrder: definition.sortOrder + 1,
        })),
      }),
    'status settings must reject non-contiguous sort orders'
  );

  const first = await service.createGoal({
    id: ids.first,
    title: '  Finish a meaningful project  ',
    description: '  A description  ',
    sourceLinks: [
      { kind: 'activity', id: ids.activity },
      { kind: 'habit', id: ids.habit },
    ],
  });
  assert(first.title === 'Finish a meaningful project', 'goal titles must be normalized');
  assert(first.description === 'A description', 'goal descriptions must be normalized');
  assert(first.overallStatus === 'in-progress', 'new goals default to in-progress');
  assert(
    first.evaluationMode === 'manual' && first.rules.length === 0,
    'new goals default to manual evaluation'
  );
  assert(first.sourceLinks.length === 2, 'goal source links must round-trip in the domain');
  const reloadedFirst = await serviceFor(createGoalRepository(database, namespace)).getGoal(
    ids.first
  );
  assert(
    reloadedFirst.title === first.title && reloadedFirst.sourceLinks.length === 2,
    'new goals must round-trip through the real database'
  );

  await rejects(
    () => service.createGoal({ title: 'Has an unsupported color', color: '#123456' } as never),
    'creating a custom-colored goal must be rejected'
  );
  await rejects(
    () =>
      service.createGoal({
        title: 'Duplicate source',
        sourceLinks: [
          { kind: 'activity', id: ids.activity },
          { kind: 'activity', id: ids.activity },
        ],
      }),
    'duplicate goal source links must be rejected'
  );

  const future = await service.createGoal({
    id: ids.future,
    title: 'Future goal',
    overallStatus: 'future',
  });
  const completed = await service.createGoal({
    id: ids.completed,
    title: 'Completed goal',
    overallStatus: 'completed',
  });
  const gaveUp = await service.createGoal({
    id: ids.gaveUp,
    title: 'Gave up goal',
    overallStatus: 'gave-up',
  });
  assert((await service.listGoals('in-progress')).length === 1, 'in-progress filtering must work');
  assert((await service.listGoals('future')).length === 1, 'future filtering must work');
  assert((await service.listGoals('completed')).length === 1, 'completed filtering must work');
  assert((await service.listGoals('gave-up')).length === 1, 'gave-up filtering must work');
  assert((await service.listGoals('all')).length === 4, 'all filtering must return every goal');

  const updated = await service.updateGoal(first.id, {
    title: '  Finish the meaningful project  ',
    description: null,
    overallStatus: 'in-progress',
  });
  assert(
    updated.title === 'Finish the meaningful project',
    'goal edits must persist title changes'
  );
  assert(updated.description === null, 'goal edits must persist description changes');

  const custom = await service.createStatusDefinition({
    id: ids.customStatus,
    name: '  Needs review  ',
    color: 'light-grey',
  });
  assert(custom.name === 'Needs review', 'status names must be normalized');
  const renamed = await service.updateStatusDefinition(custom.id, {
    name: 'Review later',
    color: 'yellow',
  });
  assert(
    renamed.name === 'Review later' && renamed.color === 'yellow',
    'status edits must persist'
  );
  const reordered = await service.reorderStatusDefinitions([
    custom.id,
    ...freshSettings.statusDefinitions.map((definition) => definition.id),
  ]);
  assert(
    reordered[0]?.id === custom.id &&
      reordered.every((definition, index) => definition.sortOrder === index),
    'status definitions must be reorderable with normalized sort orders'
  );
  await rejects(
    () => service.reorderStatusDefinitions([custom.id, custom.id]),
    'status reorder must reject duplicate or incomplete IDs'
  );
  await service.deleteStatusDefinition(custom.id);
  assert(
    !(await service.readSettings()).statusDefinitions.some(
      (definition) => definition.id === custom.id
    ),
    'unused status definitions must be deletable'
  );

  const used = await service.createStatusDefinition({
    id: ids.usedStatus,
    name: 'Used status',
    color: 'red',
  });
  const currentDefault = (await service.readSettings())
    .statusDefinitions[0] as GoalStatusDefinition;
  const currentStatus = await service.setWeeklyStatus({
    goalId: first.id,
    weekStart: currentWeekDate,
    statusId: used.id,
    note: '  Current note  ',
  });
  assert(
    currentStatus.weekStart === weekIdentity.weekStart && currentStatus.note === 'Current note',
    'weekly status writes must use the canonical week and normalize notes'
  );
  await service.setWeeklyStatus({
    goalId: first.id,
    weekStart: currentWeekDate,
    statusId: currentDefault.id,
    note: 'Updated note',
  });
  await service.setWeeklyStatus({
    goalId: first.id,
    weekStart: previousWeekDate,
    statusId: currentDefault.id,
    note: null,
  });
  const currentWeek = await service.readWeek(new Date(2026, 8, 18, 12));
  assert(
    currentWeek.weekStart === weekIdentity.weekStart &&
      currentWeek.statuses.length === 1 &&
      currentWeek.statuses[0]?.note === 'Updated note' &&
      currentWeek.statuses[0]?.statusId === currentDefault.id,
    'one status per goal/week must be editable in place'
  );
  const historicalWeeks = await repository.readWeeks();
  assert(
    historicalWeeks.length === 2 &&
      historicalWeeks.some((week) => week.weekStart === '2026-09-07') &&
      historicalWeeks.some((week) => week.weekStart === '2026-09-14'),
    'weekly status history must persist separate canonical weeks'
  );
  await service.updateSettings({ reviewDay: 3 });
  assert((await service.readSettings()).reviewDay === 3, 'review day must be configurable');
  await rejects(
    () => service.updateSettings({ reviewDay: 7 }),
    'review day must reject values outside the week'
  );
  await rejects(
    () => service.deleteStatusDefinition(currentDefault.id),
    'status definitions used by weekly history must not be deleted'
  );

  await service.deleteGoal(future.id);
  assert((await service.listGoals('all')).length === 3, 'goal deletion must remove the goal');
  await service.deleteGoal(first.id);
  assert(
    (await repository.readWeek(weekIdentity.weekStart)).statuses.length === 0 &&
      (await repository.readWeek(goalWeekIdentity(previousWeekDate, { weekStartsOn: 1 }).weekStart))
        .statuses.length === 0,
    'goal deletion must remove its weekly status history'
  );
  await rejects(() => service.getGoal(first.id), 'deleted goals must not be readable');
  assert(
    (await service.getGoal(completed.id)).overallStatus === 'completed' &&
      (await service.getGoal(gaveUp.id)).overallStatus === 'gave-up',
    'unrelated goals must survive another goal deletion'
  );

  await rejects(
    () => repository.write({ goals: [baseGoal(), baseGoal()] }),
    'the repository must reject duplicate goal identities'
  );
  await rejects(
    () =>
      repository.writeWeek({
        weekStart: weekIdentity.weekStart,
        statuses: [currentStatus, currentStatus],
      }),
    'the repository must reject duplicate weekly statuses for one goal'
  );

  console.log(
    'Validated weekly goal identity, schema boundaries, defaults, CRUD, global statuses, history, filtering, and real persistence.'
  );
}

run().catch((error: unknown) => {
  throw error;
});
