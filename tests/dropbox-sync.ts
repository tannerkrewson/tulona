import * as Automerge from '@automerge/automerge';
import type { Dropbox, DropboxAuth } from 'dropbox';

import {
  BACKUP_FORMAT,
  CURRENT_BACKUP_SCHEMA_VERSION,
  CURRENT_BACKUP_VERSION,
  DropboxBackupService,
  DROPBOX_SYNC_PATH,
  createSyncDocument,
  dropboxSyncStorageKey,
  documentHeads,
  getDocumentConflicts,
  loadSyncDocument,
  mergeSyncDocuments,
  parseBackup,
  projectSyncDocument,
  saveSyncDocument,
  serializeBackup,
  updateSyncDocumentFromBackup,
  type DropboxBackupServiceOptions,
  type LifeTrackerBackup,
  type SyncDocument,
} from '../src/backup';
import { defaultGoalSettings } from '../src/domain';
import { AsyncStorageDatabase, type AsyncStorageLike } from '../src/data';
import { emptyDropboxBackupRecord } from '../src/backup/dropbox-backup-storage';

const DATASET_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STAMP = '2026-09-01T12:00:00.000Z';
const IDs = {
  activityA: '11111111-1111-4111-8111-111111111111',
  activityB: '22222222-2222-4222-8222-222222222222',
  activityC: '33333333-3333-4333-8333-333333333333',
  folder: '44444444-4444-4444-8444-444444444444',
  routine: '55555555-5555-4555-8555-555555555555',
  stepA: '66666666-6666-4666-8666-666666666666',
  stepB: '77777777-7777-4777-8777-777777777777',
  habit: '88888888-8888-4888-8888-888888888888',
  goal: '99999999-9999-4999-8999-999999999999',
  transitionA: 'aaaaaaaa-1111-4111-8111-111111111111',
  transitionB: 'bbbbbbbb-2222-4222-8222-222222222222',
  transitionC: 'cccccccc-3333-4333-8333-333333333333',
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function actorId(value: string): string {
  return [...value]
    .map((character) => character.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('')
    .padEnd(32, '0')
    .slice(0, 32);
}

function baseBackup(): LifeTrackerBackup {
  const goalSettings = defaultGoalSettings();
  const status = goalSettings.statusDefinitions[0]!;
  const routine = {
    id: IDs.routine,
    kind: 'routine' as const,
    name: 'Morning routine',
    folderId: null,
    sortOrder: 0,
    color: null,
    iconName: null,
    trackingMode: 'overall' as const,
    steps: [
      {
        id: IDs.stepA,
        activityId: null,
        name: 'Start',
        durationMs: 60_000,
        sortOrder: 0,
        color: null,
        iconName: null,
        endBehavior: 'overtime' as const,
        notes: null,
        createdAt: STAMP,
        updatedAt: STAMP,
        archivedAt: null,
      },
    ],
    createdAt: STAMP,
    updatedAt: STAMP,
    archivedAt: null,
  };
  return {
    format: BACKUP_FORMAT,
    backupVersion: CURRENT_BACKUP_VERSION,
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    exportedAt: STAMP,
    appVersion: '0.1.0',
    settings: {
      settingsVersion: 1,
      logicalDayRolloverHour: 3,
      appearance: 'system',
      weekStartsOn: 1,
      minimumActivityDurationMs: 0,
      alarmSettings: { enabled: false, leadTimeMs: 0, sound: true, vibration: true, volume: 1 },
      defaultRoutineBehavior: 'resume',
      showArchived: false,
    },
    catalog: {
      folders: [],
      activities: [
        {
          id: IDs.activityA,
          kind: 'activity',
          name: 'Reading',
          folderId: null,
          sortOrder: 0,
          color: '#123456',
          iconName: null,
          createdAt: STAMP,
          updatedAt: STAMP,
          archivedAt: null,
        },
      ],
      routines: [routine],
    },
    routineDefinitions: [routine],
    transitions: [],
    routineHistory: [],
    activeRoutine: null,
    habits: [
      {
        id: IDs.habit,
        name: 'Read daily',
        sortOrder: 0,
        schedule: { kind: 'daily' },
        trigger: null,
        color: null,
        iconName: null,
        createdAt: STAMP,
        updatedAt: STAMP,
        archivedAt: null,
      },
    ],
    habitDayStates: [
      {
        habitId: IDs.habit,
        logicalDay: '2026-09-01',
        manual: null,
        automatic: null,
        outcome: null,
        updatedAt: STAMP,
      },
    ],
    goals: [
      {
        id: IDs.goal,
        title: 'Make progress',
        sourceLinks: [],
        overallStatus: 'in-progress',
        evaluationMode: 'manual',
        rules: [],
        createdAt: STAMP,
        updatedAt: STAMP,
      },
    ],
    goalSettings,
    goalWeeks: [
      {
        weekStart: '2026-08-31',
        statuses: [
          {
            goalId: IDs.goal,
            weekStart: '2026-08-31',
            statusId: status.id,
            note: null,
            updatedAt: STAMP,
          },
        ],
      },
    ],
  };
}

function makeBranch(
  base: LifeTrackerBackup,
  actor: string,
  edit: (backup: LifeTrackerBackup) => void,
  sharedDocument?: SyncDocument
): SyncDocument {
  const changed = clone(base);
  edit(changed);
  return updateSyncDocumentFromBackup(
    sharedDocument
      ? Automerge.clone(sharedDocument, { actor: actorId(actor) })
      : createSyncDocument(base, actorId(actor), DATASET_ID),
    base,
    changed
  );
}

function hasConflict(document: SyncDocument, part: string): boolean {
  return getDocumentConflicts(document).some((conflict) => conflict.path.includes(part));
}

function activeRoutine(
  status: 'running' | 'paused' | 'completed'
): NonNullable<LifeTrackerBackup['activeRoutine']> {
  return {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    routineId: IDs.routine,
    routineSnapshot: {
      id: IDs.routine,
      name: 'Morning routine',
      trackingMode: 'overall',
      color: null,
      iconName: null,
      steps: [
        {
          id: IDs.stepA,
          activityId: null,
          name: 'Start',
          durationMs: 60_000,
          sortOrder: 0,
          color: null,
          iconName: null,
          endBehavior: 'overtime',
          notes: null,
        },
      ],
      capturedAt: STAMP,
    },
    status,
    startedAt: STAMP,
    pausedAt: status === 'paused' ? STAMP : null,
    completedAt: status === 'completed' ? STAMP : null,
    currentStepIndex: 0,
    currentStepStartedAt: STAMP,
    pausedDurationMs: 0,
    stepSessions: [
      {
        stepId: IDs.stepA,
        status: status === 'completed' ? 'completed' : 'active',
        startedAt: STAMP,
        completedAt: status === 'completed' ? STAMP : null,
        addedTimeMs: 0,
      },
    ],
  };
}

async function automergeSemantics(): Promise<void> {
  const base = baseBackup();
  const bootstrapEdit = clone(base);
  bootstrapEdit.catalog.activities[0]!.name = 'Legacy device edit';
  bootstrapEdit.catalog.activities[0]!.updatedAt = '2026-09-02T12:00:00.000Z';
  const independentBootstrapMerge = mergeSyncDocuments(
    createSyncDocument(base, actorId('bootstrap-local'), DATASET_ID),
    createSyncDocument(bootstrapEdit, actorId('bootstrap-remote'), DATASET_ID),
    base
  );
  assert(
    getDocumentConflicts(independentBootstrapMerge).some(
      (conflict) => conflict.path.includes('activities') && conflict.values.length === 2
    ),
    'first-sync scalar differences without shared causal history must be preserved as conflicts'
  );

  const sharedDocument = createSyncDocument(base, actorId('shared-history'), DATASET_ID);
  const branch = (actor: string, edit: (backup: LifeTrackerBackup) => void) =>
    makeBranch(base, actor, edit, sharedDocument);

  const deviceA = branch('device-a', (backup) => {
    backup.catalog.activities.push({
      ...clone(backup.catalog.activities[0]!),
      id: IDs.activityB,
      name: 'Drawing',
      sortOrder: 1,
    });
  });
  const deviceB = branch('device-b', (backup) => {
    backup.catalog.activities.push({
      ...clone(backup.catalog.activities[0]!),
      id: IDs.activityC,
      name: 'Writing',
      sortOrder: 2,
    });
  });
  let merged = mergeSyncDocuments(deviceA, deviceB, base);
  let projected = projectSyncDocument(merged).backup;
  assert(
    projected.catalog.activities.some((activity) => activity.id === IDs.activityB) &&
      projected.catalog.activities.some((activity) => activity.id === IDs.activityC),
    'independent additions from two devices must survive'
  );

  const differentFieldsA = branch('field-a', (backup) => {
    backup.catalog.activities[0]!.name = 'Deep reading';
  });
  const differentFieldsB = branch('field-b', (backup) => {
    backup.catalog.activities[0]!.color = '#abcdef';
  });
  merged = mergeSyncDocuments(differentFieldsA, differentFieldsB, base);
  projected = projectSyncDocument(merged).backup;
  assert(
    projected.catalog.activities[0]?.name === 'Deep reading' &&
      projected.catalog.activities[0]?.color === '#abcdef',
    'concurrent edits to different fields of one record must merge'
  );

  const sameFieldA = branch('same-a', (backup) => {
    backup.catalog.activities[0]!.name = 'Reading books';
  });
  const sameFieldB = branch('same-b', (backup) => {
    backup.catalog.activities[0]!.name = 'Read articles';
  });
  merged = mergeSyncDocuments(sameFieldA, sameFieldB, base);
  assert(
    hasConflict(merged, 'activities'),
    'same-field edits must be recorded as unresolved conflicts'
  );

  const deletion = branch('delete', (backup) => {
    backup.catalog.activities = [];
  });
  const edit = branch('edit', (backup) => {
    backup.catalog.activities[0]!.color = '#fedcba';
  });
  merged = mergeSyncDocuments(deletion, edit, base);
  projected = projectSyncDocument(merged).backup;
  assert(
    projected.catalog.activities.some(
      (activity) => activity.id === IDs.activityA && activity.color === '#fedcba'
    ) && getDocumentConflicts(merged).some((conflict) => conflict.kind === 'delete-edit'),
    'delete-versus-edit must preserve the edited record and retain a conflict marker'
  );
  const deletionSnapshot = clone(base);
  deletionSnapshot.catalog.activities = [];
  const deletionDocument = updateSyncDocumentFromBackup(
    Automerge.clone(sharedDocument, { actor: actorId('real-delete') }),
    base,
    deletionSnapshot
  );
  const containsDeleteOperation = Automerge.getAllChanges(deletionDocument).some((change) =>
    JSON.stringify(Automerge.decodeChange(change).ops).includes('"action":"del"')
  );
  assert(
    containsDeleteOperation,
    'a local record deletion must be represented as an Automerge delete operation'
  );

  const habitA = branch('habit-a', (backup) => {
    backup.habitDayStates[0]!.outcome = 'done';
  });
  const habitB = branch('habit-b', (backup) => {
    backup.habitDayStates[0]!.outcome = 'failed';
  });
  merged = mergeSyncDocuments(habitA, habitB, base);
  assert(hasConflict(merged, 'habitDayStates'), 'same habit-day edits must be surfaced');

  const goalA = branch('goal-a', (backup) => {
    backup.goalWeeks[0]!.statuses[0]!.note = 'Device A review';
  });
  const goalB = branch('goal-b', (backup) => {
    backup.goalWeeks[0]!.statuses[0]!.note = 'Device B review';
  });
  merged = mergeSyncDocuments(goalA, goalB, base);
  assert(hasConflict(merged, 'goalWeeks'), 'same goal-week edits must be surfaced');

  const routineA = branch('routine-a', (backup) => {
    backup.activeRoutine = activeRoutine('paused');
  });
  const routineB = branch('routine-b', (backup) => {
    backup.activeRoutine = activeRoutine('completed');
  });
  merged = mergeSyncDocuments(routineA, routineB, base);
  assert(
    hasConflict(merged, 'activeRoutine') &&
      ['paused', 'completed'].includes(
        projectSyncDocument(merged).backup.activeRoutine?.status ?? ''
      ),
    'concurrent active-routine replacements must keep one whole valid state and report both alternatives'
  );

  const settingA = branch('setting-a', (backup) => {
    backup.settings.weekStartsOn = 0;
  });
  const settingB = branch('setting-b', (backup) => {
    backup.settings.weekStartsOn = 6;
  });
  merged = mergeSyncDocuments(settingA, settingB, base);
  assert(hasConflict(merged, 'weekStartsOn'), 'settings scalar conflicts must be retained');

  const stepA = branch('step-a', (backup) => {
    backup.catalog.routines[0]!.steps.push({
      ...clone(backup.catalog.routines[0]!.steps[0]!),
      id: IDs.stepB,
      name: 'Finish',
      sortOrder: 1,
    });
    backup.routineDefinitions = clone(backup.catalog.routines);
  });
  const stepB = branch('step-b', (backup) => {
    backup.catalog.routines[0]!.steps.push({
      ...clone(backup.catalog.routines[0]!.steps[0]!),
      id: IDs.stepB.replace('7', '8'),
      name: 'Reflect',
      sortOrder: 1,
    });
    backup.routineDefinitions = clone(backup.catalog.routines);
  });
  merged = mergeSyncDocuments(stepA, stepB, base);
  assert(
    projectSyncDocument(merged).conflicts.some((conflict) => conflict.kind === 'routine-order'),
    'simultaneous routine steps with the same order must be reported'
  );

  const transitionA = branch('transition-a', (backup) => {
    backup.transitions.push({
      id: IDs.transitionA,
      activityId: IDs.activityA,
      timestamp: '2026-09-01T13:00:00.000Z',
      source: 'manual',
      status: 'recorded',
      createdAt: STAMP,
      correctionOfId: null,
      note: null,
    });
  });
  const transitionB = branch('transition-b', (backup) => {
    backup.transitions.push({
      id: IDs.transitionB,
      activityId: null,
      timestamp: '2026-09-01T13:00:00.000Z',
      source: 'manual',
      status: 'recorded',
      createdAt: STAMP,
      correctionOfId: null,
      note: null,
    });
  });
  merged = mergeSyncDocuments(transitionA, transitionB, base);
  projected = projectSyncDocument(merged).backup;
  assert(
    projectSyncDocument(merged).conflicts.some(
      (conflict) => conflict.kind === 'tracker-timestamp'
    ) &&
      projected.transitions.filter((transition) => transition.status === 'recorded').length === 1 &&
      Object.keys(merged.dataset.transitions).length === 2,
    'same-time tracker transitions stay in CRDT history while the valid local projection is deterministic'
  );

  const keyB = documentHeads(deviceB).join();
  assert(keyB.length > 0, 'Automerge documents must retain change heads');
}

class MemoryStorage implements AsyncStorageLike {
  readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }

  async getAllKeys(): Promise<readonly string[]> {
    return [...this.values.keys()];
  }
}

interface RemoteFile {
  rev: string;
  contents: string;
}

interface UploadArguments {
  path: string;
  contents: string;
  mode: { '.tag': 'add' } | { '.tag': 'update'; update: string };
  strict_conflict: boolean;
}

class FakeDropbox {
  readonly files = new Map<string, RemoteFile>();
  readonly uploads: UploadArguments[] = [];
  beforeNextUpload: ((upload: UploadArguments) => void | Promise<void>) | null = null;
  downloadGate: Promise<void> | null = null;
  releaseDownload: (() => void) | null = null;
  private revision = 0;

  async filesDownload(args: { path: string }): Promise<unknown> {
    if (this.downloadGate) await this.downloadGate;
    const file = this.files.get(args.path);
    if (!file) throw this.error(409, 'not_found');
    return {
      result: { rev: file.rev, fileBinary: new TextEncoder().encode(file.contents) },
    };
  }

  async filesUpload(upload: UploadArguments): Promise<unknown> {
    this.uploads.push(clone(upload));
    const beforeUpload = this.beforeNextUpload;
    this.beforeNextUpload = null;
    if (beforeUpload) await beforeUpload(upload);

    const current = this.files.get(upload.path);
    if (upload.mode['.tag'] === 'add' && current) throw this.error(409, 'conflict');
    if (upload.mode['.tag'] === 'update' && current?.rev !== upload.mode.update) {
      throw this.error(409, 'conflict');
    }
    const rev = `rev-${++this.revision}`;
    this.files.set(upload.path, { rev, contents: upload.contents });
    return { result: { rev } };
  }

  private error(status: number, tag: string): Error & { status: number; error: unknown } {
    return Object.assign(new Error(`Dropbox ${tag}`), {
      status,
      error: { error: { '.tag': tag } },
    });
  }
}

class FakeBackupService {
  private readonly fixtureKey: string;
  private backup: LifeTrackerBackup;
  private readonly entries = new Map<string, string>();
  beforeApply: (() => void) | null = null;

  constructor(
    backup: LifeTrackerBackup,
    readonly datasetId = DATASET_ID
  ) {
    this.backup = clone(backup);
    this.fixtureKey = `ds:${datasetId}:fixture`;
    this.updateFixtureEntry();
  }

  exportSynchronizationSnapshot = async () => ({
    backup: clone(this.backup),
    datasetId: this.datasetId,
    entries: new Map(this.entries),
  });

  inspectImport = (input: unknown) => parseBackup(input);

  applySynchronizationProjection = async (
    input: string | unknown,
    expectedDatasetId: string,
    expectedDatasetEntries: ReadonlyMap<string, string>,
    syncStateKey: string,
    expectedSyncState: string | null,
    nextSyncState: string
  ): Promise<boolean> => {
    this.beforeApply?.();
    this.beforeApply = null;
    if (expectedDatasetId !== this.datasetId) return false;
    const actualDatasetEntries = new Map(
      [...this.entries].filter(([key]) => key.startsWith(`ds:${this.datasetId}:`))
    );
    if (!sameMap(actualDatasetEntries, expectedDatasetEntries)) return false;
    if ((this.entries.get(syncStateKey) ?? null) !== expectedSyncState) return false;
    this.backup = parseBackup(input).backup;
    this.updateFixtureEntry();
    this.entries.set(syncStateKey, nextSyncState);
    return true;
  };

  setBackup(backup: LifeTrackerBackup): void {
    this.backup = clone(backup);
    this.updateFixtureEntry();
  }

  currentBackup(): LifeTrackerBackup {
    return clone(this.backup);
  }

  readSyncState(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  private updateFixtureEntry(): void {
    this.entries.set(this.fixtureKey, JSON.stringify(this.backup));
  }
}

function sameMap(left: ReadonlyMap<string, string>, right: ReadonlyMap<string, string>): boolean {
  return left.size === right.size && [...left].every(([key, value]) => right.get(key) === value);
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function remoteDocument(document: SyncDocument): string {
  return `TULONA_AUTOMERGE_SYNC_V1\n${toBase64(saveSyncDocument(document))}\n`;
}

function decodeRemoteDocument(contents: string): SyncDocument {
  const prefix = 'TULONA_AUTOMERGE_SYNC_V1\n';
  assert(contents.startsWith(prefix), 'test remote sync file should have a valid header');
  return loadSyncDocument(fromBase64(contents.slice(prefix.length).trim()), actorId('inspection'));
}

function addActivity(backup: LifeTrackerBackup, id: string, name: string, sortOrder: number): void {
  backup.catalog.activities.push({
    ...clone(backup.catalog.activities[0]!),
    id,
    name,
    sortOrder,
  });
}

async function makeServiceHarness(backup = baseBackup()) {
  const database = new AsyncStorageDatabase(new MemoryStorage());
  const record = emptyDropboxBackupRecord();
  record.enabled = true;
  record.refreshToken = 'refresh-token';
  record.accessToken = 'access-token';
  record.accessTokenExpiresAt = '2026-10-01T00:00:00.000Z';
  await database.write('tulona:dropbox-backup', JSON.stringify(record));
  const dropbox = new FakeDropbox();
  const local = new FakeBackupService(backup);
  const authFactory: NonNullable<DropboxBackupServiceOptions['authFactory']> = () =>
    ({}) as DropboxAuth;
  const clientFactory: NonNullable<DropboxBackupServiceOptions['clientFactory']> = () =>
    dropbox as unknown as Dropbox;
  const service = new DropboxBackupService(local, database, {
    appKey: 'test-app-key',
    redirectUri: 'https://example.test/dropbox-auth',
    debounceMs: 1,
    maxRetries: 4,
    now: () => Date.parse('2026-09-17T15:00:00.000Z'),
    authFactory,
    clientFactory,
  });
  return { database, dropbox, local, service };
}

async function waitFor(check: () => boolean, message: string): Promise<void> {
  const deadline = Date.now() + 1500;
  while (!check() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
  assert(check(), message);
}

async function migrationAndCorruptRemote(): Promise<void> {
  const localBackup = baseBackup();
  addActivity(localBackup, IDs.activityB, 'Local activity', 1);
  const legacyBackup = baseBackup();
  addActivity(legacyBackup, IDs.activityC, 'Legacy activity', 2);
  const harness = await makeServiceHarness(localBackup);
  const legacyJson = serializeBackup(legacyBackup);
  harness.dropbox.files.set('/tulona-backup.json', { rev: 'legacy-rev', contents: legacyJson });

  await harness.service.syncNow();
  const migrated = harness.dropbox.files.get(DROPBOX_SYNC_PATH);
  assert(migrated, 'first migration must create the new Automerge Dropbox file');
  const document = decodeRemoteDocument(migrated.contents);
  const projected = projectSyncDocument(document).backup;
  assert(
    projected.catalog.activities.some((activity) => activity.id === IDs.activityB) &&
      projected.catalog.activities.some((activity) => activity.id === IDs.activityC),
    'migration must union independent local and legacy backup records'
  );
  assert(
    parseBackup(
      harness.dropbox.files.get('/tulona-backup.json')?.contents ?? ''
    ).backup.catalog.activities.some((activity) => activity.id === IDs.activityB) &&
      parseBackup(
        harness.dropbox.files.get('/tulona-backup.json')?.contents ?? ''
      ).backup.catalog.activities.some((activity) => activity.id === IDs.activityC),
    'migration must retain legacy records in the current human-readable Dropbox backup'
  );

  const corrupt = await makeServiceHarness(baseBackup());
  corrupt.dropbox.files.set(DROPBOX_SYNC_PATH, {
    rev: 'bad-rev',
    contents: 'this is not an Automerge sync document',
  });
  const before = JSON.stringify(corrupt.local.currentBackup());
  try {
    await corrupt.service.syncNow();
    throw new Error('corrupt remote Automerge data must be rejected');
  } catch (error) {
    assert(error instanceof Error, 'corrupt remote data should report an error');
  }
  assert(
    JSON.stringify(corrupt.local.currentBackup()) === before &&
      corrupt.dropbox.uploads.length === 0,
    'invalid remote state must not change valid local data or be overwritten'
  );
  harness.database.close();
  corrupt.database.close();
}

async function revisionAndCreationRaces(): Promise<void> {
  const base = baseBackup();
  const localBackup = clone(base);
  addActivity(localBackup, IDs.activityB, 'Device A', 1);
  const harness = await makeServiceHarness(localBackup);
  const common = createSyncDocument(base, actorId('common'), DATASET_ID);
  harness.dropbox.files.set(DROPBOX_SYNC_PATH, {
    rev: 'start-rev',
    contents: remoteDocument(common),
  });
  const remoteBranch = clone(base);
  addActivity(remoteBranch, IDs.activityC, 'Device B', 2);
  const remoteConcurrent = updateSyncDocumentFromBackup(
    createSyncDocument(base, actorId('remote-device'), DATASET_ID),
    base,
    remoteBranch
  );
  harness.dropbox.beforeNextUpload = () => {
    harness.dropbox.files.set(DROPBOX_SYNC_PATH, {
      rev: 'intervening-rev',
      contents: remoteDocument(remoteConcurrent),
    });
  };

  await harness.service.syncNow();
  const finalDoc = decodeRemoteDocument(harness.dropbox.files.get(DROPBOX_SYNC_PATH)!.contents);
  const finalBackup = projectSyncDocument(finalDoc).backup;
  const syncUploads = harness.dropbox.uploads.filter((upload) => upload.path === DROPBOX_SYNC_PATH);
  assert(
    syncUploads.length === 2 &&
      syncUploads[0]?.mode['.tag'] === 'update' &&
      syncUploads[1]?.mode['.tag'] === 'update' &&
      syncUploads[1]?.mode.update === 'intervening-rev' &&
      syncUploads.every((upload) => upload.strict_conflict),
    'revision conflict must download, merge, and retry with the exact fresh rev'
  );
  assert(
    finalBackup.catalog.activities.some((activity) => activity.id === IDs.activityB) &&
      finalBackup.catalog.activities.some((activity) => activity.id === IDs.activityC),
    'revision retry must preserve both devices’ concurrent additions'
  );

  const creation = await makeServiceHarness(base);
  const racedDoc = updateSyncDocumentFromBackup(
    createSyncDocument(base, actorId('racing-device'), DATASET_ID),
    base,
    remoteBranch
  );
  creation.dropbox.beforeNextUpload = () => {
    creation.dropbox.files.set(DROPBOX_SYNC_PATH, {
      rev: 'created-by-other-client',
      contents: remoteDocument(racedDoc),
    });
  };
  await creation.service.syncNow();
  const creationSyncUploads = creation.dropbox.uploads.filter(
    (upload) => upload.path === DROPBOX_SYNC_PATH
  );
  assert(
    creationSyncUploads[0]?.mode['.tag'] === 'add' &&
      creationSyncUploads[1]?.mode['.tag'] === 'update' &&
      projectSyncDocument(
        decodeRemoteDocument(creation.dropbox.files.get(DROPBOX_SYNC_PATH)!.contents)
      ).backup.catalog.activities.some((activity) => activity.id === IDs.activityC),
    'a simultaneous first-file creation must recover from add conflict by merging the winner'
  );
  harness.database.close();
  creation.database.close();
}

async function writeDuringSync(): Promise<void> {
  const harness = await makeServiceHarness(baseBackup());
  harness.dropbox.downloadGate = new Promise<void>((resolve) => {
    harness.dropbox.releaseDownload = resolve;
  });
  const task = harness.service.syncNow();
  await waitFor(
    () => Boolean(harness.dropbox.releaseDownload),
    'sync should reach its remote read'
  );
  const changed = harness.local.currentBackup();
  addActivity(changed, IDs.activityB, 'Written during sync', 1);
  harness.local.setBackup(changed);
  harness.dropbox.releaseDownload?.();
  harness.dropbox.releaseDownload = null;
  harness.dropbox.downloadGate = null;
  await task;
  const remote = decodeRemoteDocument(harness.dropbox.files.get(DROPBOX_SYNC_PATH)!.contents);
  assert(
    projectSyncDocument(remote).backup.catalog.activities.some(
      (activity) => activity.id === IDs.activityB
    ),
    'a local write during Dropbox reads must be included before upload'
  );
  harness.database.close();
}

async function persistentLocalHistory(): Promise<void> {
  const harness = await makeServiceHarness(baseBackup());
  await harness.service.syncNow();
  const edited = harness.local.currentBackup();
  edited.catalog.activities[0]!.name = 'Persisted edit';
  harness.local.setBackup(edited);
  await harness.service.syncNow();
  const stateKey = dropboxSyncStorageKey(DATASET_ID);
  const savedState = harness.local.readSyncState(stateKey);
  assert(savedState, 'sync state must persist locally beside the dataset');
  const savedDocument = JSON.parse(savedState) as { document: string };
  const savedHeads = documentHeads(
    loadSyncDocument(fromBase64(savedDocument.document), actorId('before-reload'))
  ).sort();

  const authFactory: NonNullable<DropboxBackupServiceOptions['authFactory']> = () =>
    ({}) as DropboxAuth;
  const clientFactory: NonNullable<DropboxBackupServiceOptions['clientFactory']> = () =>
    harness.dropbox as unknown as Dropbox;
  const reloadedService = new DropboxBackupService(harness.local, harness.database, {
    appKey: 'test-app-key',
    redirectUri: 'https://example.test/dropbox-auth',
    authFactory,
    clientFactory,
    maxRetries: 4,
  });
  await reloadedService.syncNow();
  const reloadedState = JSON.parse(harness.local.readSyncState(stateKey) ?? '{}') as {
    document?: string;
  };
  const reloadedHeads = documentHeads(
    loadSyncDocument(fromBase64(reloadedState.document ?? ''), actorId('after-reload'))
  ).sort();
  assert(
    JSON.stringify(savedHeads) === JSON.stringify(reloadedHeads),
    'a later app instance must continue the persisted Automerge history instead of rebuilding it from JSON'
  );
  harness.database.close();
}

async function localMigrationHistoryAndCrossTabNotifications(): Promise<void> {
  const shared = new MemoryStorage();
  const tabA = new AsyncStorageDatabase(shared);
  const tabB = new AsyncStorageDatabase(shared);
  const observed = new Promise<readonly string[]>((resolve) => {
    const unsubscribe = tabB.subscribeToExternalWrites((keys) => {
      unsubscribe();
      resolve(keys);
    });
  });
  await tabA.write('ds:shared:catalog', 'updated');
  const externalKeys = await observed;
  assert(
    externalKeys.includes('ds:shared:catalog'),
    'a second tab must receive a cross-tab database change notification'
  );
  tabA.close();
  tabB.close();
}

async function run(): Promise<void> {
  await automergeSemantics();
  await migrationAndCorruptRemote();
  await revisionAndCreationRaces();
  await writeDuringSync();
  await persistentLocalHistory();
  await localMigrationHistoryAndCrossTabNotifications();
}

run().catch((error: unknown) => {
  throw error;
});
