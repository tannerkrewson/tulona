import { logicalDayKey, shiftLogicalDay, type LogicalDayKey } from '@domain';

import { habitWeekStart } from './schedule';

export const sundayFirstWeekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function habitWeekDays(selectedDay: LogicalDayKey, rolloverHour = 0): LogicalDayKey[] {
  const start = habitWeekStart(selectedDay, { rolloverHour, weekStartsOn: 0 });
  return sundayFirstWeekdayLabels.map((_, index) =>
    shiftLogicalDay(start, index, { rolloverHour })
  );
}

export function shiftHabitWeek(
  selectedDay: LogicalDayKey,
  amount: -1 | 1,
  rolloverHour = 0
): LogicalDayKey {
  return shiftLogicalDay(selectedDay, amount * 7, { rolloverHour });
}

export function habitWeekSwipeTarget(
  selectedDay: LogicalDayKey,
  amount: -1 | 1,
  today: LogicalDayKey,
  rolloverHour = 0
): LogicalDayKey | null {
  const nextDay = shiftHabitWeek(selectedDay, amount, rolloverHour);
  return nextDay <= today ? nextDay : null;
}

/** One-day pager target for the habit list. Swipe right goes to yesterday. */
export function habitDaySwipeTarget(
  selectedDay: LogicalDayKey,
  amount: -1 | 1,
  today: LogicalDayKey,
  rolloverHour = 0
): LogicalDayKey | null {
  const nextDay = shiftHabitDay(selectedDay, amount, rolloverHour);
  return nextDay <= today ? nextDay : null;
}

export function shiftHabitDay(
  selectedDay: LogicalDayKey,
  amount: -1 | 1,
  rolloverHour = 0
): LogicalDayKey {
  return shiftLogicalDay(selectedDay, amount, { rolloverHour });
}

export function formatHabitDay(value: LogicalDayKey): string {
  const date = new Date(`${value}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * Returns true when a fresh calendar rollover can make the selected logical
 * day surprising. Show the reminder for the current or immediately previous
 * logical day; older history is an intentional selection.
 */
export function isPastMidnightHabitDay(
  selectedDay: LogicalDayKey,
  now: Date | number | string,
  rolloverHour = 0
): boolean {
  const localNow = new Date(now);
  if (!Number.isFinite(localNow.getTime())) throw new RangeError('Invalid current time');
  const calendarDay = logicalDayKey(now, { rolloverHour: 0 });
  const logicalDay = logicalDayKey(now, { rolloverHour });
  const localHour = localNow.getHours();
  const previousLogicalDay = shiftLogicalDay(logicalDay, -1, { rolloverHour });

  if (calendarDay !== logicalDay) {
    // For a delayed rollover, the current logical day still belongs to the
    // previous calendar date until the configured hour arrives. The prior
    // logical day is already historical in this case.
    return localHour < rolloverHour && selectedDay === logicalDay;
  }

  // Midnight rollover has no pre-rollover period. Keep its prior-day reminder
  // useful through the early morning, while treating later history as intent.
  if (rolloverHour > 0) return false;
  return localHour < 6 && (selectedDay === logicalDay || selectedDay === previousLogicalDay);
}

export function formatHabitRolloverHour(rolloverHour: number): string {
  if (!Number.isInteger(rolloverHour) || rolloverHour < 0 || rolloverHour > 23) {
    throw new RangeError('Logical-day rollover hour must be an integer from 0 through 23');
  }
  if (rolloverHour === 0) return 'midnight';
  const hour = rolloverHour % 12 || 12;
  return `${hour}:00 ${rolloverHour < 12 ? 'AM' : 'PM'}`;
}
