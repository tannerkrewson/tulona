import {
  aggregateActivityTotals,
  aggregateFolderTotals,
  aggregateHistory,
  aggregateHistoryByDay,
  backfillHistoricalActivitySnapshots,
  clipHistorySession,
  comparisonHistoryPeriod,
  createHistoricalActivitySnapshot,
  currentHistoryPeriod,
  historicalActivitySnapshotForCatalogItem,
  historyDayPeriod,
  logicalDayBounds,
  historyMonthPeriod,
  historyPeriodForDate,
  historySessionOverlapMs,
  historyWeekPeriod,
  historyYearPeriod,
  materializeHistorySessions,
  nextHistoryPeriod,
  previousHistoryPeriod,
  timestampMs,
  type Activity,
  type CatalogCollection,
  type Folder,
  type HistorySession,
  type MonthKey,
  type TrackerMonthCollection,
  type Transition,
  type UUID,
} from '../src/domain';
import { createTrackerService } from '../src/tracker/tracker-service';
import type { TrackerRepositoryApi } from '../src/data/tracker-repository';
import { parseBackup } from '../src/backup/backup-import';
import { CURRENT_BACKUP_SCHEMA_VERSION, CURRENT_BACKUP_VERSION } from '../src/backup/backup-schema';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const ids = {
  dataset: '11111111-1111-4111-8111-111111111111',
  folder: '22222222-2222-4222-8222-222222222222',
  movedFolder: '33333333-3333-4333-8333-333333333333',
  first: '44444444-4444-4444-8444-444444444444',
  second: '55555555-5555-4555-8555-555555555555',
  routine: '66666666-6666-4666-8666-666666666666',
  transitionA: '77777777-7777-4777-8777-777777777777',
  transitionB: '88888888-8888-4888-8888-888888888888',
  transitionC: '99999999-9999-4999-8999-999999999999',
  transitionD: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  transitionE: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
};

function localTimestamp(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
  second = 0
): string {
  return new Date(year, month - 1, day, hour, minute, second).toISOString();
}

function transition(
  id: UUID,
  timestamp: string,
  activityId: UUID | null,
  activitySnapshot?: Transition['activitySnapshot']
): Transition {
  return {
    id,
    activityId,
    timestamp,
    source: 'manual',
    status: 'recorded',
    createdAt: timestamp,
    correctionOfId: null,
    note: null,
    ...(activitySnapshot === undefined ? {} : { activitySnapshot }),
  };
}

function session(
  transitionId: UUID,
  activityId: UUID,
  startMs: number,
  endMs: number,
  activitySnapshot?: Transition['activitySnapshot'],
  isRunning = false
): HistorySession {
  return {
    transitionId,
    activityId,
    startMs,
    endMs,
    isRunning,
    ...(activitySnapshot === undefined ? {} : { activitySnapshot }),
  };
}

function folder(id: UUID, name: string): Folder {
  const timestamp = '2026-09-01T00:00:00.000Z';
  return {
    id,
    name,
    sortOrder: 0,
    color: null,
    iconName: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
  };
}

function activity(id: UUID, name: string, folderId: UUID | null, color: string): Activity {
  const timestamp = '2026-09-01T00:00:00.000Z';
  return {
    id,
    kind: 'activity',
    name,
    folderId,
    sortOrder: 0,
    color,
    iconName: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
  };
}

function catalog(overrides: Partial<CatalogCollection> = {}): CatalogCollection {
  return {
    folders: [],
    activities: [],
    routines: [],
    ...overrides,
  };
}

function cloneCollection(collection: TrackerMonthCollection): TrackerMonthCollection {
  return {
    month: collection.month,
    transitions: [...collection.transitions],
    latestTransitions: [...collection.latestTransitions],
  };
}

class MemoryTrackerRepository implements TrackerRepositoryApi {
  readonly months = new Map<MonthKey, TrackerMonthCollection>();

  async readMonth(month: MonthKey): Promise<TrackerMonthCollection> {
    return cloneCollection(
      this.months.get(month) ?? { month, transitions: [], latestTransitions: [] }
    );
  }

  async readMonths(start: MonthKey, end: MonthKey): Promise<Transition[]> {
    return [...this.months.entries()]
      .filter(([month]) => month >= start && month <= end)
      .flatMap(([, value]) => value.transitions);
  }

  async readRange(_startMs: number, endMs: number): Promise<Transition[]> {
    return [...this.months.values()]
      .flatMap((value) => value.transitions)
      .filter((value) => timestampMs(value.timestamp) <= endMs);
  }

  async readAll(): Promise<Transition[]> {
    return [...this.months.values()].flatMap((value) => value.transitions);
  }

  async writeMonth(collection: TrackerMonthCollection): Promise<void> {
    await this.writeCrossMonth([collection], `month-${collection.month}`);
  }

  async upsertTransitions(transitions: readonly Transition[]): Promise<void> {
    const grouped = new Map<MonthKey, Transition[]>();
    for (const value of transitions) {
      const month = value.timestamp.slice(0, 7) as MonthKey;
      grouped.set(month, [...(grouped.get(month) ?? []), value]);
    }
    const collections = await Promise.all(
      [...grouped.entries()].map(async ([month, additions]) => {
        const current = await this.readMonth(month);
        const byId = new Map(current.transitions.map((value) => [value.id, value]));
        additions.forEach((value) => byId.set(value.id, value));
        return { month, transitions: [...byId.values()], latestTransitions: [] };
      })
    );
    await this.writeCrossMonth(collections, 'upsert');
  }

  async writeCrossMonth(
    collections: readonly TrackerMonthCollection[],
    _operationId: string,
    _operationKind?: string
  ): Promise<void> {
    collections.forEach((collection) =>
      this.months.set(collection.month, cloneCollection(collection))
    );
  }

  async recoverJournal(): Promise<{ recovered: string[]; failed: never[] }> {
    return { recovered: [], failed: [] };
  }
}

function emptyBackupTransition(): Transition {
  return transition(
    ids.transitionA,
    '2026-09-05T10:00:00.000Z',
    ids.first,
    createHistoricalActivitySnapshot(
      activity(ids.first, 'Old name', null, '#123456'),
      null,
      '2026-09-05T10:00:00.000Z'
    )
  );
}

// Logical periods use local calendar operations, including non-midnight starts.
const rolloverOptions = { rolloverHour: 4, weekStartsOn: 1 };
const earlyMorning = localTimestamp(2026, 9, 9, 2, 30);
assertEqual(
  historyDayPeriod(earlyMorning, rolloverOptions).key,
  '2026-09-08',
  'pre-rollover time belongs to the preceding logical day'
);
const day = historyDayPeriod(localTimestamp(2026, 9, 9, 12), rolloverOptions);
assertEqual(day.startLogicalDay, '2026-09-09', 'logical day starts on its configured wall date');
assertEqual(
  new Date(day.startMs).getHours(),
  4,
  'logical day start uses the configured rollover hour'
);
const week = historyWeekPeriod(localTimestamp(2026, 9, 9, 12), rolloverOptions);
assertEqual(week.startLogicalDay, '2026-09-07', 'Monday week-start preference is respected');
assertEqual(week.endLogicalDay, '2026-09-13', 'week contains exactly seven logical calendar days');
const month = historyMonthPeriod('2026-09', rolloverOptions);
const nextMonthDay = historyDayPeriod('2026-10-01', rolloverOptions);
assertEqual(month.startLogicalDay, '2026-09-01', 'month starts at the first logical day');
assertEqual(month.endLogicalDay, '2026-09-30', 'month ends at the last logical day');
assertEqual(
  month.endMs,
  nextMonthDay.startMs,
  'month end is the next month rollover start, not the next day end'
);
assertEqual(
  month.endMs,
  logicalDayBounds('2026-10-01', rolloverOptions).startMs,
  'month end matches the configured non-midnight rollover boundary'
);
const year = historyYearPeriod('2026', rolloverOptions);
const nextYearDay = historyDayPeriod('2027-01-01', rolloverOptions);
assertEqual(year.endLogicalDay, '2026-12-31', 'year ends at the last logical day');
assertEqual(
  year.endMs,
  nextYearDay.startMs,
  'year end is the next year rollover start, not the next day end'
);
const monthBoundarySession = session(
  ids.transitionA,
  ids.first,
  month.endMs - 90 * 60 * 1000,
  month.endMs + 90 * 60 * 1000
);
const monthClip = clipHistorySession(monthBoundarySession, month);
assertEqual(monthClip?.endMs, month.endMs, 'month clipping stops at the exact next-month boundary');
assertEqual(
  monthClip && monthClip.endMs - monthClip.startMs,
  90 * 60 * 1000,
  'month clipping retains only the visible pre-boundary duration'
);
const yearBoundarySession = session(
  ids.transitionB,
  ids.second,
  year.endMs - 2 * 60 * 60 * 1000,
  year.endMs + 2 * 60 * 60 * 1000
);
const yearClip = clipHistorySession(yearBoundarySession, year);
assertEqual(yearClip?.endMs, year.endMs, 'year clipping stops at the exact next-year boundary');
assertEqual(
  yearClip && yearClip.endMs - yearClip.startMs,
  2 * 60 * 60 * 1000,
  'year clipping retains only the visible pre-boundary duration'
);
assertEqual(
  previousHistoryPeriod(day, rolloverOptions).key,
  '2026-09-08',
  'previous day period shifts by one calendar day'
);
assertEqual(
  comparisonHistoryPeriod(week, rolloverOptions).startLogicalDay,
  '2026-08-31',
  'comparison period is the immediately preceding period'
);
assert(
  nextHistoryPeriod(week, rolloverOptions, day.startMs) === null,
  'future periods are guarded'
);
assertEqual(
  currentHistoryPeriod('day', timestampMs(earlyMorning), rolloverOptions).key,
  '2026-09-08',
  'current period uses logical-day semantics'
);
assertEqual(
  historyPeriodForDate('month', localTimestamp(2026, 9, 9, 12), rolloverOptions).key,
  '2026-09',
  'generic period helper selects the requested month'
);

// Session materialization clips calendar ranges, keeps short sessions, and omits null gaps.
const now = timestampMs(localTimestamp(2026, 9, 10, 12));
const timelineRange = historyDayPeriod(localTimestamp(2026, 9, 10, 12), rolloverOptions);
const timelineTransitions = [
  transition(ids.transitionA, localTimestamp(2026, 9, 10, 3, 30), ids.first),
  transition(ids.transitionB, localTimestamp(2026, 9, 10, 5, 0), ids.second),
  transition(ids.transitionC, localTimestamp(2026, 9, 10, 5, 0, 20), null),
  transition(ids.transitionD, localTimestamp(2026, 9, 10, 11, 59, 50), ids.first),
];
const materialized = materializeHistorySessions(timelineTransitions, timelineRange, now);
assertEqual(materialized.length, 3, 'null transitions are blank gaps, not History sessions');
assertEqual(
  materialized[0].startMs,
  timelineRange.startMs,
  'a session crossing the logical day boundary is clipped at the day start'
);
assertEqual(
  materialized[0].endMs - materialized[0].startMs,
  60 * 60 * 1000,
  'cross-boundary clipping preserves the visible duration'
);
assertEqual(
  materialized[1].endMs - materialized[1].startMs,
  20_000,
  'under-one-minute sessions remain discoverable and truthful'
);
assert(materialized[2].isRunning, 'the current activity session is marked running');
const clipped = clipHistorySession(materialized[1], {
  startMs: materialized[1].startMs + 5_000,
  endMs: materialized[1].endMs + 5_000,
});
assertEqual(clipped?.endMs, materialized[1].endMs, 'session clipping preserves the true end');
assertEqual(
  historySessionOverlapMs(materialized[0], timelineRange),
  materialized[0].endMs - materialized[0].startMs,
  'overlap helper reports the clipped duration'
);

// DST-aware day lengths are calendar-derived rather than forced to 24 hours.
const dstBefore = new Date(2026, 2, 8).getTimezoneOffset();
const dstAfter = new Date(2026, 2, 9).getTimezoneOffset();
if (dstBefore !== dstAfter) {
  const dstDay = historyDayPeriod(localTimestamp(2026, 3, 8, 12), { rolloverHour: 0 });
  assertEqual(
    dstDay.endMs - dstDay.startMs,
    23 * 60 * 60 * 1000,
    'spring-forward logical day uses the local DST boundary'
  );
}

// Snapshots win over present-day catalog values, including moved/root/deleted entities.
const oldFolder = folder(ids.folder, 'Old folder');
const movedFolder = folder(ids.movedFolder, 'New folder');
const first = activity(ids.first, 'Old activity', ids.folder, '#123456');
const second = activity(ids.second, 'Second activity', null, '#123456');
const currentCatalog = catalog({ folders: [oldFolder, movedFolder], activities: [first, second] });
const legacy = transition(ids.transitionA, '2026-09-05T10:00:00.000Z', ids.first);
const backfilled = backfillHistoricalActivitySnapshots([legacy], currentCatalog);
assertEqual(backfilled.updatedCount, 1, 'legacy transitions are backfilled once');
assertEqual(
  backfilled.transitions[0].activitySnapshot?.name,
  'Old activity',
  'backfill captures the current best-known activity name'
);
const oldSnapshot = backfilled.transitions[0].activitySnapshot;
const changedCatalog = catalog({
  folders: [movedFolder],
  activities: [activity(ids.first, 'Renamed activity', ids.movedFolder, '#ABCDEF'), second],
});
const preserved = backfillHistoricalActivitySnapshots(backfilled.transitions, changedCatalog);
assertEqual(preserved.updatedCount, 0, 'backfill never overwrites an existing snapshot');
assertEqual(
  preserved.transitions[0].activitySnapshot?.folderName,
  oldFolder.name,
  'folder movement does not rewrite historical folder metadata'
);
assertEqual(
  historicalActivitySnapshotForCatalogItem(changedCatalog, ids.first)?.name,
  'Renamed activity',
  'new snapshots use the current catalog value'
);
assertEqual(
  createHistoricalActivitySnapshot(second, null).color,
  '#123456',
  'root activities retain their user color in snapshots'
);

const historicalSessions = [
  session(ids.transitionA, ids.first, 0, 20 * 60 * 1000, oldSnapshot),
  session(
    ids.transitionB,
    ids.second,
    20 * 60 * 1000,
    40 * 60 * 1000,
    createHistoricalActivitySnapshot(second, null)
  ),
];
const aggregate = aggregateHistory(historicalSessions, { startMs: 0, endMs: 40 * 60 * 1000 });
assertEqual(aggregate.totalMs, 40 * 60 * 1000, 'range aggregation clips and totals tracked time');
assertEqual(aggregate.activities.length, 2, 'same colors do not merge distinct activities');
assertEqual(aggregate.activities[0].color, '#123456', 'activity totals preserve snapshot color');
assertEqual(aggregate.folders.length, 2, 'root and folder activity totals remain distinct');
assert(
  aggregate.folders.some((value) => value.folderId === null),
  'root activity totals use a stable root grouping'
);
assertEqual(
  aggregateActivityTotals(historicalSessions, { startMs: 10 * 60 * 1000, endMs: 30 * 60 * 1000 })[0]
    .durationMs,
  10 * 60 * 1000,
  'activity totals clip sessions at both range boundaries'
);
assertEqual(
  aggregateFolderTotals(historicalSessions).find((value) => value.folderId === ids.folder)
    ?.activityColors[0],
  '#123456',
  'folder totals expose child activity colors without inventing folder colors'
);
const weekDays = aggregateHistoryByDay(
  [
    session(
      ids.transitionA,
      ids.first,
      week.startMs - 60 * 60 * 1000,
      week.startMs + 60 * 60 * 1000
    ),
  ],
  week,
  rolloverOptions
);
assertEqual(
  weekDays[0].totalMs,
  60 * 60 * 1000,
  'daily grouping clips a cross-day session to day one'
);
assertEqual(weekDays[1].totalMs, 0, 'daily grouping leaves the following day empty after clipping');

async function run(): Promise<void> {
  // New writes snapshot catalog metadata; timestamp edits preserve it, reassignment refreshes it.
  const repository = new MemoryTrackerRepository();
  const trackerNow = localTimestamp(2026, 9, 12, 12);
  const tracker = createTrackerService(repository, {
    now: () => trackerNow,
    resolveActivitySnapshot: async (activityId, capturedAt) =>
      historicalActivitySnapshotForCatalogItem(
        catalog({ folders: [oldFolder], activities: [first, second] }),
        activityId,
        capturedAt
      ),
  });
  const written = await tracker.insertTransition({
    id: ids.transitionE,
    activityId: ids.first,
    timestamp: trackerNow,
  });
  assertEqual(
    written.activitySnapshot?.name,
    'Old activity',
    'new transition captures activity metadata'
  );
  const edited = await tracker.editTransition(ids.transitionE, {
    timestamp: localTimestamp(2026, 9, 12, 11),
  });
  assertEqual(edited.activitySnapshot?.name, 'Old activity', 'ordinary edits preserve snapshots');
  const reassigned = await tracker.reassignTransition(ids.transitionE, ids.second);
  assertEqual(
    reassigned.activitySnapshot?.id,
    ids.second,
    'explicit reassignment updates snapshot identity'
  );
  assertEqual(
    reassigned.activitySnapshot?.folderId,
    null,
    'reassignment updates folder relationship'
  );

  // Backup imports retain deleted-activity snapshots and backfill legacy known IDs.
  const backup = parseBackup({
    format: 'life-tracker-backup',
    backupVersion: CURRENT_BACKUP_VERSION,
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    exportedAt: '2026-09-12T12:00:00.000Z',
    appVersion: '0.1.0',
    settings: {
      settingsVersion: 1,
      logicalDayRolloverHour: 0,
      appearance: 'system',
      weekStartsOn: 1,
      minimumActivityDurationMs: 0,
      alarmSettings: { enabled: false, leadTimeMs: 0, sound: false, vibration: false },
      defaultRoutineBehavior: 'resume',
      showArchived: false,
    },
    catalog: catalog(),
    routineDefinitions: [],
    transitions: [emptyBackupTransition()],
    routineHistory: [],
    activeRoutine: null,
    habits: [],
    habitDayStates: [],
  });
  assertEqual(
    backup.backup.transitions[0].activitySnapshot?.name,
    'Old name',
    'backup validation permits deleted activities when a snapshot identifies them'
  );

  console.log('Validated History periods, snapshots, aggregation, tracker writes, and backups.');
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
