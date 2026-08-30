import {
  HabitService,
  HabitReconciliationService,
  HabitTriggerEvaluator,
  evaluateHabitTrigger,
  evaluateHabitSchedule,
  calculateHabitStreak,
  isHabitScheduledDay,
} from '../src/habits';
import type {
  Activity,
  CatalogCollection,
  Habit,
  HabitDayState,
  HabitMonthCollection,
  MonthKey,
  TimeInterval,
  Transition,
} from '../src/domain';
import type { TrackerQuery } from '../src/tracker';
import type { HabitRepositoryApi } from '../src/data';

const ids = {
  habit: '11111111-1111-4111-8111-111111111111',
  secondHabit: '22222222-2222-4222-8222-222222222222',
  activity: '33333333-3333-4333-8333-333333333333',
  archivedActivity: '44444444-4444-4444-8444-444444444444',
  routine: '55555555-5555-4555-8555-555555555555',
  folder: '66666666-6666-4666-8666-666666666666',
};

const createdAt = '2026-08-30T00:00:00.000Z';
const now = '2026-08-30T12:00:00.000Z';

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

function habit(id: string, trigger: Habit['trigger'] = null): Habit {
  return {
    id,
    name: id,
    sortOrder: 0,
    schedule: { kind: 'daily' },
    trigger,
    description: null,
    color: null,
    iconName: null,
    createdAt,
    updatedAt: createdAt,
    archivedAt: null,
  };
}

class MemoryHabitRepository implements HabitRepositoryApi {
  habits: Habit[] = [];
  readonly states = new Map<string, HabitDayState>();

  async readHabits(): Promise<Habit[]> {
    return this.habits;
  }

  async writeHabits(habits: readonly Habit[]): Promise<void> {
    this.habits = [...habits];
  }

  async readMonth(month: MonthKey): Promise<HabitMonthCollection> {
    return {
      month,
      states: [...this.states.values()].filter((state) => state.logicalDay.startsWith(month)),
    };
  }

  async writeMonth(collection: HabitMonthCollection): Promise<void> {
    collection.states.forEach((state) =>
      this.states.set(`${state.habitId}:${state.logicalDay}`, state)
    );
  }

  async upsertDayState(state: HabitDayState): Promise<void> {
    this.states.set(`${state.habitId}:${state.logicalDay}`, state);
  }

  async updateSignals(
    habitId: string,
    logicalDay: string,
    signals: Partial<Pick<HabitDayState, 'manual' | 'automatic'>>,
    updatedAt: string
  ): Promise<HabitDayState> {
    const key = `${habitId}:${logicalDay}`;
    const current = this.states.get(key);
    const next = {
      habitId,
      logicalDay: logicalDay as HabitDayState['logicalDay'],
      manual: signals.manual ?? current?.manual ?? null,
      automatic: signals.automatic ?? current?.automatic ?? null,
      updatedAt,
    };
    this.states.set(key, next);
    return next;
  }
}

function activity(id: string, folderId: string | null, archivedAt: string | null = null): Activity {
  return {
    id,
    kind: 'activity',
    name: id,
    folderId,
    sortOrder: 0,
    color: null,
    iconName: null,
    createdAt,
    updatedAt: createdAt,
    archivedAt,
  };
}

function interval(activityId: string, seconds: number): TimeInterval {
  return { startMs: 0, endMs: seconds * 1000, activityId, transitionId: ids.activity };
}

async function run(): Promise<void> {
  assert(
    isHabitScheduledDay({ kind: 'daily' }, '2026-08-30T02:00:00.000Z', { rolloverHour: 3 }),
    'daily schedules use logical days before recurrence evaluation'
  );
  assert(
    !isHabitScheduledDay({ kind: 'weekly', daysOfWeek: [1] }, '2026-08-30', { rolloverHour: 0 }),
    'selected weekday schedules reject an unselected weekday'
  );
  assert(
    evaluateHabitSchedule(
      { kind: 'weekly', daysOfWeek: [1, 3] },
      { start: '2026-08-24', end: '2026-08-30' }
    )
      .map((period) => period.start)
      .join(',') === '2026-08-24,2026-08-26',
    'selected weekday evaluation returns only required days'
  );
  assert(
    evaluateHabitSchedule(
      { kind: 'weekly-count', timesPerWeek: 3 },
      { start: '2026-08-24', end: '2026-09-06' },
      { weekStartsOn: 1 }
    ).length === 2,
    'weekly-count evaluation returns calendar-week periods'
  );

  const dailyStates = ['2026-08-28', '2026-08-29'].map((logicalDay) => ({
    habitId: ids.habit,
    logicalDay,
    manual: true,
    automatic: null,
    updatedAt: createdAt,
  })) as HabitDayState[];
  const dailyStreak = calculateHabitStreak(habit(ids.habit), dailyStates, { now });
  assert(
    dailyStreak.current === 2 && dailyStreak.longest === 2,
    'an incomplete current daily period does not break the current streak'
  );
  const weekdayStreak = calculateHabitStreak(
    { schedule: { kind: 'weekly', daysOfWeek: [1, 2, 3, 4, 5] } },
    [27, 28].map((day) => ({
      habitId: ids.habit,
      logicalDay: `2026-08-${day}`,
      manual: null,
      automatic: true,
      updatedAt: createdAt,
    })),
    { now: '2026-08-30T12:00:00.000Z' }
  );
  assert(weekdayStreak.current === 2, 'weekday streaks skip unscheduled weekend days');
  const weeklyStreak = calculateHabitStreak(
    { schedule: { kind: 'weekly-count', timesPerWeek: 2 } },
    ['2026-08-18', '2026-08-19', '2026-08-25', '2026-08-26'].map((logicalDay) => ({
      habitId: ids.habit,
      logicalDay,
      manual: null,
      automatic: true,
      updatedAt: createdAt,
    })),
    { now: '2026-08-30T12:00:00.000Z', weekStartsOn: 1 }
  );
  assert(weeklyStreak.current === 2, 'weekly-count streaks use consecutive successful weeks');

  const catalog: CatalogCollection = {
    folders: [
      {
        id: ids.folder,
        name: 'Folder',
        sortOrder: 0,
        color: null,
        iconName: null,
        createdAt,
        updatedAt: createdAt,
        archivedAt: null,
      },
    ],
    activities: [
      activity(ids.activity, ids.folder),
      activity(ids.archivedActivity, ids.folder, createdAt),
    ],
    routines: [],
  };
  const folderResult = evaluateHabitTrigger(
    { kind: 'folder-time', folderId: ids.folder, minimumSeconds: 3 },
    [interval(ids.activity, 1), interval(ids.archivedActivity, 2)],
    catalog
  );
  assert(folderResult.complete, 'folder triggers aggregate archived child activity time');
  const routineResult = evaluateHabitTrigger(
    { kind: 'routine-completion', routineId: ids.routine, minimumSeconds: 2 },
    [interval(ids.routine, 2), interval(ids.activity, 20)],
    catalog
  );
  assert(
    routineResult.complete && routineResult.totalMs === 2_000,
    'routine triggers use only top-level attributed routine time'
  );
  assert(
    evaluateHabitTrigger({ kind: 'tracked-time', activityId: ids.activity }, [
      interval(ids.activity, 1),
    ]).complete,
    'activity triggers default to a one-second inclusive threshold'
  );

  const repository = new MemoryHabitRepository();
  const habitService = new HabitService(repository, {
    now: () => now,
    catalog: { read: async () => catalog },
  });
  await rejects(
    () => habitService.create({ name: ' ', schedule: { kind: 'daily' } }),
    'empty habit names reject'
  );
  const created = await habitService.create({
    id: ids.habit,
    name: 'Read',
    schedule: { kind: 'daily' },
    trigger: { kind: 'tracked-time', activityId: ids.activity },
  });
  assert(created.trigger?.minimumSeconds === 1, 'habit creation persists the default threshold');
  await habitService.setManualCompletion(ids.habit, '2026-08-30', true);
  await habitService.setAutomaticCompletion(ids.habit, '2026-08-30', false);
  await habitService.setAutomaticCompletion(ids.habit, '2026-08-30', true);
  const storedState = repository.states.get(`${ids.habit}:2026-08-30`);
  assert(
    storedState?.manual === true && storedState.automatic === true,
    'signals are independently writable'
  );
  await habitService.archive(ids.habit);
  assert(
    (await habitService.get(ids.habit)).archivedAt !== null,
    'habits remain addressable after archive'
  );
  await habitService.restore(ids.habit);

  let intervals: TimeInterval[] = [interval(ids.activity, 1)];
  const tracker = {
    async query(
      range: { startMs: number; endMs: number },
      currentNowMs = Date.now()
    ): Promise<TrackerQuery> {
      return { range, nowMs: currentNowMs, transitions: [], intervals, activeTransition: null };
    },
  };
  const evaluator = new HabitTriggerEvaluator(tracker, { read: async () => catalog }, { now });
  const rolloverEvaluation = await evaluator.evaluate(
    { trigger: { kind: 'tracked-time', activityId: ids.activity } },
    '2026-08-30',
    { now: new Date(2026, 7, 30, 19, 0, 0).toISOString(), rolloverHour: 18 }
  );
  assert(
    rolloverEvaluation.range.startMs === new Date(2026, 7, 30, 18, 0, 0).getTime(),
    'habit trigger ranges preserve logical days when rollover is after noon'
  );
  const reconciliation = new HabitReconciliationService(
    repository,
    evaluator,
    { read: async () => catalog },
    { now }
  );
  const transition: Transition = {
    id: ids.activity,
    activityId: ids.activity,
    timestamp: now,
    source: 'manual',
    status: 'recorded',
    createdAt: now,
    correctionOfId: null,
    note: null,
  };
  const first = await reconciliation.reconcileTrackerEdit({
    kind: 'insert',
    previous: null,
    current: transition,
  });
  assert(
    first.updated === 1 && repository.states.get(`${ids.habit}:2026-08-30`)?.automatic === true,
    'tracker edits reconcile linked automatic states'
  );
  await habitService.setManualCompletion(ids.habit, '2026-08-30', true);
  intervals = [];
  await reconciliation.reconcileTrackerEdit({
    kind: 'edit',
    previous: transition,
    current: transition,
  });
  const afterEvidenceFalls = repository.states.get(`${ids.habit}:2026-08-30`);
  assert(
    afterEvidenceFalls?.automatic === false && afterEvidenceFalls.manual === true,
    'reconciliation never unchecks manual completion'
  );
}

run().catch((error: unknown) => {
  throw error;
});
