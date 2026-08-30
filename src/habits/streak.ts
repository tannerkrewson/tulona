import { logicalDayKey, type Habit, type HabitDayState, type LogicalDayKey } from '@domain';

import { evaluateHabitSchedule, type HabitDateInput, type HabitScheduleOptions } from './schedule';

export interface HabitStreakOptions extends HabitScheduleOptions {
  now?: HabitDateInput;
  startDate?: HabitDateInput;
}

export interface HabitStreak {
  current: number;
  longest: number;
  currentStreak: number;
  longestStreak: number;
}

function asLogicalDay(value: HabitDateInput, rolloverHour: number): LogicalDayKey {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value as LogicalDayKey;
  }
  return logicalDayKey(value, { rolloverHour });
}

function earliestState(states: readonly HabitDayState[], currentDay: LogicalDayKey): LogicalDayKey {
  const historical = states
    .map((state) => state.logicalDay)
    .filter((day) => day <= currentDay)
    .sort();
  return historical[0] ?? currentDay;
}

function completedByDay(
  states: readonly HabitDayState[],
  currentDay: LogicalDayKey
): Map<string, boolean> {
  const result = new Map<string, boolean>();
  for (const state of states) {
    if (state.logicalDay > currentDay) continue;
    result.set(
      state.logicalDay,
      (result.get(state.logicalDay) ?? false) || state.manual === true || state.automatic === true
    );
  }
  return result;
}

function periodCompleted(
  period: ReturnType<typeof evaluateHabitSchedule>[number],
  completed: ReadonlyMap<string, boolean>
): boolean {
  if (period.kind === 'day') return completed.get(period.start) === true;
  let count = 0;
  for (const [day, isComplete] of completed) {
    if (isComplete && day >= period.start && day <= period.end) count += 1;
  }
  return count >= period.requiredCount;
}

function runLength(values: readonly boolean[]): number {
  let current = 0;
  let longest = 0;
  for (const value of values) {
    current = value ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

function currentRun(values: readonly boolean[], currentPeriodIncomplete: boolean): number {
  let index = values.length - 1;
  if (currentPeriodIncomplete) index -= 1;
  let length = 0;
  while (index >= 0 && values[index] === true) {
    length += 1;
    index -= 1;
  }
  return length;
}

/**
 * Calculates completed required periods without treating an unfinished current
 * logical day/week as a missed period.
 */
export function calculateHabitStreak(
  habit: Pick<Habit, 'schedule'>,
  states: readonly HabitDayState[],
  options: HabitStreakOptions = {}
): HabitStreak {
  const rolloverHour = options.rolloverHour ?? 0;
  const currentDay = asLogicalDay(options.now ?? Date.now(), rolloverHour);
  const firstDay = asLogicalDay(
    options.startDate ??
      (habit.schedule.kind === 'interval'
        ? habit.schedule.startDate
        : earliestState(states, currentDay)),
    rolloverHour
  );
  if (firstDay > currentDay) {
    return { current: 0, longest: 0, currentStreak: 0, longestStreak: 0 };
  }

  const completed = completedByDay(states, currentDay);
  const periods = evaluateHabitSchedule(
    habit.schedule,
    { start: firstDay, end: currentDay },
    options
  );
  const values = periods.map((period) => periodCompleted(period, completed));
  const lastPeriod = periods.at(-1);
  const lastValue = values.at(-1);
  const currentPeriodIncomplete =
    lastPeriod !== undefined && lastPeriod.end >= currentDay && lastValue === false;
  const longest = runLength(values);
  const current = currentRun(values, currentPeriodIncomplete);
  return { current, longest, currentStreak: current, longestStreak: longest };
}

export function habitCompleted(state: Pick<HabitDayState, 'manual' | 'automatic'> | null): boolean {
  return state?.manual === true || state?.automatic === true;
}

export const getHabitStreak = calculateHabitStreak;
export const calculateStreaks = calculateHabitStreak;
