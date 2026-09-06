import type { HabitDayOutcome, HabitDayState, HabitSchedule } from '@domain';

export const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function formatHabitSchedule(schedule: HabitSchedule): string {
  switch (schedule.kind) {
    case 'daily':
      return 'Every day';
    case 'weekdays':
      return 'Weekdays';
    case 'weekly':
      return schedule.daysOfWeek
        .slice()
        .sort((left, right) => left - right)
        .map((day) => weekdayLabels[day])
        .join(', ');
    case 'weekly-count':
      return `${schedule.timesPerWeek} ${schedule.timesPerWeek === 1 ? 'time' : 'times'} per week`;
    case 'interval':
      return `Every ${schedule.everyDays} ${schedule.everyDays === 1 ? 'day' : 'days'}`;
  }
}

export function habitCompletionLabel(
  state: Pick<HabitDayState, 'manual' | 'automatic' | 'outcome'> | null
) {
  if (state?.outcome === 'failed') return 'Failed';
  if (state?.outcome === 'skipped') return 'Skipped';
  if (state?.outcome === 'done') return 'Done';
  if (state?.manual === true && state.automatic === true)
    return 'Completed manually + automatically';
  if (state?.manual === true) return 'Completed manually';
  if (state?.automatic === true) return 'Completed automatically';
  return 'Not completed';
}

export function habitSignalSummary(state: Pick<HabitDayState, 'manual' | 'automatic'> | null) {
  const signals: string[] = [];
  if (state?.manual === true) signals.push('manual');
  if (state?.automatic === true) signals.push('automatic');
  return signals.length > 0 ? signals.join(' + ') : 'none';
}

export function habitOutcomeLabel(outcome: HabitDayOutcome | null | undefined): string | null {
  switch (outcome) {
    case 'done':
      return 'Done';
    case 'failed':
      return 'Failed';
    case 'skipped':
      return 'Skipped';
    default:
      return null;
  }
}
