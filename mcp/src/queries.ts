import { DateTime } from 'luxon';
import { dayBounds, timestamp, today, timezone, type DayKind } from './ranges';
import { materializeIntervals } from '../../src/domain/time';
import type { Snapshot } from './dropbox';
import {
  compact,
  cutoff,
  minutes,
  names,
  project,
  source,
  type Presentation,
} from './presentation';

export const collections = [
  'folders',
  'activities',
  'routines',
  'transitions',
  'routine_history',
  'habits',
  'habit_days',
  'goals',
  'goal_statuses',
  'settings',
] as const;
export type Collection = (typeof collections)[number];

export interface Query extends Presentation {
  collection: Collection;
  search?: string;
  record_id?: string;
  entity_id?: string;
  start?: string;
  end?: string;
  timezone?: string;
  day_kind?: DayKind;
  from_day?: string;
  to_day?: string;
  include_archived?: boolean;
  include_superseded?: boolean;
  offset?: number;
  limit?: number;
}

export function summary(snapshot: Snapshot, options: Presentation = {}) {
  const active = snapshot.backup.activeRoutine;
  return {
    source: source(snapshot, options.diagnostics),
    counts: snapshot.summary,
    settings:
      options.detail === 'full' ? snapshot.backup.settings : compact(snapshot.backup.settings),
    activeRoutine:
      options.detail === 'full'
        ? active
        : active
          ? compact({
              name: active.routineSnapshot.name,
              status: active.status,
              startedAt: active.startedAt,
              pausedAt: active.pausedAt,
              currentStepIndex: active.currentStepIndex,
              stepCount: active.routineSnapshot.steps.length,
            })
          : null,
  };
}

export function query(snapshot: Snapshot, options: Query) {
  const { backup } = snapshot;
  const records: Record<string, unknown>[] = {
    folders: backup.catalog.folders,
    activities: backup.catalog.activities,
    routines: backup.catalog.routines,
    transitions: backup.transitions,
    routine_history: backup.routineHistory,
    habits: backup.habits,
    habit_days: backup.habitDayStates,
    goals: backup.goals,
    goal_statuses: backup.goalWeeks.flatMap((week) => week.statuses),
    settings: [backup.settings],
  }[options.collection] as unknown as Record<string, unknown>[];
  if (options.from_day && options.to_day && options.from_day > options.to_day) {
    throw new Error('from_day must be on or before to_day.');
  }
  if ((options.from_day || options.to_day) && options.collection === 'settings') {
    throw new Error('Settings do not have dates to filter.');
  }
  let startMs = -Infinity;
  let endMs = Infinity;
  if (options.start || options.end || options.timezone || options.day_kind) {
    if (options.collection !== 'transitions')
      throw new Error(
        'start/end, timezone, and day_kind apply only to transitions. Saved habit days are already logical day keys.'
      );
  }
  if ((options.start || options.end) && (options.from_day || options.to_day))
    throw new Error('Use start/end or from_day/to_day, not both.');
  if (options.collection === 'transitions') {
    const zone = options.timezone ?? 'UTC';
    timezone.parse(zone);
    const kind = options.day_kind ?? 'calendar';
    const hour = backup.settings.logicalDayRolloverHour;
    if (options.from_day) startMs = dayBounds(options.from_day, zone, kind, hour).startMs;
    if (options.to_day) endMs = dayBounds(options.to_day, zone, kind, hour).endMs;
    if (options.start) startMs = Date.parse(timestamp.parse(options.start));
    if (options.end) endMs = Date.parse(timestamp.parse(options.end));
    if (endMs <= startMs) throw new Error('end must be later than start.');
  }
  const search = options.search?.toLowerCase();
  const date = (record: Record<string, unknown>) =>
    String(
      record.timestamp ??
        record.logicalDay ??
        record.weekStart ??
        record.startedAt ??
        record.updatedAt ??
        record.createdAt ??
        ''
    );
  const filtered = records
    .filter((record) => {
      if (!options.include_archived && record.archivedAt) return false;
      if (
        options.collection === 'transitions' &&
        !options.include_superseded &&
        record.status !== 'recorded'
      )
        return false;
      if (options.record_id && record.id !== options.record_id) return false;
      if (
        options.entity_id &&
        !['activityId', 'habitId', 'goalId', 'routineId'].some(
          (field) => record[field] === options.entity_id
        )
      )
        return false;
      if (options.collection === 'transitions') {
        const instant = Date.parse(String(record.timestamp));
        if (instant < startMs || instant >= endMs) return false;
      } else {
        const day = date(record).slice(0, 10);
        if (options.from_day && day < options.from_day) return false;
        if (options.to_day && day > options.to_day) return false;
      }
      if (search && !JSON.stringify(record).toLowerCase().includes(search)) return false;
      return true;
    })
    .sort(
      (left, right) =>
        date(right).localeCompare(date(left)) ||
        String(left.id ?? left.habitId ?? left.goalId ?? '').localeCompare(
          String(right.id ?? right.habitId ?? right.goalId ?? '')
        )
    );
  const offset = options.offset ?? 0;
  const limit = options.limit ?? 50;
  const labels = names(snapshot);
  const page = filtered
    .slice(offset, offset + limit)
    .map((record) => project(record, options.collection, labels, options));
  // Bound tool output as well as record count; routine snapshots can contain many steps.
  while (Buffer.byteLength(JSON.stringify(page)) > 256 * 1024) page.pop();
  if (page.length === 0 && offset < filtered.length) {
    throw new Error(
      'A matching record exceeds the 256 KiB response limit. Read its component records from another collection.'
    );
  }
  return {
    source: source(snapshot, options.diagnostics),
    collection: options.collection,
    ...(options.collection === 'transitions' &&
    (options.from_day || options.to_day || options.start || options.end)
      ? {
          range: {
            ...(Number.isFinite(startMs) ? { start: new Date(startMs).toISOString() } : {}),
            ...(Number.isFinite(endMs) ? { end: new Date(endMs).toISOString() } : {}),
            ...(!options.start && !options.end
              ? {
                  timezone: options.timezone ?? 'UTC',
                  day_kind: options.day_kind ?? 'calendar',
                  ...(options.day_kind === 'logical'
                    ? { rollover_hour: backup.settings.logicalDayRolloverHour }
                    : {}),
                }
              : {}),
          },
        }
      : {}),
    total: filtered.length,
    offset,
    next_offset: offset + page.length < filtered.length ? offset + page.length : null,
    records: page,
  };
}

export function activityReport(
  snapshot: Snapshot,
  start: string,
  end: string,
  limit = 50,
  options: Presentation = {}
) {
  const startMs = Date.parse(timestamp.parse(start));
  const endMs = Date.parse(timestamp.parse(end));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new Error('The report needs valid ISO timestamps with end later than start.');
  }
  const snapshotMs = cutoff(snapshot);
  const effectiveEnd = Math.min(endMs, snapshotMs);
  const intervals =
    effectiveEnd > startMs
      ? materializeIntervals(snapshot.backup.transitions, {
          startMs,
          endMs: effectiveEnd,
          nowMs: snapshotMs,
        })
      : [];
  const catalog = new Map(
    [...snapshot.backup.catalog.activities, ...snapshot.backup.catalog.routines].map((item) => [
      item.id,
      item.name,
    ])
  );
  const totals = new Map<
    string,
    { activityId: string; name: string; durationMs: number; intervals: number }
  >();
  let idleMs = 0;
  for (const interval of intervals) {
    const duration = interval.endMs - interval.startMs;
    if (interval.activityId === null) {
      idleMs += duration;
      continue;
    }
    const total = totals.get(interval.activityId) ?? {
      activityId: interval.activityId,
      name: catalog.get(interval.activityId) ?? interval.activityId,
      durationMs: 0,
      intervals: 0,
    };
    total.name = interval.activitySnapshot?.name ?? total.name;
    total.durationMs += duration;
    total.intervals++;
    totals.set(interval.activityId, total);
  }
  const activities = [...totals.values()].sort(
    (a, b) => b.durationMs - a.durationMs || a.activityId.localeCompare(b.activityId)
  );
  return {
    source: source(snapshot, options.diagnostics),
    start: new Date(startMs).toISOString(),
    requested_end: new Date(endMs).toISOString(),
    tracked_minutes: minutes(
      activities.reduce((total, activity) => total + activity.durationMs, 0)
    ),
    idle_minutes: minutes(idleMs),
    unknown_minutes: minutes(
      Math.max(0, effectiveEnd - startMs) -
        intervals.reduce((total, interval) => total + interval.endMs - interval.startMs, 0)
    ),
    total_activities: activities.length,
    activities: activities.slice(0, limit).map((activity) => ({
      name: activity.name,
      minutes: minutes(activity.durationMs),
      intervals: activity.intervals,
      ...(options.detail === 'full'
        ? { activityId: activity.activityId, durationMs: activity.durationMs }
        : {}),
    })),
    truncated: activities.length > limit,
  };
}

export interface DayOverview extends Presentation {
  day?: string;
  timezone?: string;
  day_kind?: DayKind;
  timeline?: boolean;
  timeline_offset?: number;
  timeline_limit?: number;
}

export function dayOverview(snapshot: Snapshot, options: DayOverview = {}) {
  const zone = options.timezone ?? 'UTC';
  const kind = options.day_kind ?? 'calendar';
  const rolloverHour = snapshot.backup.settings.logicalDayRolloverHour;
  const key = options.day ?? today(zone, kind, rolloverHour);
  const { startMs, endMs } = dayBounds(key, zone, kind, rolloverHour);
  const report = activityReport(
    snapshot,
    new Date(startMs).toISOString(),
    new Date(endMs).toISOString(),
    100,
    options
  );
  const snapshotMs = cutoff(snapshot);
  const labels = names(snapshot);
  const latest = snapshot.backup.transitions
    .filter(
      (transition) =>
        transition.status === 'recorded' && Date.parse(transition.timestamp) <= snapshotMs
    )
    .sort(
      (a, b) =>
        Date.parse(b.timestamp) - Date.parse(a.timestamp) ||
        Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
        b.id.localeCompare(a.id)
    )[0];
  const name = (activityId: string | null, historicalName?: string) =>
    historicalName ?? (activityId === null ? 'Idle' : (labels.get(activityId) ?? activityId));
  const intervals =
    options.timeline && Math.min(endMs, snapshotMs) > startMs
      ? materializeIntervals(snapshot.backup.transitions, {
          startMs,
          endMs: Math.min(endMs, snapshotMs),
          nowMs: snapshotMs,
        })
      : [];
  const offset = options.timeline_offset ?? 0;
  const limit = options.timeline_limit ?? 100;
  return {
    source: report.source,
    day: key,
    timezone: zone,
    day_kind: kind,
    ...(kind === 'logical' ? { rollover_hour: rolloverHour } : {}),
    start: report.start,
    end: report.requested_end,
    latest_recorded: latest
      ? {
          activity: name(latest.activityId, latest.activitySnapshot?.name),
          startedAt: latest.timestamp,
          ...(options.detail === 'full' ? { id: latest.id, activityId: latest.activityId } : {}),
        }
      : null,
    tracked_minutes: report.tracked_minutes,
    idle_minutes: report.idle_minutes,
    unknown_minutes: report.unknown_minutes,
    total_activities: report.total_activities,
    activities: report.activities,
    truncated: report.truncated,
    ...(options.timeline
      ? {
          timeline: intervals.slice(offset, offset + limit).map((interval) => ({
            start: DateTime.fromMillis(interval.startMs, { zone }).toISO(),
            end: DateTime.fromMillis(interval.endMs, { zone }).toISO(),
            activity: name(interval.activityId, interval.activitySnapshot?.name),
            minutes: minutes(interval.endMs - interval.startMs),
            ...(options.detail === 'full'
              ? { transitionId: interval.transitionId, activityId: interval.activityId }
              : {}),
          })),
          timeline_total: intervals.length,
          timeline_next_offset: offset + limit < intervals.length ? offset + limit : null,
        }
      : {}),
  };
}
