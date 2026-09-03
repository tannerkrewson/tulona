import {
  BackupRepository,
  DatasetManager,
  AsyncStorageDatabase,
  datasetKey,
  type AsyncStorageLike,
} from '../src/data';
import type { CatalogCollection, AppSettings, Transition } from '../src/domain';
import { logicalDayBounds } from '../src/domain';
import {
  BACKUP_FORMAT,
  BackupMigrationRegistry,
  CURRENT_BACKUP_SCHEMA_VERSION,
  CURRENT_BACKUP_VERSION,
  exportBackup,
  intervalsToCsv,
  parseBackup,
  serializeBackup,
  DatasetReplacementService,
  type LifeTrackerBackup,
} from '../src/backup';
import { createReportingService, type ReportingDependencies } from '../src/reporting';
import type { ReportTimelineEntry } from '../src/reporting/reporting-service';

const ids = {
  folder: '11111111-1111-4111-8111-111111111111',
  activity: '22222222-2222-4222-8222-222222222222',
  root: '33333333-3333-4333-8333-333333333333',
  oldDataset: '44444444-4444-4444-8444-444444444444',
  newDataset: '55555555-5555-4555-8555-555555555555',
};

const timestamp = '2026-08-30T00:00:00.000Z';
const settings: AppSettings = {
  settingsVersion: 1,
  logicalDayRolloverHour: 3,
  appearance: 'system',
  weekStartsOn: 1,
  minimumActivityDurationMs: 0,
  alarmSettings: { enabled: false, leadTimeMs: 0, sound: true, vibration: true, volume: 1 },
  defaultRoutineBehavior: 'resume',
  showArchived: false,
};
const folder = {
  id: ids.folder,
  name: 'Archived work',
  sortOrder: 0,
  color: '#112233',
  iconName: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  archivedAt: timestamp,
} as const;
const catalog: CatalogCollection = {
  folders: [folder],
  activities: [
    {
      id: ids.activity,
      kind: 'activity',
      name: 'Deep, "work"',
      folderId: ids.folder,
      sortOrder: 0,
      color: '#445566',
      iconName: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: timestamp,
    },
    {
      id: ids.root,
      kind: 'activity',
      name: 'Root work',
      folderId: null,
      sortOrder: 1,
      color: null,
      iconName: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    },
  ],
  routines: [],
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class MemoryStorage implements AsyncStorageLike {
  readonly values = new Map<string, string>();
  failOnKey: string | null = null;

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    if (this.failOnKey === key) throw new Error(`write unavailable for ${key}`);
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }

  async getAllKeys(): Promise<readonly string[]> {
    return [...this.values.keys()];
  }
}

function transition(id: string, activityId: string | null, value: string): Transition {
  return {
    id,
    activityId,
    timestamp: value,
    source: 'manual',
    status: 'recorded',
    createdAt: value,
    correctionOfId: null,
    note: null,
  };
}

function localTimestamp(day: number, hour: number): number {
  return new Date(2026, 7, day, hour, 0, 0, 0).getTime();
}

function backupDocument(): LifeTrackerBackup {
  return {
    format: BACKUP_FORMAT,
    backupVersion: CURRENT_BACKUP_VERSION,
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    exportedAt: timestamp,
    appVersion: '0.1.0',
    settings,
    catalog,
    routineDefinitions: [],
    transitions: [],
    routineHistory: [],
    activeRoutine: null,
    habits: [],
    habitDayStates: [],
  };
}

async function reportingChecks(): Promise<void> {
  const dayIntervals = [
    {
      startMs: localTimestamp(29, 23),
      endMs: localTimestamp(30, 4),
      activityId: ids.activity,
      transitionId: '66666666-6666-4666-8666-666666666666',
    },
    {
      startMs: localTimestamp(30, 4),
      endMs: localTimestamp(30, 5),
      activityId: ids.root,
      transitionId: '77777777-7777-4777-8777-777777777777',
    },
  ];
  const dependencies: ReportingDependencies = {
    catalog: { read: async () => catalog },
    tracker: {
      query: async (range, nowMs = Date.now()) => ({
        range,
        nowMs,
        transitions: [],
        intervals: dayIntervals
          .map((interval) => ({
            ...interval,
            startMs: Math.max(interval.startMs, range.startMs),
            endMs: Math.min(interval.endMs, range.endMs),
          }))
          .filter((interval) => interval.endMs > interval.startMs),
        activeTransition: transition(
          '88888888-8888-4888-8888-888888888888',
          ids.root,
          new Date(localTimestamp(30, 5)).toISOString()
        ),
      }),
    },
    settings: { read: async () => settings },
  };
  const service = createReportingService(dependencies, {
    now: () => localTimestamp(30, 5),
  });
  const report = await service.day('2026-08-30');
  const expectedRange = logicalDayBounds('2026-08-30', { rolloverHour: 3 });
  assert(
    report.totalMs === 2 * 60 * 60 * 1000 &&
      report.range.startMs === expectedRange.startMs &&
      report.range.endMs === expectedRange.endMs,
    'daily report must clip intervals at both boundaries'
  );
  assert(report.activities[0]?.name === 'Deep, "work"', 'archived activity name must resolve');
  assert(report.activities[0]?.displayColor === '#112233', 'archived folder color must resolve');
  assert(
    report.folders[0]?.durationMs === 60 * 60 * 1000,
    'folder total must include child time once'
  );
  const week = await service.week('2026-08-30');
  assert(week.daily.length === 7 && week.start === '2026-08-24', 'week must honor Monday start');
}

async function backupChecks(): Promise<void> {
  const parsed = parseBackup(serializeBackup(backupDocument()));
  assert(parsed.summary.activities === 2, 'valid backup must produce a semantic summary');
  const withTransientState = { ...backupDocument(), transientUiState: { selectedTab: 'backup' } };
  assert(
    !serializeBackup(withTransientState as LifeTrackerBackup).includes('transientUiState'),
    'serialized backups must exclude transient UI state'
  );
  const migrations = new BackupMigrationRegistry();
  migrations.register({
    fromVersion: 0,
    toVersion: 1,
    migrate: (value) => ({ ...(value as Record<string, unknown>), backupVersion: 1 }),
  });
  const migrated = parseBackup({ ...backupDocument(), backupVersion: 0 } as unknown, {
    migrations,
  });
  assert(
    migrated.summary.migrationsApplied[0] === 1,
    'imports must apply sequential migrations in memory'
  );
  try {
    parseBackup('{"format":"life-tracker-backup","backupVersion":99,"schemaVersion":1}');
    throw new Error('newer backup versions must be rejected');
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes('newer'),
      'unsupported version error is explicit'
    );
  }
  const csvEntry: ReportTimelineEntry = {
    id: ids.activity,
    kind: 'activity',
    name: 'Deep, "work"',
    durationMs: 1000,
    displayColor: '#112233',
    folderId: ids.folder,
    folderName: 'Folder\nname',
    isArchived: true,
    startMs: Date.parse('2026-08-30T04:00:00.000Z'),
    endMs: Date.parse('2026-08-30T04:00:01.000Z'),
    transitionId: '99999999-9999-4999-8999-999999999999',
  };
  const csv = intervalsToCsv([csvEntry]);
  assert(
    csv.includes('"Deep, ""work"""') && csv.includes('"Folder\nname"'),
    'CSV values must be safely escaped'
  );

  const storage = new MemoryStorage();
  const database = new AsyncStorageDatabase(storage);
  const manager = new DatasetManager(database);
  const oldNamespace = await manager.create('Current', ids.oldDataset);
  await manager.activate(ids.oldDataset);
  const repository = new BackupRepository(database);
  await repository.write(oldNamespace, {
    settings,
    catalog,
    transitions: [
      transition('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ids.activity, '2026-08-30T04:00:00.000Z'),
    ],
    routineHistory: [],
    activeRoutine: null,
    habits: [],
    habitDayStates: [],
  });
  const backup = await exportBackup(repository, oldNamespace, { exportedAt: timestamp });
  const replacement = new DatasetReplacementService(database, manager, repository);
  const before = await manager.active();
  try {
    await replacement.replaceCurrentData('{"not":"a backup"}');
    throw new Error('invalid replacement should fail');
  } catch {
    assert(
      (await manager.active())?.datasetId === before?.datasetId,
      'invalid import must not switch data'
    );
  }
  const metadataBeforeFailedWrite = await database.read('tulona:metadata');
  const currentDataBeforeFailedWrite = await repository.read(oldNamespace);
  storage.failOnKey = datasetKey(ids.newDataset, 'settings');
  try {
    await replacement.replaceCurrentData(serializeBackup(backup), {
      datasetId: ids.newDataset,
    });
    throw new Error('failed replacement should fail');
  } catch {
    assert(
      (await database.read('tulona:metadata')) === metadataBeforeFailedWrite,
      'failed replacement must not mutate active metadata'
    );
    assert(
      JSON.stringify(await repository.read(oldNamespace)) ===
        JSON.stringify(currentDataBeforeFailedWrite),
      'failed replacement must preserve the current dataset contents'
    );
  }
  storage.failOnKey = null;
  let verifiedBeforeActivation = false;
  const verifyingReplacement = new DatasetReplacementService(database, manager, {
    read: (namespace) => repository.read(namespace),
    write: (namespace, snapshot) => repository.write(namespace, snapshot),
    verify: async (namespace, expected) => {
      assert(
        (await manager.active())?.datasetId === ids.oldDataset,
        'replacement must verify the target before activating it'
      );
      verifiedBeforeActivation = true;
      await repository.verify(namespace, expected);
    },
  });
  const result = await verifyingReplacement.replaceCurrentData(serializeBackup(backup), {
    datasetId: ids.newDataset,
  });
  assert(verifiedBeforeActivation, 'replacement must perform repository verification');
  assert(result.previousDatasetId === ids.oldDataset, 'replacement reports prior dataset');
  assert(
    (await manager.active())?.datasetId === ids.newDataset,
    'verified replacement switches metadata'
  );
  assert(
    (await repository.read(oldNamespace)).transitions.length === 1,
    'old data remains retained after activation'
  );
  const reloadedManager = new DatasetManager(database);
  const reloadedNamespace = await reloadedManager.active();
  assert(
    reloadedNamespace?.datasetId === ids.newDataset,
    'a fresh dataset manager hydrates the replacement as active'
  );
  const repeated = await replacement.replaceCurrentData(serializeBackup(backup), {
    datasetId: ids.newDataset,
  });
  assert(repeated.datasetId === ids.newDataset, 'repeating an activated replacement is idempotent');
  assert(
    (await repository.read(reloadedNamespace)).transitions.length === 1,
    'repeating an activated replacement does not duplicate transitions'
  );
}

void Promise.all([reportingChecks(), backupChecks()]).catch((error: unknown) => {
  throw error;
});
