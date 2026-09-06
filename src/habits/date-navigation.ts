import { shiftLogicalDay, type LogicalDayKey } from '@domain';

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
