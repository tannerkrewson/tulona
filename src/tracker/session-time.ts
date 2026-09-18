/** Formats a persisted timestamp in the device/browser's local timezone. */
export function formatSessionDate(timestampMs: number): string {
  return new Date(timestampMs).toLocaleDateString([], { dateStyle: 'medium' });
}

/** Formats a persisted timestamp in the device/browser's local timezone. */
export function formatSessionTime(timestampMs: number): string {
  return new Date(timestampMs).toLocaleTimeString([], { timeStyle: 'short' });
}

/** Converts a timestamp to the local wall-clock value expected by datetime-local. */
export function localDateTimeInputValue(timestampMs: number): string {
  const date = new Date(timestampMs);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

/** Parses a browser datetime-local value without treating it as a UTC timestamp. */
export function parseLocalDateTimeInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText) - 1;
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (
    month < 0 ||
    month > 11 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  const date = new Date(year, month, day, hour, minute, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }
  return date;
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
  const month = datePartsAreUtc ? datePart.getUTCMonth() : datePart.getMonth();
  const day = datePartsAreUtc ? datePart.getUTCDate() : datePart.getDate();
  const result = new Date(timePart);
  result.setFullYear(year, month, day);
  result.setHours(
    timePart.getHours(),
    timePart.getMinutes(),
    timePart.getSeconds(),
    timePart.getMilliseconds()
  );
  return result;
}
