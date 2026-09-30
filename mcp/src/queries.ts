import { materializeIntervals } from '../../src/domain/time';
import type { Snapshot } from './dropbox';

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

export interface Query {
  collection: Collection;
  search?: string;
  record_id?: string;
  entity_id?: string;
  from_day?: string;
  to_day?: string;
  include_archived?: boolean;
  include_superseded?: boolean;
  offset?: number;
  limit?: number;
}

export function summary(snapshot: Snapshot) {
  const active = snapshot.backup.activeRoutine;
  return {
    source: snapshot.source,
    note: 'This is the last synchronized backup, not live app state. Unsynced changes are unavailable.',
    counts: snapshot.summary,
    settings: snapshot.backup.settings,
    activeRoutine: active
      ? {
          id: active.id,
          routineId: active.routineId,
          name: active.routineSnapshot.name,
          status: active.status,
          startedAt: active.startedAt,
          pausedAt: active.pausedAt,
          currentStepIndex: active.currentStepIndex,
          stepCount: active.routineSnapshot.steps.length,
        }
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
      const day = date(record).slice(0, 10);
      if (options.from_day && day < options.from_day) return false;
      if (options.to_day && day > options.to_day) return false;
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
  const page = filtered.slice(offset, offset + limit);
  // Bound tool output as well as record count; routine snapshots can contain many steps.
  while (Buffer.byteLength(JSON.stringify(page)) > 256 * 1024) page.pop();
  if (page.length === 0 && offset < filtered.length) {
    throw new Error(
      'A matching record exceeds the 256 KiB response limit. Read its component records from another collection.'
    );
  }
  return {
    source: snapshot.source,
    collection: options.collection,
    total: filtered.length,
    offset,
    next_offset: offset + page.length < filtered.length ? offset + page.length : null,
    records: page,
  };
}

export function activityReport(snapshot: Snapshot, start: string, end: string, limit = 50) {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new Error('The report needs valid ISO timestamps with end later than start.');
  }
  const snapshotMs = Math.min(Date.now(), Date.parse(snapshot.backup.exportedAt));
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
    source: snapshot.source,
    start: new Date(startMs).toISOString(),
    requested_end: new Date(endMs).toISOString(),
    observed_through: new Date(snapshotMs).toISOString(),
    note: 'Durations use recorded transitions and stop at the backup export time. Time before the first known transition is unknown. Intervals count slices in this report, not completed sessions.',
    tracked_ms: activities.reduce((total, activity) => total + activity.durationMs, 0),
    idle_ms: idleMs,
    total_activities: activities.length,
    activities: activities.slice(0, limit),
    truncated: activities.length > limit,
  };
}
