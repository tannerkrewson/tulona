import {
  logicalDayKey,
  shiftLogicalDay,
  type Habit,
  type HabitDayState,
  type LogicalDayKey,
} from '@domain';

import { habitStartDay } from './categories';

function firstActiveDay(habit: Habit, rolloverHour: number): LogicalDayKey {
  const createdDay = logicalDayKey(habit.createdAt, { rolloverHour });
  const scheduledStart = habitStartDay(habit, { rolloverHour });
  return createdDay > scheduledStart ? createdDay : scheduledStart;
}

function isActiveOnDay(habit: Habit, day: LogicalDayKey, rolloverHour: number): boolean {
  if (firstActiveDay(habit, rolloverHour) > day) return false;
  if (habit.archivedAt === null) return true;
  return logicalDayKey(habit.archivedAt, { rolloverHour }) > day;
}

/** Habits the normal Habits view would have shown on this logical day. */
export function habitsActiveOnDay(
  habits: readonly Habit[],
  day: LogicalDayKey,
  rolloverHour = 0
): Habit[] {
  return habits
    .filter((habit) => isActiveOnDay(habit, day, rolloverHour))
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

/** A positive signal or explicit outcome means the day already has a status. */
export function habitDayHasStatus(state: HabitDayState | undefined): boolean {
  return Boolean(
    state &&
      (state.outcome != null || state.manual === true || state.automatic === true)
  );
}

export function habitsNeedingReview(
  habits: readonly Habit[],
  states: readonly HabitDayState[],
  day: LogicalDayKey,
  rolloverHour = 0
): Habit[] {
  const statesForDay = new Map(
    states
      .filter((state) => state.logicalDay === day)
      .map((state) => [state.habitId, state] as const)
  );
  return habitsActiveOnDay(habits, day, rolloverHour).filter(
    (habit) => !habitDayHasStatus(statesForDay.get(habit.id))
  );
}

export interface IncompleteHabitDay {
  day: LogicalDayKey;
  count: number;
}

/** Finds the closest earlier logical day with at least one habit still unset. */
export function findLatestIncompleteHabitDay(
  habits: readonly Habit[],
  states: readonly HabitDayState[],
  today: LogicalDayKey,
  rolloverHour = 0
): IncompleteHabitDay | null {
  if (habits.length === 0) return null;

  const yesterday = shiftLogicalDay(today, -1, { rolloverHour });
  const firstPossibleDay = habits
    .map((habit) => firstActiveDay(habit, rolloverHour))
    .filter((day) => day <= yesterday)
    .sort()[0];
  if (!firstPossibleDay) return null;

  for (
    let day = yesterday;
    day >= firstPossibleDay;
    day = shiftLogicalDay(day, -1, { rolloverHour })
  ) {
    const count = habitsNeedingReview(habits, states, day, rolloverHour).length;
    if (count > 0) return { day, count };
  }

  return null;
}
