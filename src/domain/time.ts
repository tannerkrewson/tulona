import type { IsoTimestamp, LogicalDayKey, MonthKey, TimeInterval, Transition } from './models';

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

function localDateForLogicalDay(value: Date | number | string, rolloverHour: number): Date {
  const date = new Date(timestampMs(value));
  if (date.getHours() < rolloverHour) {
    date.setDate(date.getDate() - 1);
  }
  return date;
}

function dateKey(date: Date): LogicalDayKey {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}` as LogicalDayKey;
}

export function logicalDayKey(
  value: Date | number | string,
  options: LogicalDayOptions = {}
): LogicalDayKey {
  const rolloverHour = options.rolloverHour ?? 0;
  validateRolloverHour(rolloverHour);
  return dateKey(localDateForLogicalDay(value, rolloverHour));
}

export function logicalDayBounds(
  value: Date | number | string,
  options: LogicalDayOptions = {}
): LogicalDayBounds {
  const rolloverHour = options.rolloverHour ?? 0;
  validateRolloverHour(rolloverHour);
  const logicalDate = localDateForLogicalDay(value, rolloverHour);
  const start = new Date(logicalDate);
  start.setHours(rolloverHour, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { key: dateKey(logicalDate), startMs: start.getTime(), endMs: end.getTime() };
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
  const start = new Date(day.startMs);
  const distance = (start.getDay() - weekStartsOn + 7) % 7;
  start.setDate(start.getDate() - distance);
  const startBounds = logicalDayBounds(start, options);
  const endDate = new Date(startBounds.startMs);
  endDate.setDate(endDate.getDate() + 6);
  const endBounds = logicalDayBounds(endDate, options);
  return { start: startBounds, end: endBounds };
}

export function monthKey(value: Date | number | string): MonthKey {
  const date = new Date(timestampMs(value));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` as MonthKey;
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
  return timestampMs(transition.timestamp);
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
  const ordered = transitions
    .map((transition, index) => ({ transition, index }))
    .filter(({ transition }) => transitionTimestamp(transition) <= effectiveNow)
    .sort((left, right) => {
      const timestampDifference =
        transitionTimestamp(left.transition) - transitionTimestamp(right.transition);
      return timestampDifference || left.index - right.index;
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
      });
    }
  }
  return intervals;
}

export const getLogicalDayKey = logicalDayKey;
export const getLogicalDayBounds = logicalDayBounds;
export const getWeekBounds = weekBounds;
export const formatDurationMs = formatDuration;
export const formatCountdownMs = formatCountdown;
