import type { GoalWeekIdentity, LogicalDayKey } from '@domain';
import { dateForLogicalDay } from '@domain';

export type GoalReviewWeekDirection = 'previous' | 'next';

/** Formats canonical logical-week keys in the user's local timezone. */
export function formatGoalWeek(week: GoalWeekIdentity, locale?: string): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  });
  return `${formatter.format(dateForLogicalDay(week.weekStart))} – ${formatter.format(dateForLogicalDay(week.weekEnd))}`;
}

/** Finds the selected week, falling back to the current week at the end of a reload. */
export function goalReviewWeekIndex(
  weeks: readonly Pick<GoalWeekIdentity, 'weekStart'>[],
  selectedWeekStart: LogicalDayKey | null
): number {
  if (weeks.length === 0) return -1;
  const selectedIndex = selectedWeekStart
    ? weeks.findIndex((week) => week.weekStart === selectedWeekStart)
    : -1;
  return selectedIndex >= 0 ? selectedIndex : weeks.length - 1;
}

/** Moves within the loaded history, returning null at either boundary. */
export function moveGoalReviewWeek(
  currentIndex: number,
  direction: GoalReviewWeekDirection,
  weekCount: number
): number | null {
  if (!Number.isInteger(currentIndex) || !Number.isInteger(weekCount) || weekCount <= 0) {
    return null;
  }
  const nextIndex = currentIndex + (direction === 'previous' ? -1 : 1);
  return nextIndex >= 0 && nextIndex < weekCount ? nextIndex : null;
}
