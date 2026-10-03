import { z } from 'zod';

const source = z
  .object({
    exportedAt: z.string(),
    observedThrough: z.string(),
    age_minutes: z.number(),
  })
  .passthrough();
const record = z.record(z.string(), z.unknown());
const activity = z
  .object({ name: z.string(), minutes: z.number(), intervals: z.number() })
  .passthrough();
const totals = {
  tracked_minutes: z.number(),
  idle_minutes: z.number(),
  unknown_minutes: z.number(),
  total_activities: z.number(),
  activities: z.array(activity),
  truncated: z.boolean(),
};

export const outputs = {
  summary: z.object({ source, counts: record, settings: record, activeRoutine: record.nullable() }),
  query: z.object({
    source,
    collection: z.string(),
    total: z.number(),
    offset: z.number(),
    next_offset: z.number().nullable(),
    records: z.array(record),
    range: record.optional(),
  }),
  report: z.object({
    source,
    start: z.string(),
    requested_end: z.string(),
    ...totals,
  }),
  overview: z.object({
    source,
    day: z.string(),
    timezone: z.string(),
    day_kind: z.enum(['calendar', 'logical']),
    rollover_hour: z.number().optional(),
    start: z.string(),
    end: z.string(),
    latest_recorded: record.nullable(),
    ...totals,
    timeline: z
      .array(
        z
          .object({ start: z.string(), end: z.string(), activity: z.string(), minutes: z.number() })
          .passthrough()
      )
      .optional(),
    timeline_total: z.number().optional(),
    timeline_next_offset: z.number().nullable().optional(),
  }),
};
