/** Converts a local calendar day (YYYY-MM-DD) to a Date at local noon. */
export function dateFromDay(value: string): Date {
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) ? date : new Date();
}

/** Formats a Date as its local calendar day (YYYY-MM-DD). */
export function dayFromDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
