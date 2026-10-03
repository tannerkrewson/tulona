import { DateTime, IANAZone } from 'luxon';
import { z } from 'zod';

export type DayKind = 'calendar' | 'logical';
// Refinements keep model-facing schemas simple strings without weakening validation.
export const timestamp = z
  .string()
  .refine(
    (value) =>
      z.iso.datetime({ offset: true }).safeParse(value).success &&
      DateTime.fromISO(value, { setZone: true }).isValid,
    'Expected an ISO timestamp with Z or an explicit offset'
  );
export const uuid = z
  .string()
  .refine((value) => z.uuid().safeParse(value).success, 'Expected a UUID');
export const day = z
  .string()
  .refine(
    (value) =>
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      DateTime.fromISO(value, { zone: 'UTC' }).toISODate() === value,
    'Expected a valid YYYY-MM-DD date'
  );
export const timezone = z
  .string()
  .refine(
    (value) => value === 'UTC' || IANAZone.isValidZone(value),
    'Expected an IANA timezone, e.g. America/New_York'
  );

export function dayBounds(key: string, zone = 'UTC', kind: DayKind = 'calendar', rolloverHour = 0) {
  day.parse(key);
  timezone.parse(zone);
  const date = DateTime.fromISO(key, { zone });
  const hour = kind === 'logical' ? rolloverHour : 0;
  // Construct each local boundary separately: a day can span 23 or 25 hours at DST.
  const start = date.set({ hour });
  const end = date.plus({ days: 1 }).set({ hour });
  if (start.toISODate() !== key || end.toMillis() <= start.toMillis())
    throw new Error('This day cannot be represented in the requested timezone.');
  return { startMs: start.toMillis(), endMs: end.toMillis() };
}

export function today(zone: string, kind: DayKind, rolloverHour: number) {
  timezone.parse(zone);
  const now = DateTime.now().setZone(zone);
  return (
    kind === 'logical' && now.hour < rolloverHour ? now.minus({ days: 1 }) : now
  ).toISODate()!;
}
