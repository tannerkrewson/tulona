import { DateTime } from 'luxon';

/** Formats a persisted timestamp in the device/browser's local timezone. */
export function formatSessionDate(timestampMs: number): string {
  return DateTime.fromMillis(timestampMs, { zone: 'local' }).toLocaleString({
    dateStyle: 'medium',
  });
}

/** Formats a persisted timestamp in the device/browser's local timezone. */
export function formatSessionTime(timestampMs: number): string {
  return DateTime.fromMillis(timestampMs, { zone: 'local' }).toLocaleString({ timeStyle: 'short' });
}

/** Converts a timestamp to the local wall-clock value expected by datetime-local. */
export function localDateTimeInputValue(timestampMs: number): string {
  return DateTime.fromMillis(timestampMs, { zone: 'local' }).toFormat("yyyy-MM-dd'T'HH:mm");
}

/** Parses a browser datetime-local value without treating it as a UTC timestamp. */
export function parseLocalDateTimeInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  const date = DateTime.fromObject(
    { year, month, day, hour, minute, second: 0, millisecond: 0 },
    { zone: 'local' }
  );
  if (
    !date.isValid ||
    date.year !== year ||
    date.month !== month ||
    date.day !== day ||
    date.hour !== hour ||
    date.minute !== minute
  ) {
    return null;
  }
  return date.toJSDate();
}

/**
 * Combines a date chosen by a native picker with a local time. Android's
 * Material date picker reports its selected calendar day at UTC midnight;
 * the UTC flag keeps that day from shifting in western timezones.
 */
export function combinePickerDateAndTime(
  datePart: Date,
  timePart: Date,
  datePartsAreUtc = false
): Date {
  const year = datePartsAreUtc ? datePart.getUTCFullYear() : datePart.getFullYear();
  const month = (datePartsAreUtc ? datePart.getUTCMonth() : datePart.getMonth()) + 1;
  const day = datePartsAreUtc ? datePart.getUTCDate() : datePart.getDate();
  const result = DateTime.fromObject(
    {
      year,
      month,
      day,
      hour: timePart.getHours(),
      minute: timePart.getMinutes(),
      second: timePart.getSeconds(),
      millisecond: timePart.getMilliseconds(),
    },
    { zone: 'local' }
  );
  return result.isValid ? result.toJSDate() : new Date(Number.NaN);
}
