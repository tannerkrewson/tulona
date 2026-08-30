import {
  dateForLogicalDay,
  logicalDayKey,
  shiftLogicalDay as shiftLogicalDayValue,
  type HabitSchedule,
  type LogicalDayKey,
} from '@domain';

export type HabitDateInput = Date | number | string;

export interface HabitScheduleOptions {
  rolloverHour?: number;
  weekStartsOn?: number;
}

export interface LogicalDayRange {
  start: HabitDateInput;
  end: HabitDateInput;
}

export interface HabitSchedulePeriod {
  kind: 'day' | 'week';
  /** First logical day represented by this required period. */
  start: LogicalDayKey;
  /** Last logical day represented by this required period. */
  end: LogicalDayKey;
  /** A day schedule has one required day; a count schedule has none. */
  requiredDays: LogicalDayKey[];
  requiredCount: number;
}

interface ParsedLogicalDay {
  year: number;
  month: number;
  day: number;
}

function validateWeekStartsOn(weekStartsOn: number): void {
  if (!Number.isInteger(weekStartsOn) || weekStartsOn < 0 || weekStartsOn > 6) {
    throw new RangeError('weekStartsOn must be an integer from 0 through 6');
  }
}

function parseLogicalDay(value: string): ParsedLogicalDay {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError(`Invalid logical day "${value}"`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid logical day "${value}"`);
  }
  return { year, month, day };
}

function logicalDayToDate(value: LogicalDayKey, rolloverHour: number): Date {
  return dateForLogicalDay(value, rolloverHour);
}

function inputToLogicalDay(value: HabitDateInput, rolloverHour: number): LogicalDayKey {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    parseLogicalDay(value);
    return value as LogicalDayKey;
  }
  return logicalDayKey(value, { rolloverHour });
}

function shiftLogicalDay(value: LogicalDayKey, days: number, rolloverHour: number): LogicalDayKey {
  return shiftLogicalDayValue(value, days, { rolloverHour });
}

function dayDifference(start: LogicalDayKey, end: LogicalDayKey): number {
  const left = parseLogicalDay(start);
  const right = parseLogicalDay(end);
  return (
    (Date.UTC(right.year, right.month - 1, right.day) -
      Date.UTC(left.year, left.month - 1, left.day)) /
    (24 * 60 * 60 * 1000)
  );
}

function weekStartFor(
  logicalDay: LogicalDayKey,
  weekStartsOn: number,
  rolloverHour: number
): LogicalDayKey {
  const date = logicalDayToDate(logicalDay, rolloverHour);
  const distance = (date.getDay() - weekStartsOn + 7) % 7;
  return shiftLogicalDay(logicalDay, -distance, rolloverHour);
}

function weekEndFor(
  logicalDay: LogicalDayKey,
  weekStartsOn: number,
  rolloverHour: number
): LogicalDayKey {
  return shiftLogicalDay(weekStartFor(logicalDay, weekStartsOn, rolloverHour), 6, rolloverHour);
}

function normalizedOptions(options: HabitScheduleOptions = {}): Required<HabitScheduleOptions> {
  const rolloverHour = options.rolloverHour ?? 0;
  const weekStartsOn = options.weekStartsOn ?? 0;
  if (!Number.isInteger(rolloverHour) || rolloverHour < 0 || rolloverHour > 23) {
    throw new RangeError('Logical-day rollover hour must be an integer from 0 through 23');
  }
  validateWeekStartsOn(weekStartsOn);
  return { rolloverHour, weekStartsOn };
}

function scheduleCount(schedule: HabitSchedule): number | null {
  return schedule.kind === 'weekly-count' ? schedule.timesPerWeek : null;
}

function assertSchedule(schedule: HabitSchedule): void {
  if (schedule.kind === 'weekly') {
    if (
      schedule.daysOfWeek.length === 0 ||
      schedule.daysOfWeek.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
    ) {
      throw new RangeError('Weekly habit schedules need weekday values from 0 through 6');
    }
    if (new Set(schedule.daysOfWeek).size !== schedule.daysOfWeek.length) {
      throw new RangeError('Weekly habit schedules cannot repeat a weekday');
    }
  }
  if (schedule.kind === 'weekly-count') {
    if (
      !Number.isInteger(schedule.timesPerWeek) ||
      schedule.timesPerWeek < 1 ||
      schedule.timesPerWeek > 7
    ) {
      throw new RangeError('Weekly-count habit schedules need one to seven occurrences');
    }
  }
  if (schedule.kind === 'interval' && schedule.everyDays < 1) {
    throw new RangeError('Interval habit schedules need a positive day interval');
  }
}

export function isHabitScheduledDay(
  schedule: HabitSchedule,
  value: HabitDateInput,
  options: HabitScheduleOptions = {}
): boolean {
  const { rolloverHour } = normalizedOptions(options);
  assertSchedule(schedule);
  const day = inputToLogicalDay(value, rolloverHour);
  const date = logicalDayToDate(day, rolloverHour);
  switch (schedule.kind) {
    case 'daily':
      return true;
    case 'weekdays':
      return date.getDay() >= 1 && date.getDay() <= 5;
    case 'weekly':
      return schedule.daysOfWeek.includes(date.getDay());
    case 'weekly-count':
      // A count schedule requires a successful week, not a particular weekday.
      return true;
    case 'interval': {
      const difference = dayDifference(schedule.startDate, day);
      return difference >= 0 && difference % schedule.everyDays === 0;
    }
  }
}

function rangeDays(
  range: LogicalDayRange,
  options: Required<HabitScheduleOptions>
): LogicalDayKey[] {
  const start = inputToLogicalDay(range.start, options.rolloverHour);
  const end = inputToLogicalDay(range.end, options.rolloverHour);
  const count = dayDifference(start, end);
  if (count < 0) throw new RangeError('Logical-day range end must not precede its start');
  return Array.from({ length: count + 1 }, (_, index) =>
    shiftLogicalDay(start, index, options.rolloverHour)
  );
}

export function evaluateHabitSchedule(
  schedule: HabitSchedule,
  range: LogicalDayRange,
  options: HabitScheduleOptions = {}
): HabitSchedulePeriod[] {
  const normalized = normalizedOptions(options);
  assertSchedule(schedule);
  const days = rangeDays(range, normalized);
  const count = scheduleCount(schedule);
  if (count !== null) {
    const firstWeek = weekStartFor(days[0], normalized.weekStartsOn, normalized.rolloverHour);
    const lastWeek = weekStartFor(
      days.at(-1) as LogicalDayKey,
      normalized.weekStartsOn,
      normalized.rolloverHour
    );
    const periods: HabitSchedulePeriod[] = [];
    let current = firstWeek;
    while (dayDifference(current, lastWeek) >= 0) {
      periods.push({
        kind: 'week',
        start: current,
        end: weekEndFor(current, normalized.weekStartsOn, normalized.rolloverHour),
        requiredDays: [],
        requiredCount: count,
      });
      current = shiftLogicalDay(current, 7, normalized.rolloverHour);
    }
    return periods;
  }

  return days
    .filter((day) => isHabitScheduledDay(schedule, day, normalized))
    .map((day) => ({
      kind: 'day' as const,
      start: day,
      end: day,
      requiredDays: [day],
      requiredCount: 1,
    }));
}

/** Returns concrete required logical days; count schedules require week periods instead. */
export function requiredLogicalDays(
  schedule: HabitSchedule,
  start: HabitDateInput,
  end: HabitDateInput,
  options: HabitScheduleOptions = {}
): LogicalDayKey[] {
  return evaluateHabitSchedule(schedule, { start, end }, options).flatMap(
    (period) => period.requiredDays
  );
}

export function habitWeekStart(
  value: HabitDateInput,
  options: HabitScheduleOptions = {}
): LogicalDayKey {
  const normalized = normalizedOptions(options);
  return weekStartFor(
    inputToLogicalDay(value, normalized.rolloverHour),
    normalized.weekStartsOn,
    normalized.rolloverHour
  );
}

export function habitWeekEnd(
  value: HabitDateInput,
  options: HabitScheduleOptions = {}
): LogicalDayKey {
  const normalized = normalizedOptions(options);
  return weekEndFor(
    inputToLogicalDay(value, normalized.rolloverHour),
    normalized.weekStartsOn,
    normalized.rolloverHour
  );
}

export const evaluateSchedule = evaluateHabitSchedule;
export const getRequiredLogicalDays = requiredLogicalDays;
export const isScheduledDay = isHabitScheduledDay;
export const getHabitWeekStart = habitWeekStart;
export const getHabitWeekEnd = habitWeekEnd;
