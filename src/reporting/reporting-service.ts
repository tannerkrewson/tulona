import {
  formatDuration,
  logicalDayBounds,
  logicalDayKey,
  timestampMs,
  weekBounds,
  type AppSettings,
  type CatalogCollection,
  type LogicalDayKey,
  type TimeInterval,
  type TimeTransition,
  type UUID,
} from '@domain';

import type { SettingsRepositoryApi } from '@data/settings-repository';
import {
  resolveCatalogItem,
  type CatalogServiceApi,
  type ResolvedCatalogItem,
} from '../catalog/catalog-service';
import type { TrackerQuery, TrackerRange } from '../tracker/tracker-engine';
import type { TrackerServiceApi } from '../tracker/tracker-service';

const UNFILED_ID = '__unfiled__';
const UNTRACKED_COLOR = '#64748B';

export interface ReportItem {
  id: UUID | null;
  kind: 'activity' | 'routine' | 'untracked' | 'unknown';
  name: string;
  durationMs: number;
  displayColor: string;
  folderId: UUID | null;
  folderName: string | null;
  isArchived: boolean;
}

export interface ReportFolder {
  id: UUID | null;
  name: string;
  durationMs: number;
  displayColor: string;
  isArchived: boolean;
}

export interface ReportTimelineEntry extends ReportItem {
  startMs: number;
  endMs: number;
  transitionId: UUID;
}

export interface DailyReport {
  logicalDay: LogicalDayKey;
  range: TrackerRange;
  totalMs: number;
  totalFormatted: string;
  items: ReportItem[];
  activities: ReportItem[];
  routines: ReportItem[];
  folders: ReportFolder[];
  timeline: ReportTimelineEntry[];
  currentActiveItem: ReportItem | null;
}

export interface WeeklyDailyTotal {
  logicalDay: LogicalDayKey;
  totalMs: number;
  totalFormatted: string;
}

export interface WeeklyReport {
  start: LogicalDayKey;
  end: LogicalDayKey;
  range: TrackerRange;
  totalMs: number;
  totalFormatted: string;
  daily: WeeklyDailyTotal[];
  items: ReportItem[];
  activities: ReportItem[];
  routines: ReportItem[];
  folders: ReportFolder[];
}

export interface ReportingServiceOptions {
  now?: () => number;
  rolloverHour?: number;
  weekStartsOn?: number;
}

export interface ReportingServiceApi {
  today(nowMs?: number): Promise<DailyReport>;
  getToday(nowMs?: number): Promise<DailyReport>;
  day(logicalDay: LogicalDayKey, nowMs?: number): Promise<DailyReport>;
  getDay(logicalDay: LogicalDayKey, nowMs?: number): Promise<DailyReport>;
  week(logicalDay: LogicalDayKey, nowMs?: number): Promise<WeeklyReport>;
  getWeek(logicalDay: LogicalDayKey, nowMs?: number): Promise<WeeklyReport>;
  queryIntervals(range: TrackerRange, nowMs?: number): Promise<ReportTimelineEntry[]>;
}

export interface ReportingDependencies {
  tracker: Pick<TrackerServiceApi, 'query'>;
  catalog: Pick<CatalogServiceApi, 'read'>;
  settings?: Pick<SettingsRepositoryApi, 'read'>;
}

function validateLogicalDay(value: string): asserts value is LogicalDayKey {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) {
    throw new RangeError(`Invalid logical day "${value}"`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid logical day "${value}"`);
  }
}

function dateForLogicalDay(day: LogicalDayKey, rolloverHour: number): Date {
  validateLogicalDay(day);
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date, rolloverHour, 0, 0, 0);
}

function shiftDay(day: LogicalDayKey, amount: number): LogicalDayKey {
  const date = dateForLogicalDay(day, 0);
  date.setDate(date.getDate() + amount);
  return logicalDayKey(date);
}

function settingsWithDefaults(
  settings: AppSettings | undefined
): Required<Pick<AppSettings, 'logicalDayRolloverHour' | 'weekStartsOn'>> {
  return {
    logicalDayRolloverHour: settings?.logicalDayRolloverHour ?? 0,
    weekStartsOn: settings?.weekStartsOn ?? 0,
  };
}

function resolvedItem(catalog: CatalogCollection, id: UUID | null, durationMs = 0): ReportItem {
  if (id === null) {
    return {
      id: null,
      kind: 'untracked',
      name: 'Untracked time',
      durationMs,
      displayColor: UNTRACKED_COLOR,
      folderId: null,
      folderName: null,
      isArchived: false,
    };
  }
  const result: ResolvedCatalogItem | null = resolveCatalogItem(catalog, id);
  if (!result) {
    return {
      id,
      kind: 'unknown',
      name: 'Archived item',
      durationMs,
      displayColor: UNTRACKED_COLOR,
      folderId: null,
      folderName: null,
      isArchived: true,
    };
  }
  return {
    id,
    kind: result.item.kind,
    name: result.item.name,
    durationMs,
    displayColor: result.displayColor,
    folderId: result.folder?.id ?? null,
    folderName: result.folder?.name ?? null,
    isArchived: result.isArchived || result.folder?.archivedAt !== null,
  };
}

function addItem(target: Map<string, ReportItem>, item: ReportItem): void {
  const key = item.id ?? '__untracked__';
  const current = target.get(key);
  if (current) current.durationMs += item.durationMs;
  else target.set(key, { ...item });
}

export function aggregateFolderTotals(items: readonly ReportItem[]): ReportFolder[] {
  const totals = new Map<string, ReportFolder>();
  for (const item of items) {
    const key = item.folderId ?? UNFILED_ID;
    const current = totals.get(key);
    if (current) {
      current.durationMs += item.durationMs;
      continue;
    }
    totals.set(key, {
      id: item.folderId,
      name: item.folderName ?? 'Unfiled',
      durationMs: item.durationMs,
      displayColor: item.folderId ? item.displayColor : UNTRACKED_COLOR,
      isArchived: item.isArchived,
    });
  }
  return [...totals.values()].sort(
    (left, right) => right.durationMs - left.durationMs || left.name.localeCompare(right.name)
  );
}

function buildReport(
  logicalDay: LogicalDayKey,
  range: TrackerRange,
  query: TrackerQuery,
  catalog: CatalogCollection
): DailyReport {
  const itemTotals = new Map<string, ReportItem>();
  const timeline = query.intervals.map((interval) => {
    const item = resolvedItem(catalog, interval.activityId, interval.endMs - interval.startMs);
    addItem(itemTotals, item);
    return {
      ...item,
      startMs: interval.startMs,
      endMs: interval.endMs,
      transitionId: interval.transitionId,
    };
  });
  const items = [...itemTotals.values()].sort(
    (left, right) => right.durationMs - left.durationMs || left.name.localeCompare(right.name)
  );
  return {
    logicalDay,
    range,
    totalMs: timeline.reduce((total, entry) => total + entry.durationMs, 0),
    totalFormatted: formatDuration(timeline.reduce((total, entry) => total + entry.durationMs, 0)),
    items,
    activities: items.filter((item) => item.kind === 'activity'),
    routines: items.filter((item) => item.kind === 'routine'),
    folders: aggregateFolderTotals(items),
    timeline,
    currentActiveItem: resolvedActiveItem(catalog, query.activeTransition),
  };
}

function resolvedActiveItem(
  catalog: CatalogCollection,
  transition: TimeTransition | null
): ReportItem | null {
  return transition ? resolvedItem(catalog, transition.activityId) : null;
}

function mergeReportItems(reports: readonly DailyReport[]): ReportItem[] {
  const totals = new Map<string, ReportItem>();
  for (const report of reports) for (const item of report.items) addItem(totals, item);
  return [...totals.values()].sort(
    (left, right) => right.durationMs - left.durationMs || left.name.localeCompare(right.name)
  );
}

function mergeFolders(reports: readonly DailyReport[]): ReportFolder[] {
  const totals = new Map<string, ReportFolder>();
  for (const report of reports) {
    for (const folder of report.folders) {
      const key = folder.id ?? UNFILED_ID;
      const current = totals.get(key);
      if (current) current.durationMs += folder.durationMs;
      else totals.set(key, { ...folder });
    }
  }
  return [...totals.values()].sort(
    (left, right) => right.durationMs - left.durationMs || left.name.localeCompare(right.name)
  );
}

export class ReportingService implements ReportingServiceApi {
  private readonly now: () => number;

  constructor(
    private readonly dependencies: ReportingDependencies,
    private readonly options: ReportingServiceOptions = {}
  ) {
    this.now = options.now ?? (() => Date.now());
  }

  async today(nowMs = this.now()): Promise<DailyReport> {
    const settings = await this.readSettings();
    return this.day(logicalDayKey(nowMs, { rolloverHour: settings.logicalDayRolloverHour }), nowMs);
  }

  async getToday(nowMs?: number): Promise<DailyReport> {
    return this.today(nowMs);
  }

  async day(logicalDay: LogicalDayKey, nowMs = this.now()): Promise<DailyReport> {
    const settings = await this.readSettings();
    const bounds = logicalDayBounds(
      dateForLogicalDay(logicalDay, settings.logicalDayRolloverHour),
      {
        rolloverHour: settings.logicalDayRolloverHour,
      }
    );
    const [query, catalog] = await Promise.all([
      this.dependencies.tracker.query(bounds, nowMs),
      this.dependencies.catalog.read(),
    ]);
    return buildReport(bounds.key, bounds, query, catalog);
  }

  async getDay(logicalDay: LogicalDayKey, nowMs?: number): Promise<DailyReport> {
    return this.day(logicalDay, nowMs);
  }

  async week(logicalDay: LogicalDayKey, nowMs = this.now()): Promise<WeeklyReport> {
    const settings = await this.readSettings();
    const anchor = dateForLogicalDay(logicalDay, settings.logicalDayRolloverHour);
    const bounds = weekBounds(anchor, settings.weekStartsOn, {
      rolloverHour: settings.logicalDayRolloverHour,
    });
    const first = bounds.start.key;
    const days = Array.from({ length: 7 }, (_, index) => shiftDay(first, index));
    const reports = await Promise.all(days.map((day) => this.day(day, nowMs)));
    const firstReport = reports[0];
    const lastReport = reports[reports.length - 1];
    const items = mergeReportItems(reports);
    const totalMs = reports.reduce((total, report) => total + report.totalMs, 0);
    return {
      start: firstReport.logicalDay,
      end: lastReport.logicalDay,
      range: { startMs: firstReport.range.startMs, endMs: lastReport.range.endMs },
      totalMs,
      totalFormatted: formatDuration(totalMs),
      daily: reports.map((report) => ({
        logicalDay: report.logicalDay,
        totalMs: report.totalMs,
        totalFormatted: report.totalFormatted,
      })),
      items,
      activities: items.filter((item) => item.kind === 'activity'),
      routines: items.filter((item) => item.kind === 'routine'),
      folders: mergeFolders(reports),
    };
  }

  async getWeek(logicalDay: LogicalDayKey, nowMs?: number): Promise<WeeklyReport> {
    return this.week(logicalDay, nowMs);
  }

  async queryIntervals(range: TrackerRange, nowMs = this.now()): Promise<ReportTimelineEntry[]> {
    const [query, catalog] = await Promise.all([
      this.dependencies.tracker.query(range, nowMs),
      this.dependencies.catalog.read(),
    ]);
    return query.intervals.map((interval: TimeInterval) => ({
      ...resolvedItem(catalog, interval.activityId, interval.endMs - interval.startMs),
      startMs: interval.startMs,
      endMs: interval.endMs,
      transitionId: interval.transitionId,
    }));
  }

  private async readSettings(): Promise<
    Pick<AppSettings, 'logicalDayRolloverHour' | 'weekStartsOn'>
  > {
    const settings = this.dependencies.settings
      ? await this.dependencies.settings.read()
      : undefined;
    const configured = settingsWithDefaults(settings);
    const rolloverHour = this.options.rolloverHour ?? configured.logicalDayRolloverHour;
    const weekStartsOn = this.options.weekStartsOn ?? configured.weekStartsOn;
    if (!Number.isInteger(rolloverHour) || rolloverHour < 0 || rolloverHour > 23) {
      throw new RangeError('Logical-day rollover hour must be an integer from 0 through 23');
    }
    if (!Number.isInteger(weekStartsOn) || weekStartsOn < 0 || weekStartsOn > 6) {
      throw new RangeError('Week start must be an integer from 0 through 6');
    }
    return { logicalDayRolloverHour: rolloverHour, weekStartsOn };
  }
}

export function createReportingService(
  dependencies: ReportingDependencies,
  options?: ReportingServiceOptions
): ReportingService {
  return new ReportingService(dependencies, options);
}

export type ReportingRange = TrackerRange;
export const formatReportDuration = formatDuration;
export const reportTimestampMs = timestampMs;
