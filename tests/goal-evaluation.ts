import { AsyncStorageDatabase, createDatasetManager, createGoalRepository } from '../src/data';
import {
  dateForLogicalDay,
  goalWeekIdentity,
  materializeIntervals,
  toTimestamp,
  type Goal,
  type GoalEvaluationRule,
  type GoalRuleStatusIds,
  type Habit,
  type HabitDayState,
  type TimeInterval,
  type Transition,
} from '../src/domain';
import { createGoalService } from '../src/goals';
import { evaluateGoal } from '../src/goals/goal-evaluator';

const ids = {
  dataset: '11111111-1111-4111-8111-111111111111',
  habit: '22222222-2222-4222-8222-222222222222',
  otherHabit: '33333333-3333-4333-8333-333333333333',
  activity: '44444444-4444-4444-8444-444444444444',
  otherActivity: '55555555-5555-4555-8555-555555555555',
  goal: '66666666-6666-4666-8666-666666666666',
  good: '77777777-7777-4777-8777-777777777777',
  partial: '88888888-8888-4888-8888-888888888888',
  noProgress: '99999999-9999-4999-8999-999999999999',
  customGood: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  customPartial: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  customNoProgress: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  transitionStart: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  transitionStop: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
};

const now = '2026-09-16T12:00:00.000Z';
const statusIds: GoalRuleStatusIds = {
  good: ids.good,
  partial: ids.partial,
  noProgress: ids.noProgress,
};

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

function dayAt(logicalDay: string, hour = 12, rolloverHour = 0): number {
  const date = dateForLogicalDay(logicalDay as HabitDayState['logicalDay'], rolloverHour);
  date.setHours(hour, 0, 0, 0);
  return date.getTime();
}

function habit(id: string, schedule: Habit['schedule'] = { kind: 'daily' }): Habit {
  return {
    id,
    name: id,
    sortOrder: 0,
    schedule,
    trigger: null,
    description: null,
    color: null,
    iconName: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
}

function state(
  habitId: string,
  logicalDay: string,
  outcome: HabitDayState['outcome'] = 'done'
): HabitDayState {
  return {
    habitId,
    logicalDay: logicalDay as HabitDayState['logicalDay'],
    manual: outcome === 'done',
    automatic: null,
    outcome,
    updatedAt: `${logicalDay}T12:00:00.000Z`,
  };
}

function goal(
  rules: GoalEvaluationRule[],
  evaluationMode: Goal['evaluationMode'] = 'automatic'
): Pick<Goal, 'evaluationMode' | 'rules'> {
  return { evaluationMode, rules };
}

function habitRule(
  measurement: Extract<GoalEvaluationRule, { kind: 'habit' }>['measurement'],
  overrides: Partial<Extract<GoalEvaluationRule, { kind: 'habit' }>> = {}
): Extract<GoalEvaluationRule, { kind: 'habit' }> {
  return {
    kind: 'habit',
    habitId: ids.habit,
    measurement,
    ...(measurement === 'completed-days' ? { targetCount: 2 } : {}),
    statusIds,
    ...overrides,
  };
}

function activityRule(
  comparison: Extract<GoalEvaluationRule, { kind: 'activity-duration' }>['comparison'],
  overrides: Partial<Extract<GoalEvaluationRule, { kind: 'activity-duration' }>> = {}
): Extract<GoalEvaluationRule, { kind: 'activity-duration' }> {
  return {
    kind: 'activity-duration',
    activityId: ids.activity,
    comparison,
    targetMs: 10_000,
    statusIds,
    ...overrides,
  };
}

function interval(activityId: string, startMs: number, durationMs: number): TimeInterval {
  return {
    startMs,
    endMs: startMs + durationMs,
    activityId,
    transitionId: ids.transitionStart,
  };
}

function transition(id: string, activityId: string | null, timestampMs: number): Transition {
  const timestamp = toTimestamp(timestampMs);
  return {
    id,
    activityId,
    timestamp,
    source: 'manual',
    status: 'recorded',
    createdAt: timestamp,
    correctionOfId: null,
    note: null,
  };
}

async function servicePersistenceChecks(): Promise<void> {
  const storage = new Map<string, string>();
  const database = new AsyncStorageDatabase({
    async getItem(key) {
      return storage.get(key) ?? null;
    },
    async setItem(key, value) {
      storage.set(key, value);
    },
    async removeItem(key) {
      storage.delete(key);
    },
    async getAllKeys() {
      return [...storage.keys()];
    },
  });
  const datasetManager = createDatasetManager(database);
  const namespace = await datasetManager.create('Goal evaluator test dataset', ids.dataset);
  const repository = createGoalRepository(database, namespace);
  const service = createGoalService(repository, { now: () => now, weekStartsOn: 1 });
  const settings = await service.readSettings();
  const customSettings = await service.createStatusDefinition({
    id: ids.customGood,
    name: 'Custom good',
  });
  await service.createStatusDefinition({ id: ids.customPartial, name: 'Custom partial' });
  await service.createStatusDefinition({ id: ids.customNoProgress, name: 'Custom no progress' });

  const automatic = await service.createGoal({
    id: ids.goal,
    title: 'Limit gaming',
    evaluationMode: 'automatic',
    rules: [
      {
        kind: 'activity-duration',
        activityId: ids.activity,
        comparison: 'at-most',
        targetMs: 3_600_000,
        statusIds: {
          good: customSettings.id,
          partial: ids.customPartial,
          noProgress: ids.customNoProgress,
        },
      },
    ],
  });
  assert(
    automatic.evaluationMode === 'automatic' && automatic.rules.length === 1,
    'automatic rules must persist'
  );
  assert(
    (await service.getGoal(ids.goal)).rules[0]?.statusIds.good === ids.customGood,
    'custom global status IDs must round-trip on rules'
  );
  await rejects(
    () =>
      service.createGoal({
        title: 'Invalid status mapping',
        evaluationMode: 'automatic',
        rules: [
          activityRule('at-least', {
            statusIds: {
              good: ids.customGood,
              partial: ids.customPartial,
              noProgress: ids.activity,
            },
          }),
        ],
      }),
    'automatic rules must reject status IDs absent from global definitions'
  );
  assert(
    settings.statusDefinitions.length === 4,
    'goal evaluator persistence uses existing global statuses'
  );
}

async function run(): Promise<void> {
  const week = goalWeekIdentity('2026-09-14', { weekStartsOn: 1 });
  const currentNow = dayAt('2026-09-16');
  const historicalWeek = goalWeekIdentity('2026-09-07', { weekStartsOn: 1 });

  const manual = evaluateGoal(goal([habitRule('completed-days')], 'manual'), week, {
    habits: [habit(ids.habit)],
  });
  assert(
    manual.outcome === 'manual' && manual.statusId === null,
    'manual goals must never auto-evaluate'
  );
  const noRules = evaluateGoal(
    goal([], 'automatic'),
    week,
    {},
    { now: currentNow, weekStartsOn: 1 }
  );
  assert(
    noRules.outcome === 'no-rules' && noRules.statusId === null,
    'automatic goals without rules are deterministic'
  );

  const beforeRollover = evaluateGoal(
    goal([habitRule('completed-days')]),
    new Date(2026, 8, 14, 1, 59),
    {},
    { rolloverHour: 2, weekStartsOn: 1, now: currentNow }
  );
  const atRollover = evaluateGoal(
    goal([habitRule('completed-days')]),
    new Date(2026, 8, 14, 2, 0),
    {},
    { rolloverHour: 2, weekStartsOn: 1, now: currentNow }
  );
  assert(
    beforeRollover.week.weekStart === '2026-09-07' && atRollover.week.weekStart === '2026-09-14',
    'evaluation must use canonical week boundaries and rollover settings'
  );

  const scheduledHabit = habit(ids.habit, { kind: 'weekly', daysOfWeek: [1, 3, 5] });
  const scheduledPartial = evaluateGoal(
    goal([habitRule('completed-days', { targetCount: 2 })]),
    week,
    {
      habits: [scheduledHabit],
      habitStates: [state(ids.habit, '2026-09-14')],
    },
    { now: currentNow, weekStartsOn: 1 }
  );
  assert(
    scheduledPartial.outcome === 'partial' && scheduledPartial.rules[0]?.measuredValue === 1,
    'completed-day rules count only completed scheduled days'
  );
  const scheduledGood = evaluateGoal(
    goal([habitRule('completed-days', { targetCount: 2 })]),
    week,
    {
      habits: [scheduledHabit],
      habitStates: [state(ids.habit, '2026-09-14'), state(ids.habit, '2026-09-16')],
    },
    { now: currentNow, weekStartsOn: 1 }
  );
  assert(scheduledGood.outcome === 'good', 'completed-day target boundaries must be inclusive');

  const unfinishedEveryDay = evaluateGoal(
    goal([habitRule('no-skipped')]),
    week,
    {
      habits: [habit(ids.habit)],
      habitStates: [state(ids.habit, '2026-09-14'), state(ids.habit, '2026-09-15')],
    },
    { now: currentNow }
  );
  assert(
    unfinishedEveryDay.outcome === 'good' && unfinishedEveryDay.rules[0]?.consideredPeriods === 2,
    'unfinished current logical days must not be treated as skipped'
  );
  const skippedHistorical = evaluateGoal(
    goal([habitRule('every-day')]),
    historicalWeek,
    {
      habits: [habit(ids.habit)],
      habitStates: [
        ...['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12'].map(
          (day) => state(ids.habit, day)
        ),
        state(ids.habit, '2026-09-13', 'skipped'),
      ],
    },
    { now: currentNow }
  );
  assert(
    skippedHistorical.outcome === 'partial' && skippedHistorical.rules[0]?.measuredValue === 6,
    'historical every-day rules must include all seven days and expose skipped progress'
  );

  const atLeast = evaluateGoal(
    goal([activityRule('at-least')]),
    week,
    {
      intervals: [interval(ids.activity, week.startMs, 10_000)],
      activityIds: [ids.activity],
    },
    { now: currentNow }
  );
  const belowAtLeast = evaluateGoal(
    goal([activityRule('at-least')]),
    week,
    {
      intervals: [interval(ids.activity, week.startMs, 9_999)],
      activityIds: [ids.activity],
    },
    { now: currentNow }
  );
  assert(atLeast.outcome === 'good', 'at-least duration targets must include the exact boundary');
  assert(
    belowAtLeast.outcome === 'partial',
    'positive duration below an at-least target is partial'
  );

  const atMostGood = evaluateGoal(
    goal([activityRule('at-most', { targetMs: 10_000 })]),
    week,
    {
      intervals: [interval(ids.activity, week.startMs, 10_000)],
      activityIds: [ids.activity],
    },
    { now: currentNow }
  );
  const atMostPartial = evaluateGoal(
    goal([activityRule('at-most', { targetMs: 10_000, baselineMs: 20_000 })]),
    week,
    {
      intervals: [interval(ids.activity, week.startMs, 15_000)],
      activityIds: [ids.activity],
    },
    { now: currentNow }
  );
  const atMostNoProgress = evaluateGoal(
    goal([activityRule('at-most')]),
    week,
    {
      intervals: [interval(ids.activity, week.startMs, 10_001)],
      activityIds: [ids.activity],
    },
    { now: currentNow }
  );
  assert(atMostGood.outcome === 'good', 'at-most duration targets must include the exact boundary');
  assert(
    atMostPartial.outcome === 'partial',
    'at-most rules support partial reductions from a baseline'
  );
  assert(
    atMostNoProgress.outcome === 'no-progress',
    'exceeding an at-most target is deterministic'
  );

  const materialized = materializeIntervals(
    [
      transition(ids.transitionStart, ids.activity, historicalWeek.startMs - 1_000),
      transition(ids.transitionStop, null, historicalWeek.startMs + 8_000),
    ],
    { startMs: historicalWeek.startMs, endMs: historicalWeek.endMs, nowMs: currentNow }
  );
  const historicalDuration = evaluateGoal(
    goal([activityRule('at-least', { targetMs: 8_000 })]),
    historicalWeek,
    { intervals: materialized, activityIds: [ids.activity] },
    { now: currentNow }
  );
  assert(
    historicalDuration.outcome === 'good' && historicalDuration.rules[0]?.measuredValue === 8_000,
    'historical duration rules must use materialized history through the week boundary'
  );

  const customMappings: GoalEvaluationRule[] = [
    activityRule('at-least', {
      targetMs: 1_000,
      statusIds: {
        good: ids.customGood,
        partial: ids.customPartial,
        noProgress: ids.customNoProgress,
      },
    }),
    activityRule('at-least', {
      activityId: ids.otherActivity,
      targetMs: 1_000,
      statusIds: {
        good: ids.customGood,
        partial: ids.customPartial,
        noProgress: ids.customNoProgress,
      },
    }),
  ];
  const multipleRules = evaluateGoal(
    goal(customMappings),
    week,
    {
      intervals: [interval(ids.activity, week.startMs, 1_000)],
      activityIds: [ids.activity, ids.otherActivity],
    },
    { now: currentNow }
  );
  assert(
    multipleRules.outcome === 'no-progress' && multipleRules.statusId === ids.customNoProgress,
    'multiple rules must select the worst outcome and that rule’s configured custom status ID'
  );

  const missing = evaluateGoal(
    goal([
      habitRule('completed-days'),
      activityRule('at-most', { targetMs: 0, activityId: ids.otherActivity }),
    ]),
    week,
    { habits: [], activityIds: [ids.activity], intervals: [] },
    { now: currentNow }
  );
  assert(
    missing.rules.every((rule) => rule.outcome === 'no-progress') &&
      missing.statusId === ids.noProgress,
    'missing habit and activity sources must be no-progress instead of silently passing'
  );

  await servicePersistenceChecks();
  console.log(
    'Validated goal evaluator boundaries, unfinished and historical weeks, daily/no-skipped habits, activity limits, precedence, custom statuses, missing sources, and persistence.'
  );
}

run().catch((error: unknown) => {
  throw error;
});
