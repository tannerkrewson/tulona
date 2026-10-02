import { compareText } from './ordering';
import type { IsoTimestamp, LogicalDayKey, MonthKey, TimeInterval, Transition } from './models';
import { DateTime } from 'luxon';

export interface LogicalDayOptions {
  rolloverHour?: number;
}

export interface LogicalDayBounds {
  key: LogicalDayKey;
  startMs: number;
  endMs: number;
}

export interface WeekBounds {
  start: LogicalDayBounds;
  end: LogicalDayBounds;
}

export interface MillisecondRange {
  startMs: number;
  endMs: number;
}

export interface MaterializeOptions extends MillisecondRange {
  nowMs?: number;
}

export function nowMs(): number {
  return Date.now();
}

export function toTimestamp(value: Date | number | string): IsoTimestamp {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError('Cannot serialize an invalid timestamp');
  }
  return date.toISOString();
}

export function timestampMs(value: Date | number | string): number {
  const valueMs = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(valueMs)) {
    throw new RangeError('Cannot calculate with an invalid timestamp');
  }
  return valueMs;
}

function validateRolloverHour(rolloverHour: number): void {
  if (!Number.isInteger(rolloverHour) || rolloverHour < 0 || rolloverHour > 23) {
    throw new RangeError('Logical-day rollover hour must be an integer from 0 through 23');
  }
}

function parseLogicalDay(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError(`Invalid logical day "${value}"`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = DateTime.fromObject({ year, month, day }, { zone: 'UTC' });
  if (!check.isValid || check.year !== year || check.month !== month || check.day !== day) {
    throw new RangeError(`Invalid logical day "${value}"`);
  }
  return { year, month, day };
}

export function logicalDayDifference(start: LogicalDayKey, end: LogicalDayKey): number {
  const left = parseLogicalDay(start);
  const right = parseLogicalDay(end);
  const leftDate = DateTime.fromObject(left, { zone: 'UTC' });
  const rightDate = DateTime.fromObject(right, { zone: 'UTC' });
  return rightDate.diff(leftDate, 'days').days;
}

/** Returns the local timestamp at the start of a logical day. */
export function dateForLogicalDay(value: LogicalDayKey, rolloverHour = 0): Date {
  validateRolloverHour(rolloverHour);
  const parsed = parseLogicalDay(value);
  const date = DateTime.fromObject({ ...parsed, hour: rolloverHour }, { zone: 'local' });
  if (
    !date.isValid ||
    date.year !== parsed.year ||
    date.month !== parsed.month ||
    date.day !== parsed.day
  ) {
    throw new RangeError(`Logical day cannot be represented locally: "${value}"`);
  }
  return date.toJSDate();
}

function localDateForLogicalDay(value: Date | number | string, rolloverHour: number): DateTime {
  const date = DateTime.fromMillis(timestampMs(value), { zone: 'local' });
  return date.hour < rolloverHour ? date.minus({ days: 1 }) : date;
}

function dateKey(date: DateTime): LogicalDayKey {
  const year = date.year;
  const month = String(date.month).padStart(2, '0');
  const day = String(date.day).padStart(2, '0');
  return `${year}-${month}-${day}` as LogicalDayKey;
}

export function logicalDayKey(
  value: Date | number | string,
  options: LogicalDayOptions = {}
): LogicalDayKey {
  const rolloverHour = options.rolloverHour ?? 0;
  validateRolloverHour(rolloverHour);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return dateKey(DateTime.fromJSDate(dateForLogicalDay(value as LogicalDayKey, rolloverHour)));
  }
  return dateKey(localDateForLogicalDay(value, rolloverHour));
}

export function logicalDayBounds(
  value: Date | number | string,
  options: LogicalDayOptions = {}
): LogicalDayBounds {
  const rolloverHour = options.rolloverHour ?? 0;
  validateRolloverHour(rolloverHour);
  const logicalDate =
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? DateTime.fromJSDate(dateForLogicalDay(value as LogicalDayKey, rolloverHour))
      : localDateForLogicalDay(value, rolloverHour);
  const start = logicalDate.set({ hour: rolloverHour, minute: 0, second: 0, millisecond: 0 });
  const end = start.plus({ days: 1 });
  return { key: dateKey(logicalDate), startMs: start.toMillis(), endMs: end.toMillis() };
}

/** Shifts a logical-day key while retaining local timezone and rollover rules. */
export function shiftLogicalDay(
  value: LogicalDayKey,
  amount: number,
  options: LogicalDayOptions = {}
): LogicalDayKey {
  if (!Number.isInteger(amount)) throw new RangeError('Logical-day shift must be an integer');
  const rolloverHour = options.rolloverHour ?? 0;
  const date = DateTime.fromJSDate(dateForLogicalDay(value, rolloverHour)).plus({ days: amount });
  return dateKey(date);
}

export function weekBounds(
  value: Date | number | string,
  weekStartsOn = 0,
  options: LogicalDayOptions = {}
): WeekBounds {
  if (!Number.isInteger(weekStartsOn) || weekStartsOn < 0 || weekStartsOn > 6) {
    throw new RangeError('weekStartsOn must be an integer from 0 through 6');
  }
  const day = logicalDayBounds(value, options);
  const start = DateTime.fromMillis(day.startMs, { zone: 'local' });
  const distance = ((start.weekday % 7) - weekStartsOn + 7) % 7;
  const startBounds = logicalDayBounds(start.minus({ days: distance }).toMillis(), options);
  const endDate = DateTime.fromMillis(startBounds.startMs, { zone: 'local' }).plus({ days: 6 });
  const endBounds = logicalDayBounds(endDate.toMillis(), options);
  return { start: startBounds, end: endBounds };
}

export function monthKey(value: Date | number | string): MonthKey {
  return DateTime.fromMillis(timestampMs(value), { zone: 'local' }).toFormat('yyyy-MM') as MonthKey;
}

export function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new RangeError('Duration must be a finite non-negative number');
  }
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

export function formatCountdown(remainingMs: number): string {
  if (!Number.isFinite(remainingMs)) {
    throw new RangeError('Countdown must be finite');
  }
  const prefix = remainingMs < 0 ? '-' : '';
  const totalSeconds = Math.floor(Math.abs(remainingMs) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${prefix}${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${prefix}${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function clipInterval(
  interval: MillisecondRange,
  range: MillisecondRange
): MillisecondRange | null {
  if (interval.endMs < interval.startMs || range.endMs < range.startMs) {
    throw new RangeError('Interval and range ends must not precede their starts');
  }
  const startMs = Math.max(interval.startMs, range.startMs);
  const endMs = Math.min(interval.endMs, range.endMs);
  return endMs > startMs ? { startMs, endMs } : null;
}

function transitionTimestamp(transition: Transition): number {
  try {
    return timestampMs(transition.timestamp);
  } catch {
    return Number.NaN;
  }
}

/**
 * Materializes transitions into non-overlapping intervals. A transition before
 * the requested range establishes the range's initial state, while future
 * transitions are ignored so reports never claim time that has not happened.
 */
export function materializeIntervals(
  transitions: readonly Transition[],
  options: MaterializeOptions
): TimeInterval[] {
  if (options.endMs < options.startMs) {
    throw new RangeError('Range end must not precede range start');
  }
  const effectiveNow = options.nowMs ?? nowMs();
  if (
    !Number.isFinite(options.startMs) ||
    !Number.isFinite(options.endMs) ||
    !Number.isFinite(effectiveNow)
  ) {
    throw new RangeError('Range and current time must be finite');
  }
  const ordered = transitions
    .map((transition, index) => ({ transition, index }))
    .filter(
      ({ transition }) =>
        transition.status === 'recorded' && transitionTimestamp(transition) <= effectiveNow
    )
    .sort((left, right) => {
      const timestampDifference =
        transitionTimestamp(left.transition) - transitionTimestamp(right.transition);
      if (timestampDifference) return timestampDifference;
      const createdAtDifference =
        transitionTimestamp({ ...left.transition, timestamp: left.transition.createdAt }) -
        transitionTimestamp({ ...right.transition, timestamp: right.transition.createdAt });
      return (
        createdAtDifference ||
        compareText(left.transition.id, right.transition.id) ||
        left.index - right.index
      );
    });

  const intervals: TimeInterval[] = [];
  let current: { transition: Transition; startMs: number } | null = null;
  for (const item of ordered) {
    const itemMs = transitionTimestamp(item.transition);
    if (itemMs < options.startMs) {
      current = { transition: item.transition, startMs: itemMs };
      continue;
    }
    if (itemMs >= options.endMs) break;
    if (current) {
      const clipped = clipInterval({ startMs: current.startMs, endMs: itemMs }, options);
      if (clipped) {
        intervals.push({
          ...clipped,
          activityId: current.transition.activityId,
          transitionId: current.transition.id,
          activitySnapshot: current.transition.activitySnapshot,
        });
      }
    }
    current = { transition: item.transition, startMs: itemMs };
  }
  if (current) {
    const clipped = clipInterval(
      { startMs: current.startMs, endMs: Math.min(options.endMs, effectiveNow) },
      options
    );
    if (clipped) {
      intervals.push({
        ...clipped,
        activityId: current.transition.activityId,
        transitionId: current.transition.id,
        activitySnapshot: current.transition.activitySnapshot,
      });
    }
  }
  return intervals;
}

export const getLogicalDayKey = logicalDayKey;
export const getLogicalDayBounds = logicalDayBounds;
export const getWeekBounds = weekBounds;
export const shiftLogicalDayKey = shiftLogicalDay;
export const formatDurationMs = formatDuration;
export const formatCountdownMs = formatCountdown;
