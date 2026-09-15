import type {
  CatalogCollection,
  Folder,
  HistoricalActivitySnapshot,
  IsoTimestamp,
  LogicalDayKey,
  MonthKey,
  TimeInterval,
  TimeTransition,
  TrackableItem,
  Transition,
  UUID,
} from './models';
import {
  clipInterval,
  dateForLogicalDay,
  logicalDayBounds,
  logicalDayKey,
  materializeIntervals,
  shiftLogicalDay,
  timestampMs,
  toTimestamp,
  weekBounds,
} from './time';
import type { MillisecondRange } from './time';

export type HistoryPeriodKind = 'day' | 'week' | 'month' | 'year';

export interface HistoryPeriod extends MillisecondRange {
  kind: HistoryPeriodKind;
  /** Day key for Day, week-start day key for Week, YYYY-MM for Month, YYYY for Year. */
  key: string;
  startLogicalDay: LogicalDayKey;
  /** Last logical day included in this period. */
  endLogicalDay: LogicalDayKey;
}

export interface HistoryPeriodOptions {
  rolloverHour?: number;
  weekStartsOn?: number;
}

export interface HistorySession extends MillisecondRange {
  transitionId: UUID;
  activityId: UUID;
  activitySnapshot?: HistoricalActivitySnapshot | null;
  isRunning: boolean;
}

export interface HistoryActivityMetadata {
  id: UUID;
  kind: 'activity' | 'routine';
  name: string;
  color: string | null;
  iconName: string | null;
  folderId: UUID | null;
  folderName: string | null;
}

export interface HistoryActivityTotal extends HistoryActivityMetadata {
  /** Includes the snapshot identity so a rename or folder move remains legible in history. */
  key: string;
  durationMs: number;
  percentage: number;
}

export interface HistoryFolderTotal {
  key: string;
  folderId: UUID | null;
  folderName: string | null;
  durationMs: number;
  percentage: number;
  /** Actual child activity colors; folders do not receive synthetic colors. */
  activityColors: string[];
  activityIds: UUID[];
}

export interface HistoryAggregation {
  totalMs: number;
  activities: HistoryActivityTotal[];
  folders: HistoryFolderTotal[];
}

export interface HistoryDayTotal extends HistoryAggregation {
  logicalDay: LogicalDayKey;
  period: HistoryPeriod;
}

function validatePeriodOptions(options: HistoryPeriodOptions): Required<HistoryPeriodOptions> {
  const rolloverHour = options.rolloverHour ?? 0;
  const weekStartsOn = options.weekStartsOn ?? 0;
  if (!Number.isInteger(rolloverHour) || rolloverHour < 0 || rolloverHour > 23) {
    throw new RangeError('Logical-day rollover hour must be an integer from 0 through 23');
  }
  if (!Number.isInteger(weekStartsOn) || weekStartsOn < 0 || weekStartsOn > 6) {
    throw new RangeError('Week start must be an integer from 0 through 6');
  }
  return { rolloverHour, weekStartsOn };
}

function validateRange(range: MillisecondRange): void {
  if (
    !Number.isFinite(range.startMs) ||
    !Number.isFinite(range.endMs) ||
    range.endMs < range.startMs
  ) {
    throw new RangeError('History ranges must be finite and ordered');
  }
}

function yearMonthKey(year: number, month: number): MonthKey {
  return `${year}-${String(month).padStart(2, '0')}` as MonthKey;
}

function localDateKey(date: Date): LogicalDayKey {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}` as LogicalDayKey;
}

function parseMonthKey(value: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  const year = match ? Number(match[1]) : Number.NaN;
  const month = match ? Number(match[2]) : Number.NaN;
  if (!match || month < 1 || month > 12) throw new RangeError(`Invalid month key "${value}"`);
  return { year, month };
}

function parseYearKey(value: string): number {
  if (!/^\d{4}$/.test(value)) throw new RangeError(`Invalid year key "${value}"`);
  return Number(value);
}

function periodFromBounds(
  kind: HistoryPeriodKind,
  key: string,
  start: { key: LogicalDayKey; startMs: number; endMs: number },
  end: { key: LogicalDayKey; startMs: number; endMs: number }
): HistoryPeriod {
  return {
    kind,
    key,
    startMs: start.startMs,
    endMs: end.endMs,
    startLogicalDay: start.key,
    endLogicalDay: end.key,
  };
}

export function historyDayPeriod(
  value: Date | number | string,
  options: HistoryPeriodOptions = {}
): HistoryPeriod {
  const { rolloverHour } = validatePeriodOptions(options);
  const key = logicalDayKey(value, { rolloverHour });
  const bounds = logicalDayBounds(key, { rolloverHour });
  return {
    kind: 'day',
    key,
    startMs: bounds.startMs,
    endMs: bounds.endMs,
    startLogicalDay: bounds.key,
    endLogicalDay: bounds.key,
  };
}

export function historyWeekPeriod(
  value: Date | number | string,
  options: HistoryPeriodOptions = {}
): HistoryPeriod {
  const configured = validatePeriodOptions(options);
  const bounds = weekBounds(value, configured.weekStartsOn, {
    rolloverHour: configured.rolloverHour,
  });
  return periodFromBounds('week', bounds.start.key, bounds.start, bounds.end);
}

export function historyMonthPeriod(
  value: Date | number | string | MonthKey,
  options: HistoryPeriodOptions = {}
): HistoryPeriod {
  const { rolloverHour } = validatePeriodOptions(options);
  const key =
    typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)
      ? (value as MonthKey)
      : (logicalDayKey(value, { rolloverHour }).slice(0, 7) as MonthKey);
  const { year, month } = parseMonthKey(key);
  const start = logicalDayBounds(`${yearMonthKey(year, month)}-01`, { rolloverHour });
  const nextMonth = new Date(year, month, 1);
  const endDay = localDateKey(nextMonth);
  const end = logicalDayBounds(endDay, { rolloverHour });
  return {
    kind: 'month',
    key,
    startMs: start.startMs,
    endMs: end.startMs,
    startLogicalDay: start.key,
    endLogicalDay: shiftLogicalDay(end.key, -1, { rolloverHour }),
  };
}

export function historyYearPeriod(
  value: Date | number | string,
  options: HistoryPeriodOptions = {}
): HistoryPeriod {
  const { rolloverHour } = validatePeriodOptions(options);
  const key =
    typeof value === 'string' && /^\d{4}$/.test(value)
      ? value
      : logicalDayKey(value, { rolloverHour }).slice(0, 4);
  const year = parseYearKey(key);
  const start = logicalDayBounds(`${year}-01-01`, { rolloverHour });
  const end = logicalDayBounds(`${year + 1}-01-01`, { rolloverHour });
  return {
    kind: 'year',
    key,
    startMs: start.startMs,
    endMs: end.startMs,
    startLogicalDay: start.key,
    endLogicalDay: shiftLogicalDay(end.key, -1, { rolloverHour }),
  };
}

export function historyPeriodForDate(
  kind: HistoryPeriodKind,
  value: Date | number | string,
  options: HistoryPeriodOptions = {}
): HistoryPeriod {
  switch (kind) {
    case 'day':
      return historyDayPeriod(value, options);
    case 'week':
      return historyWeekPeriod(value, options);
    case 'month':
      return historyMonthPeriod(value, options);
    case 'year':
      return historyYearPeriod(value, options);
  }
}

export function currentHistoryPeriod(
  kind: HistoryPeriodKind,
  nowMs = Date.now(),
  options: HistoryPeriodOptions = {}
): HistoryPeriod {
  if (!Number.isFinite(nowMs)) throw new RangeError('Current time must be finite');
  return historyPeriodForDate(kind, nowMs, options);
}

function shiftCalendarMonth(key: MonthKey, amount: number): MonthKey {
  const { year, month } = parseMonthKey(key);
  const shifted = new Date(year, month - 1 + amount, 1);
  return yearMonthKey(shifted.getFullYear(), shifted.getMonth() + 1);
}

function shiftCalendarYear(key: string, amount: number): string {
  return String(parseYearKey(key) + amount).padStart(4, '0');
}

export function shiftHistoryPeriod(
  period: HistoryPeriod,
  amount: number,
  options: HistoryPeriodOptions = {}
): HistoryPeriod {
  if (!Number.isInteger(amount)) throw new RangeError('History period shift must be an integer');
  const configured = validatePeriodOptions(options);
  switch (period.kind) {
    case 'day':
      return historyDayPeriod(
        shiftLogicalDay(period.startLogicalDay, amount, {
          rolloverHour: configured.rolloverHour,
        }),
        configured
      );
    case 'week':
      return historyWeekPeriod(
        shiftLogicalDay(period.startLogicalDay, amount * 7, {
          rolloverHour: configured.rolloverHour,
        }),
        configured
      );
    case 'month':
      return historyMonthPeriod(shiftCalendarMonth(period.key as MonthKey, amount), configured);
    case 'year':
      return historyYearPeriod(shiftCalendarYear(period.key, amount), configured);
  }
}

export function previousHistoryPeriod(
  period: HistoryPeriod,
  options: HistoryPeriodOptions = {}
): HistoryPeriod {
  return shiftHistoryPeriod(period, -1, options);
}

/** Returns null when the next period has not begun yet. */
export function nextHistoryPeriod(
  period: HistoryPeriod,
  options: HistoryPeriodOptions = {},
  nowMs?: number
): HistoryPeriod | null {
  const next = shiftHistoryPeriod(period, 1, options);
  if (nowMs !== undefined) {
    if (!Number.isFinite(nowMs)) throw new RangeError('Current time must be finite');
    if (next.startMs > nowMs) return null;
  }
  return next;
}

export function comparisonHistoryPeriod(
  period: HistoryPeriod,
  options: HistoryPeriodOptions = {}
): HistoryPeriod {
  return previousHistoryPeriod(period, options);
}

export function isCurrentHistoryPeriod(
  period: HistoryPeriod,
  nowMs = Date.now(),
  options: HistoryPeriodOptions = {}
): boolean {
  return currentHistoryPeriod(period.kind, nowMs, options).key === period.key;
}

export function formatHistoryPeriodTitle(
  period: HistoryPeriod,
  nowMs = Date.now(),
  options: HistoryPeriodOptions = {}
): string {
  const dateOptions: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const start = dateForLogicalDay(period.startLogicalDay, options.rolloverHour ?? 0);
  if (period.kind === 'day') {
    const today = currentHistoryPeriod('day', nowMs, options).key;
    if (period.key === today) return 'Today';
    if (
      period.key ===
      shiftLogicalDay(today as LogicalDayKey, -1, { rolloverHour: options.rolloverHour ?? 0 })
    ) {
      return 'Yesterday';
    }
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(start);
  }
  if (period.kind === 'week') {
    const end = dateForLogicalDay(period.endLogicalDay, options.rolloverHour ?? 0);
    const left = new Intl.DateTimeFormat(undefined, dateOptions).format(start);
    const right = new Intl.DateTimeFormat(undefined, dateOptions).format(end);
    return `${left}–${right}`;
  }
  if (period.kind === 'month') {
    return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(start);
  }
  return period.key;
}

export function clipHistorySession(
  session: HistorySession,
  range: MillisecondRange
): HistorySession | null {
  const clipped = clipInterval(session, range);
  return clipped ? { ...session, ...clipped } : null;
}

export function historySessionDurationMs(session: MillisecondRange): number {
  if (!Number.isFinite(session.startMs) || !Number.isFinite(session.endMs)) {
    throw new RangeError('Session bounds must be finite');
  }
  return Math.max(0, session.endMs - session.startMs);
}

export function historySessionOverlapMs(
  session: MillisecondRange,
  range: MillisecondRange
): number {
  const clipped = clipInterval(session, range);
  return clipped ? clipped.endMs - clipped.startMs : 0;
}

function transitionTime(transition: TimeTransition): number {
  try {
    return timestampMs(transition.timestamp);
  } catch {
    return Number.NaN;
  }
}

function createdTime(transition: TimeTransition): number {
  try {
    return timestampMs(transition.createdAt);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function latestTransitionAt(
  transitions: readonly TimeTransition[],
  nowMs: number
): TimeTransition | null {
  return (
    transitions
      .filter(
        (transition) => transition.status === 'recorded' && transitionTime(transition) <= nowMs
      )
      .sort(
        (left, right) =>
          transitionTime(left) - transitionTime(right) ||
          createdTime(left) - createdTime(right) ||
          left.id.localeCompare(right.id)
      )
      .at(-1) ?? null
  );
}

/** Materializes only tracked intervals; null transitions remain blank gaps. */
export function materializeHistorySessions(
  transitions: readonly Transition[],
  range: MillisecondRange,
  nowMs = Date.now()
): HistorySession[] {
  validateRange(range);
  if (!Number.isFinite(nowMs)) throw new RangeError('Current time must be finite');
  const active = latestTransitionAt(transitions, nowMs);
  return materializeIntervals(transitions, { ...range, nowMs })
    .filter(
      (interval): interval is TimeInterval & { activityId: UUID } => interval.activityId !== null
    )
    .map((interval) => ({
      startMs: interval.startMs,
      endMs: interval.endMs,
      transitionId: interval.transitionId,
      activityId: interval.activityId,
      activitySnapshot: interval.activitySnapshot,
      isRunning:
        active?.id === interval.transitionId &&
        active.activityId === interval.activityId &&
        interval.endMs >= nowMs,
    }));
}

export function createHistoricalActivitySnapshot(
  item: Pick<TrackableItem, 'id' | 'kind' | 'name' | 'color' | 'iconName' | 'folderId'>,
  folder?: Pick<Folder, 'id' | 'name'> | null,
  capturedAt?: IsoTimestamp
): HistoricalActivitySnapshot {
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    color: item.color,
    iconName: item.iconName,
    folderId: item.folderId,
    folderName: folder?.name ?? null,
    ...(capturedAt === undefined ? {} : { capturedAt: toTimestamp(capturedAt) }),
  };
}

export function historicalActivitySnapshotForCatalogItem(
  catalog: CatalogCollection,
  id: UUID,
  capturedAt?: IsoTimestamp
): HistoricalActivitySnapshot | null {
  const item =
    catalog.activities.find((candidate) => candidate.id === id) ??
    catalog.routines.find((candidate) => candidate.id === id);
  if (!item) return null;
  const folder = item.folderId
    ? (catalog.folders.find((candidate) => candidate.id === item.folderId) ?? null)
    : null;
  return createHistoricalActivitySnapshot(item, folder, capturedAt);
}

export interface SnapshotBackfillResult {
  transitions: Transition[];
  updatedCount: number;
}

/**
 * Fills snapshots only when they are absent. Existing snapshots are immutable
 * and therefore survive catalog rename, recolor, move, archive, or deletion.
 */
export function backfillHistoricalActivitySnapshots(
  transitions: readonly Transition[],
  catalog: CatalogCollection
): SnapshotBackfillResult {
  let updatedCount = 0;
  const next = transitions.map((transition) => {
    if (
      transition.activityId === null ||
      (transition.activitySnapshot !== undefined && transition.activitySnapshot !== null)
    ) {
      return transition;
    }
    const snapshot = historicalActivitySnapshotForCatalogItem(
      catalog,
      transition.activityId,
      transition.createdAt
    );
    if (!snapshot) return transition;
    updatedCount += 1;
    return { ...transition, activitySnapshot: snapshot };
  });
  return { transitions: next, updatedCount };
}

function historyMetadata(
  session: Pick<HistorySession, 'activityId' | 'activitySnapshot'>,
  catalog?: CatalogCollection
): HistoryActivityMetadata {
  if (session.activitySnapshot) return { ...session.activitySnapshot };
  const item =
    catalog?.activities.find((candidate) => candidate.id === session.activityId) ??
    catalog?.routines.find((candidate) => candidate.id === session.activityId);
  if (!item) {
    return {
      id: session.activityId,
      kind: 'activity',
      name: 'Archived activity',
      color: null,
      iconName: null,
      folderId: null,
      folderName: null,
    };
  }
  const folder = item.folderId
    ? (catalog?.folders.find((candidate) => candidate.id === item.folderId) ?? null)
    : null;
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    color: item.color,
    iconName: item.iconName,
    folderId: item.folderId,
    folderName: folder?.name ?? null,
  };
}

function activityIdentity(metadata: HistoryActivityMetadata): string {
  return JSON.stringify([
    metadata.id,
    metadata.kind,
    metadata.name,
    metadata.color,
    metadata.folderId,
    metadata.folderName,
  ]);
}

function folderIdentity(metadata: HistoryActivityMetadata): string {
  return JSON.stringify([metadata.folderId, metadata.folderName]);
}

function sessionsInRange(
  sessions: readonly HistorySession[],
  range?: MillisecondRange
): { session: HistorySession; durationMs: number }[] {
  return sessions.flatMap((session) => {
    const durationMs = range
      ? historySessionOverlapMs(session, range)
      : historySessionDurationMs(session);
    return durationMs > 0 ? [{ session, durationMs }] : [];
  });
}

export function aggregateActivityTotals(
  sessions: readonly HistorySession[],
  range?: MillisecondRange,
  catalog?: CatalogCollection
): HistoryActivityTotal[] {
  const values = new Map<string, HistoryActivityTotal>();
  for (const { session, durationMs } of sessionsInRange(sessions, range)) {
    const metadata = historyMetadata(session, catalog);
    const key = activityIdentity(metadata);
    const existing = values.get(key);
    if (existing) {
      existing.durationMs += durationMs;
    } else {
      values.set(key, { ...metadata, key, durationMs, percentage: 0 });
    }
  }
  const totalMs = [...values.values()].reduce((total, value) => total + value.durationMs, 0);
  return [...values.values()]
    .map((value) => ({ ...value, percentage: totalMs > 0 ? value.durationMs / totalMs : 0 }))
    .sort(
      (left, right) => right.durationMs - left.durationMs || left.name.localeCompare(right.name)
    );
}

export function aggregateFolderTotals(
  sessions: readonly HistorySession[],
  range?: MillisecondRange,
  catalog?: CatalogCollection
): HistoryFolderTotal[] {
  const values = new Map<string, HistoryFolderTotal>();
  for (const { session, durationMs } of sessionsInRange(sessions, range)) {
    const metadata = historyMetadata(session, catalog);
    const key = folderIdentity(metadata);
    const existing = values.get(key);
    if (existing) {
      existing.durationMs += durationMs;
      if (metadata.color && !existing.activityColors.includes(metadata.color)) {
        existing.activityColors.push(metadata.color);
      }
      if (!existing.activityIds.includes(metadata.id)) existing.activityIds.push(metadata.id);
    } else {
      values.set(key, {
        key,
        folderId: metadata.folderId,
        folderName: metadata.folderName,
        durationMs,
        percentage: 0,
        activityColors: metadata.color ? [metadata.color] : [],
        activityIds: [metadata.id],
      });
    }
  }
  const totalMs = [...values.values()].reduce((total, value) => total + value.durationMs, 0);
  return [...values.values()]
    .map((value) => ({ ...value, percentage: totalMs > 0 ? value.durationMs / totalMs : 0 }))
    .sort(
      (left, right) =>
        right.durationMs - left.durationMs ||
        (left.folderName ?? 'Unfiled').localeCompare(right.folderName ?? 'Unfiled')
    );
}

export function aggregateHistory(
  sessions: readonly HistorySession[],
  range?: MillisecondRange,
  catalog?: CatalogCollection
): HistoryAggregation {
  const activities = aggregateActivityTotals(sessions, range, catalog);
  const folders = aggregateFolderTotals(sessions, range, catalog);
  return {
    totalMs: sessionsInRange(sessions, range).reduce((total, value) => total + value.durationMs, 0),
    activities,
    folders,
  };
}

export function aggregateHistoryByDay(
  sessions: readonly HistorySession[],
  period: HistoryPeriod,
  options: HistoryPeriodOptions = {},
  catalog?: CatalogCollection
): HistoryDayTotal[] {
  const days: HistoryDayTotal[] = [];
  let day = historyDayPeriod(period.startLogicalDay, options);
  while (day.startMs < period.endMs) {
    const aggregation = aggregateHistory(sessions, day, catalog);
    days.push({ logicalDay: day.startLogicalDay, period: day, ...aggregation });
    day = historyDayPeriod(
      shiftLogicalDay(day.startLogicalDay, 1, {
        rolloverHour: options.rolloverHour ?? 0,
      }),
      options
    );
  }
  return days;
}
