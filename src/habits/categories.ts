import { logicalDayKey, type Habit, type LogicalDayKey } from '@domain';

export type HabitCategory = 'active' | 'future' | 'archived';

export interface HabitCategoryOption {
  readonly value: HabitCategory;
  readonly label: string;
}

export const DEFAULT_HABIT_CATEGORY: HabitCategory = 'active';

export const HABIT_CATEGORY_OPTIONS: readonly HabitCategoryOption[] = [
  { value: 'active', label: 'Active' },
  { value: 'future', label: 'Future' },
  { value: 'archived', label: 'Archived' },
];

export interface HabitCategoryOptions {
  rolloverHour?: number;
}

type CategorizedHabit = Pick<Habit, 'archivedAt' | 'createdAt' | 'schedule'>;

function asLogicalDay(value: Date | number | string, rolloverHour: number): LogicalDayKey {
  return logicalDayKey(value, { rolloverHour });
}

/**
 * Returns the first logical day on which a habit can be worked. Interval
 * schedules already persist an explicit start date; other schedules begin on
 * the habit's logical creation day.
 */
export function habitStartDay(
  habit: Pick<Habit, 'createdAt' | 'schedule'>,
  options: HabitCategoryOptions = {}
): LogicalDayKey {
  const rolloverHour = options.rolloverHour ?? 0;
  return habit.schedule.kind === 'interval'
    ? habit.schedule.startDate
    : asLogicalDay(habit.createdAt, rolloverHour);
}

/**
 * Categories are derived from the existing archive and recurrence fields so
 * older habit records need no migration or extra persisted category field.
 * Archive state takes precedence over a future interval start date.
 */
export function classifyHabit(
  habit: CategorizedHabit,
  today: Date | number | string,
  options: HabitCategoryOptions = {}
): HabitCategory {
  if (habit.archivedAt !== null) return 'archived';
  const rolloverHour = options.rolloverHour ?? 0;
  return habitStartDay(habit, options) > asLogicalDay(today, rolloverHour) ? 'future' : 'active';
}

export const getHabitCategory = classifyHabit;

export function filterHabitsByCategory(
  habits: readonly Habit[],
  category: HabitCategory,
  today: Date | number | string,
  options: HabitCategoryOptions = {}
): Habit[] {
  return habits
    .filter((habit) => classifyHabit(habit, today, options) === category)
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

export function groupHabitsByCategory(
  habits: readonly Habit[],
  today: Date | number | string,
  options: HabitCategoryOptions = {}
): Record<HabitCategory, Habit[]> {
  const grouped: Record<HabitCategory, Habit[]> = {
    active: [],
    future: [],
    archived: [],
  };
  for (const habit of habits) {
    grouped[classifyHabit(habit, today, options)].push(habit);
  }
  grouped.active.sort((left, right) => left.sortOrder - right.sortOrder);
  grouped.future.sort((left, right) => left.sortOrder - right.sortOrder);
  grouped.archived.sort((left, right) => left.sortOrder - right.sortOrder);
  return grouped;
}
