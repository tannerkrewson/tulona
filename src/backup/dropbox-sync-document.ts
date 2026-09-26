import * as Automerge from '@automerge/automerge';

import { defaultGoalSettings } from '@domain';
import type {
  ActiveRoutine,
  AppSettings,
  CatalogCollection,
  Goal,
  GoalSettings,
  GoalStatusDefinition,
  GoalWeekCollection,
  Habit,
  HabitDayState,
  RoutineDefinition,
  RoutineRunHistory,
  RoutineStep,
  Transition,
} from '@domain';

import {
  BACKUP_FORMAT,
  CURRENT_BACKUP_SCHEMA_VERSION,
  CURRENT_BACKUP_VERSION,
  type LifeTrackerBackup,
} from './backup-schema';

export const DROPBOX_SYNC_FORMAT = 'tulona-automerge-sync' as const;
export const DROPBOX_SYNC_DOCUMENT_VERSION = 1 as const;

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };
interface JsonDiffChange {
  path: string;
  before: JsonValue | undefined;
  current: JsonValue;
  deleted: boolean;
}

type RoutineDefinitionCore = Omit<RoutineDefinition, 'steps'>;
interface RoutineStepRecord {
  routineId: string;
  value: RoutineStep;
}

export interface SyncConflict {
  id: string;
  kind: 'field' | 'delete-edit' | 'tracker-timestamp' | 'routine-order';
  path: string;
  message: string;
  values: JsonValue[];
  recordedAt: string;
}

export interface SyncDataset {
  settings: AppSettings;
  catalog: {
    folders: Record<string, CatalogCollection['folders'][number]>;
    activities: Record<string, CatalogCollection['activities'][number]>;
    routines: Record<string, RoutineDefinitionCore>;
  };
  routineSteps: Record<string, RoutineStepRecord>;
  transitions: Record<string, Transition>;
  routineHistory: Record<string, RoutineRunHistory>;
  activeRoutine: ActiveRoutine | null;
  habits: Record<string, Habit>;
  habitDayStates: Record<string, HabitDayState>;
  goals: Record<string, Goal>;
  goalSettings: Omit<GoalSettings, 'statusDefinitions'> & {
    statusDefinitions: Record<string, GoalStatusDefinition>;
  };
  goalWeeks: Record<string, Record<string, GoalWeekCollection['statuses'][number]>>;
}

export interface DropboxSyncDocument extends Record<string, unknown> {
  format: typeof DROPBOX_SYNC_FORMAT;
  version: typeof DROPBOX_SYNC_DOCUMENT_VERSION;
  datasetId: string;
  dataset: SyncDataset;
  conflicts: Record<string, SyncConflict>;
}

export type SyncDocument = Automerge.Doc<DropboxSyncDocument>;

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function entriesById<T extends { id: string }>(values: readonly T[]): Record<string, T> {
  return Object.fromEntries(values.map((value) => [value.id, cloneJson(value)]));
}

export function backupToSyncDataset(backup: LifeTrackerBackup): SyncDataset {
  const routines: Record<string, RoutineDefinitionCore> = {};
  const routineSteps: Record<string, RoutineStepRecord> = {};
  for (const routine of backup.catalog.routines) {
    const { steps, ...core } = routine;
    routines[routine.id] = cloneJson(core);
    for (const step of steps) {
      routineSteps[`${routine.id}:${step.id}`] = {
        routineId: routine.id,
        value: cloneJson(step),
      };
    }
  }
  const goalWeeks: SyncDataset['goalWeeks'] = {};
  for (const week of backup.goalWeeks) {
    goalWeeks[week.weekStart] = Object.fromEntries(
      week.statuses.map((status) => [status.goalId, cloneJson(status)])
    );
  }
  return {
    settings: cloneJson(backup.settings),
    catalog: {
      folders: entriesById(backup.catalog.folders),
      activities: entriesById(backup.catalog.activities),
      routines,
    },
    routineSteps,
    transitions: entriesById(backup.transitions),
    routineHistory: entriesById(backup.routineHistory),
    activeRoutine: cloneJson(backup.activeRoutine),
    habits: entriesById(backup.habits),
    habitDayStates: Object.fromEntries(
      backup.habitDayStates.map((state) => [
        habitDayKey(state.habitId, state.logicalDay),
        cloneJson(state),
      ])
    ),
    goals: entriesById(backup.goals),
    goalSettings: {
      reviewDay: backup.goalSettings.reviewDay,
      historicalCircleCount: backup.goalSettings.historicalCircleCount,
      statusDefinitions: entriesById(backup.goalSettings.statusDefinitions),
    },
    goalWeeks,
  };
}

export function createSyncDocument(
  backup: LifeTrackerBackup,
  actorId: string,
  datasetId: string
): SyncDocument {
  const seed = createEmptySyncDocument(datasetId);
  const seedBackup = projectSyncDocument(seed).backup;
  const branch = Automerge.clone(seed, { actor: actorId });
  return updateSyncDocumentFromBackup(branch, seedBackup, backup);
}

function createEmptySyncDocument(datasetId: string): SyncDocument {
  const seedActor = datasetId.replaceAll('-', '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(seedActor)) {
    throw new Error('A valid Tulona dataset ID is required to create sync history');
  }
  const goalSettings = defaultGoalSettings();
  const document = Automerge.init<DropboxSyncDocument>({ actor: seedActor });
  return Automerge.change(
    document,
    { message: 'Initialize Tulona synchronization state', time: undefined },
    (draft) => {
      draft.format = DROPBOX_SYNC_FORMAT;
      draft.version = DROPBOX_SYNC_DOCUMENT_VERSION;
      draft.datasetId = datasetId;
      draft.dataset = {
        settings: {
          settingsVersion: 1,
          logicalDayRolloverHour: 0,
          appearance: 'system',
          weekStartsOn: 0,
          minimumActivityDurationMs: 0,
          alarmSettings: { enabled: false, leadTimeMs: 0, sound: true, vibration: true, volume: 1 },
          defaultRoutineBehavior: 'resume',
          showArchived: false,
        },
        catalog: { folders: {}, activities: {}, routines: {} },
        routineSteps: {},
        transitions: {},
        routineHistory: {},
        activeRoutine: null,
        habits: {},
        habitDayStates: {},
        goals: {},
        goalSettings: {
          reviewDay: goalSettings.reviewDay,
          historicalCircleCount: goalSettings.historicalCircleCount,
          statusDefinitions: entriesById(goalSettings.statusDefinitions),
        },
        goalWeeks: {},
      };
      draft.conflicts = {};
    }
  );
}

export function mergeSyncDocuments(
  local: SyncDocument,
  remote: SyncDocument,
  baseline?: LifeTrackerBackup
): SyncDocument {
  if (local.datasetId !== remote.datasetId) {
    throw new Error('Dropbox sync document belongs to a different active Tulona dataset');
  }
  if (hasOnlyBootstrapHistory(local, remote)) {
    return mergeIndependentBootstrapDocuments(local, remote, baseline);
  }
  let merged = Automerge.merge(local, remote);
  if (baseline)
    merged = preserveDeleteEditValues(local, remote, merged, backupToSyncDataset(baseline));
  return archiveDocumentConflicts(merged);
}

function hasOnlyBootstrapHistory(local: SyncDocument, remote: SyncDocument): boolean {
  const seedHashes = Automerge.getAllChanges(createEmptySyncDocument(local.datasetId)).map(
    (change) => Automerge.decodeChange(change).hash
  );
  const remoteHashes = new Set(
    Automerge.getAllChanges(remote).map((change) => Automerge.decodeChange(change).hash)
  );
  const sharedHashes = Automerge.getAllChanges(local)
    .map((change) => Automerge.decodeChange(change).hash)
    .filter((hash) => remoteHashes.has(hash));
  return (
    sharedHashes.length === seedHashes.length &&
    seedHashes.every((hash) => sharedHashes.includes(hash))
  );
}

function mergeIndependentBootstrapDocuments(
  local: SyncDocument,
  remote: SyncDocument,
  baseline?: LifeTrackerBackup
): SyncDocument {
  const localDataset = backupToSyncDataset(
    projectSyncDocument(local).backup
  ) as unknown as JsonObject;
  const remoteDataset = backupToSyncDataset(
    projectSyncDocument(remote).backup
  ) as unknown as JsonObject;
  const baselineDataset = baseline
    ? (backupToSyncDataset(baseline) as unknown as JsonObject)
    : undefined;
  const conflicts: SyncConflict[] = [];
  const dataset = mergeBootstrapValue(
    baselineDataset,
    localDataset,
    remoteDataset,
    'dataset',
    conflicts
  ) as unknown as SyncDataset;
  conflicts.push(
    ...Object.values(local.conflicts).map(cloneJson),
    ...Object.values(remote.conflicts).map(cloneJson)
  );
  const sortedConflicts = [
    ...new Map(conflicts.map((conflict) => [conflict.id, conflict])).values(),
  ].sort((left, right) => left.id.localeCompare(right.id));
  const actorId = stableActorId(
    `${local.datasetId}:${JSON.stringify(dataset)}:${JSON.stringify(sortedConflicts)}`
  );
  let merged = createSyncDocumentFromDataset(dataset, actorId, local.datasetId);
  if (sortedConflicts.length > 0) {
    merged = Automerge.change(
      merged,
      { message: 'Preserve first-sync bootstrap conflicts', time: undefined },
      (draft) => {
        for (const conflict of sortedConflicts) draft.conflicts[conflict.id] = cloneJson(conflict);
      }
    );
  }
  return archiveDocumentConflicts(merged);
}

function createSyncDocumentFromDataset(
  dataset: SyncDataset,
  actorId: string,
  datasetId: string
): SyncDocument {
  const seed = createEmptySyncDocument(datasetId);
  const branch = Automerge.clone(seed, { actor: actorId });
  const before = cloneJson(seed.dataset) as unknown as JsonObject;
  const current = cloneJson(dataset) as unknown as JsonObject;
  const changes: JsonDiffChange[] = [];
  collectDiff(before, current, 'dataset', changes);
  if (changes.length === 0) return branch;
  return Automerge.change(
    branch,
    { message: 'Create merged first-sync history', time: undefined },
    (draft) => {
      for (const change of changes) {
        applyPathChange(
          draft as unknown as JsonObject,
          change.path,
          change.current,
          change.deleted
        );
      }
    }
  );
}

function mergeBootstrapValue(
  baseline: JsonValue | undefined,
  local: JsonValue | undefined,
  remote: JsonValue | undefined,
  path: string,
  conflicts: SyncConflict[],
  localUpdatedAt?: string,
  remoteUpdatedAt?: string
): JsonValue | undefined {
  if (local === undefined && remote === undefined) return undefined;
  if (local === undefined) {
    if (baseline !== undefined && isRecordMapEntryPath(path)) {
      if (jsonEqual(remote, baseline)) return undefined;
      conflicts.push(
        semanticConflict(
          'delete-edit',
          path,
          [null, remote],
          'A first-sync deletion raced with an edit. The edited record is preserved and both states are retained.'
        )
      );
    }
    return cloneJson(remote as JsonValue);
  }
  if (remote === undefined) {
    if (baseline !== undefined && isRecordMapEntryPath(path) && !jsonEqual(local, baseline)) {
      conflicts.push(
        semanticConflict(
          'delete-edit',
          path,
          [null, local],
          'A first-sync deletion may race with a local edit. The local record is preserved and both states are retained.'
        )
      );
    }
    // An absent record in a first-sync snapshot has no tombstone. Keep the present copy.
    return cloneJson(local);
  }
  if (jsonEqual(local, remote)) return cloneJson(local);

  if (path === 'dataset.activeRoutine') {
    conflicts.push(
      bootstrapFieldConflict(
        path,
        local,
        remote,
        'Concurrent active-routine states were found during first sync; one complete state is projected and both are retained.'
      )
    );
    return selectBootstrapWinner(local, remote, localUpdatedAt, remoteUpdatedAt);
  }

  if (isJsonObject(local) && isJsonObject(remote)) {
    const baselineObject = isJsonObject(baseline) ? baseline : undefined;
    const localStamp = typeof local.updatedAt === 'string' ? local.updatedAt : localUpdatedAt;
    const remoteStamp = typeof remote.updatedAt === 'string' ? remote.updatedAt : remoteUpdatedAt;
    const keys = [...new Set([...Object.keys(local), ...Object.keys(remote)])].sort();
    const result: JsonObject = {};
    for (const key of keys) {
      const value = mergeBootstrapValue(
        baselineObject?.[key],
        local[key],
        remote[key],
        `${path}.${key}`,
        conflicts,
        localStamp,
        remoteStamp
      );
      if (value !== undefined) result[key] = value;
    }
    return result;
  }

  conflicts.push(bootstrapFieldConflict(path, local, remote));
  return selectBootstrapWinner(local, remote, localUpdatedAt, remoteUpdatedAt);
}

function bootstrapFieldConflict(
  path: string,
  local: JsonValue,
  remote: JsonValue,
  message = `Concurrent first-sync values differ at ${path}; both are retained in conflict history.`
): SyncConflict {
  const values = [local, remote].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right))
  );
  return semanticConflict('field', path, values, message);
}

function selectBootstrapWinner(
  local: JsonValue,
  remote: JsonValue,
  localUpdatedAt?: string,
  remoteUpdatedAt?: string
): JsonValue {
  if (localUpdatedAt && remoteUpdatedAt && localUpdatedAt !== remoteUpdatedAt) {
    return cloneJson(localUpdatedAt > remoteUpdatedAt ? local : remote);
  }
  return cloneJson(
    JSON.stringify(local).localeCompare(JSON.stringify(remote)) <= 0 ? local : remote
  );
}

function jsonEqual(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecordMapEntryPath(path: string): boolean {
  const prefixes: readonly [string, number][] = [
    ['dataset.catalog.folders.', 1],
    ['dataset.catalog.activities.', 1],
    ['dataset.catalog.routines.', 1],
    ['dataset.routineSteps.', 1],
    ['dataset.transitions.', 1],
    ['dataset.routineHistory.', 1],
    ['dataset.habits.', 1],
    ['dataset.habitDayStates.', 1],
    ['dataset.goals.', 1],
    ['dataset.goalWeeks.', 2],
  ];
  return prefixes.some(([prefix, depth]) => {
    if (!path.startsWith(prefix)) return false;
    return path.slice(prefix.length).split('.').length === depth;
  });
}

function stableActorId(value: string): string {
  const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  const hashes = seeds.map((seed) => {
    let hash = seed;
    for (let index = 0; index < value.length; index += 1) {
      hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  });
  return hashes.join('');
}

export function changeSyncDocument(
  document: SyncDocument,
  change: (draft: DropboxSyncDocument) => void,
  message: string
): SyncDocument {
  return Automerge.change(document, { message }, change);
}

export function updateSyncDocumentFromBackup(
  document: SyncDocument,
  previousProjection: LifeTrackerBackup,
  nextLocal: LifeTrackerBackup
): SyncDocument {
  const before = backupToSyncDataset(previousProjection) as unknown as JsonObject;
  const current = backupToSyncDataset(nextLocal) as unknown as JsonObject;
  let result = document;
  const changes: JsonDiffChange[] = [];
  collectDiff(before, current, 'dataset', changes);
  if (changes.length === 0) return result;
  result = Automerge.change(result, { message: 'Apply local Tulona changes' }, (draft) => {
    for (const change of changes) {
      applyPathChange(draft as unknown as JsonObject, change.path, change.current, change.deleted);
    }
  });
  return archiveDocumentConflicts(result);
}

export interface SyncProjection {
  backup: LifeTrackerBackup;
  conflicts: SyncConflict[];
}

export function projectSyncDocument(
  document: SyncDocument,
  options: { exportedAt?: string; appVersion?: string } = {}
): SyncProjection {
  const dataset = document.dataset;
  const semanticConflicts: SyncConflict[] = [];
  const folders = Object.values(dataset.catalog.folders).map(cloneJson);
  const activities = Object.values(dataset.catalog.activities).map(cloneJson);
  const routineSteps = Object.values(dataset.routineSteps);
  const routines: RoutineDefinition[] = Object.values(dataset.catalog.routines).map((routine) => {
    const steps = routineSteps
      .filter((entry) => entry.routineId === routine.id)
      .map((entry) => cloneJson(entry.value))
      .sort(compareOrdered);
    const seenOrder = new Set<number>();
    for (const step of steps) {
      if (seenOrder.has(step.sortOrder)) {
        semanticConflicts.push(
          semanticConflict(
            'routine-order',
            `catalog.routines.${routine.id}.steps.${step.sortOrder}`,
            [step.sortOrder],
            `Routine steps in "${routine.name}" share sort order ${step.sortOrder}.`
          )
        );
      }
      seenOrder.add(step.sortOrder);
    }
    return { ...cloneJson(routine), steps };
  });
  const transitionsByTime = new Map<string, Transition>();
  for (const transition of Object.values(dataset.transitions).sort((a, b) =>
    a.id.localeCompare(b.id)
  )) {
    if (transition.status !== 'recorded') continue;
    const prior = transitionsByTime.get(transition.timestamp);
    if (!prior) transitionsByTime.set(transition.timestamp, transition);
    else {
      const winner = prior.id.localeCompare(transition.id) <= 0 ? prior : transition;
      const loser = winner.id === prior.id ? transition : prior;
      transitionsByTime.set(transition.timestamp, winner);
      semanticConflicts.push(
        semanticConflict(
          'tracker-timestamp',
          `transitions.${transition.timestamp}`,
          [winner, loser],
          `Two recorded tracker transitions use ${transition.timestamp}; both remain in sync history, and ${winner.id} is projected locally until resolved.`
        )
      );
    }
  }
  const conflictedTransitionIds = new Set(
    semanticConflicts
      .filter((conflict) => conflict.kind === 'tracker-timestamp')
      .flatMap((conflict) => conflict.values.map((value) => (value as unknown as Transition).id))
  );
  const transitions = Object.values(dataset.transitions)
    .filter(
      (transition) =>
        !conflictedTransitionIds.has(transition.id) ||
        transitionsByTime.get(transition.timestamp)?.id === transition.id
    )
    .map(cloneJson);
  const goalWeeks = Object.entries(dataset.goalWeeks)
    .map(([weekStart, statuses]) => ({
      weekStart,
      statuses: Object.values(statuses).map(cloneJson),
    }))
    .sort((left, right) => left.weekStart.localeCompare(right.weekStart));
  const statusDefinitions = Object.values(dataset.goalSettings.statusDefinitions)
    .sort(compareOrdered)
    .map((definition, sortOrder) => ({ ...cloneJson(definition), sortOrder }));
  const backup: LifeTrackerBackup = {
    format: BACKUP_FORMAT,
    backupVersion: CURRENT_BACKUP_VERSION,
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    appVersion: options.appVersion ?? '0.1.0',
    settings: cloneJson(dataset.settings),
    catalog: {
      folders: folders.sort(compareOrdered),
      activities: activities.sort(compareOrdered),
      routines: routines.sort(compareOrdered),
    },
    routineDefinitions: routines.sort(compareOrdered),
    transitions: transitions.sort(
      (left, right) =>
        left.timestamp.localeCompare(right.timestamp) || left.id.localeCompare(right.id)
    ),
    routineHistory: Object.values(dataset.routineHistory)
      .map(cloneJson)
      .sort(
        (left, right) =>
          left.completedAt.localeCompare(right.completedAt) || left.id.localeCompare(right.id)
      ),
    activeRoutine: cloneJson(dataset.activeRoutine),
    habits: Object.values(dataset.habits).map(cloneJson).sort(compareOrdered),
    habitDayStates: Object.values(dataset.habitDayStates)
      .map(cloneJson)
      .sort(
        (left, right) =>
          left.logicalDay.localeCompare(right.logicalDay) ||
          left.habitId.localeCompare(right.habitId)
      ),
    goals: Object.values(dataset.goals)
      .map(cloneJson)
      .sort((left, right) => left.id.localeCompare(right.id)),
    goalSettings: { ...cloneJson(dataset.goalSettings), statusDefinitions },
    goalWeeks,
  };
  return {
    backup,
    conflicts: [...Object.values(document.conflicts), ...semanticConflicts],
  };
}

export function getDocumentConflicts(document: SyncDocument): SyncConflict[] {
  return Object.values(document.conflicts).map(cloneJson);
}

export function saveSyncDocument(document: SyncDocument): Uint8Array {
  return Automerge.save(document);
}

export function loadSyncDocument(bytes: Uint8Array, actorId?: string): SyncDocument {
  const document = Automerge.load<DropboxSyncDocument>(
    bytes,
    actorId ? { actor: actorId } : undefined
  );
  if (
    document.format !== DROPBOX_SYNC_FORMAT ||
    document.version !== DROPBOX_SYNC_DOCUMENT_VERSION ||
    typeof document.datasetId !== 'string' ||
    !document.datasetId
  ) {
    throw new Error('Dropbox synchronization document has an unsupported format or version');
  }
  if (!document.dataset || !document.conflicts || typeof document.conflicts !== 'object') {
    throw new Error('Dropbox synchronization document is incomplete');
  }
  return archiveDocumentConflicts(document);
}

export function documentHeads(document: SyncDocument): string[] {
  return Automerge.getHeads(document);
}

export function mergeConcurrentBootstrapBackups(
  local: LifeTrackerBackup,
  remote: LifeTrackerBackup,
  actorId: string,
  datasetId: string
): SyncDocument {
  return mergeSyncDocuments(
    createSyncDocument(local, actorId, datasetId),
    createSyncDocument(remote, randomActorId(), datasetId)
  );
}

export function habitDayKey(habitId: string, logicalDay: string): string {
  return `${habitId}|${logicalDay}`;
}

export function randomActorId(): string {
  return globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID().replaceAll('-', '')
    : `${Date.now().toString(16)}${Math.random().toString(16).slice(2).padEnd(16, '0')}`.slice(
        0,
        32
      );
}

function compareOrdered<T extends { sortOrder: number; id: string }>(left: T, right: T): number {
  return left.sortOrder - right.sortOrder || left.id.localeCompare(right.id);
}

function collectDiff(
  before: JsonValue,
  current: JsonValue,
  path: string,
  changes: JsonDiffChange[]
): void {
  if (JSON.stringify(before) === JSON.stringify(current)) return;
  if (path === 'dataset.activeRoutine') {
    changes.push({ path, before, current, deleted: false });
    return;
  }
  if (isJsonObject(before) && isJsonObject(current)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(current)]);
    for (const key of keys) {
      const childPath = path ? `${path}.${key}` : key;
      if (!(key in current))
        changes.push({ path: childPath, before: before[key], current: null, deleted: true });
      else if (!(key in before))
        changes.push({
          path: childPath,
          before: undefined,
          current: current[key]!,
          deleted: false,
        });
      else collectDiff(before[key]!, current[key]!, childPath, changes);
    }
    return;
  }
  changes.push({ path, before, current, deleted: false });
}

function applyPathChange(
  target: JsonObject,
  path: string,
  value: JsonValue,
  deleted: boolean
): void {
  const segments = path.split('.');
  let parent = target;
  for (const segment of segments.slice(0, -1)) {
    const child = parent[segment];
    if (!isJsonObject(child)) return;
    parent = child;
  }
  const key = segments.at(-1);
  if (!key) return;
  if (deleted) delete parent[key];
  else parent[key] = cloneJson(value);
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function archiveDocumentConflicts(document: SyncDocument): SyncDocument {
  const detected = findAutomergeConflicts(document);
  const fresh = detected.filter((conflict) => !document.conflicts[conflict.id]);
  if (fresh.length === 0) return document;
  return Automerge.change(document, { message: 'Record unresolved sync conflicts' }, (draft) => {
    const target = draft.conflicts as Record<string, SyncConflict>;
    for (const conflict of fresh) target[conflict.id] = conflict;
  });
}

function findAutomergeConflicts(document: SyncDocument): SyncConflict[] {
  const found: SyncConflict[] = [];
  const visited = new WeakSet<object>();
  const walk = (value: unknown, path: string) => {
    if (typeof value !== 'object' || value === null || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    const object = value as Record<string, unknown>;
    for (const key of Object.keys(object)) {
      if (path === 'conflicts') continue;
      const conflicts = Automerge.getConflicts(object as never, key);
      if (conflicts && Object.keys(conflicts).length > 1) {
        const opIds = Object.keys(conflicts).sort();
        const values = opIds.map((opId) => cloneJson(conflicts[opId] as JsonValue));
        const distinctValues = new Map(values.map((item) => [JSON.stringify(item), item]));
        if (distinctValues.size < 2) {
          walk(object[key], path ? `${path}.${key}` : key);
          continue;
        }
        const conflictPath = path ? `${path}.${key}` : key;
        found.push({
          id: `field:${encodeURIComponent(conflictPath)}:${opIds.join(',')}`,
          kind: 'field',
          path: conflictPath,
          message: `Concurrent edits conflict at ${conflictPath}. The Automerge-selected value is projected locally; all alternatives are retained here.`,
          values: [...distinctValues.values()],
          recordedAt: '',
        });
      }
      walk(object[key], path ? `${path}.${key}` : key);
    }
  };
  walk(document, '');
  return found;
}

function semanticConflict(
  kind: SyncConflict['kind'],
  path: string,
  values: unknown[],
  message: string
): SyncConflict {
  const jsonValues = values.map((value) => cloneJson(value) as JsonValue);
  const id = `${kind}:${encodeURIComponent(path)}:${encodeURIComponent(JSON.stringify(jsonValues))}`;
  return { id, kind, path, values: jsonValues, message, recordedAt: '' };
}

function preserveDeleteEditValues(
  local: SyncDocument,
  remote: SyncDocument,
  mergedInput: SyncDocument,
  baseline: SyncDataset
): SyncDocument {
  let merged = mergedInput;
  const conflicts: SyncConflict[] = [];
  const entityMaps: {
    path: string;
    base: Record<string, unknown>;
    left: Record<string, unknown>;
    right: Record<string, unknown>;
  }[] = [
    {
      path: 'dataset.catalog.folders',
      base: baseline.catalog.folders,
      left: local.dataset.catalog.folders,
      right: remote.dataset.catalog.folders,
    },
    {
      path: 'dataset.catalog.activities',
      base: baseline.catalog.activities,
      left: local.dataset.catalog.activities,
      right: remote.dataset.catalog.activities,
    },
    {
      path: 'dataset.catalog.routines',
      base: baseline.catalog.routines,
      left: local.dataset.catalog.routines,
      right: remote.dataset.catalog.routines,
    },
    {
      path: 'dataset.routineSteps',
      base: baseline.routineSteps,
      left: local.dataset.routineSteps,
      right: remote.dataset.routineSteps,
    },
    {
      path: 'dataset.transitions',
      base: baseline.transitions,
      left: local.dataset.transitions,
      right: remote.dataset.transitions,
    },
    {
      path: 'dataset.routineHistory',
      base: baseline.routineHistory,
      left: local.dataset.routineHistory,
      right: remote.dataset.routineHistory,
    },
    {
      path: 'dataset.habits',
      base: baseline.habits,
      left: local.dataset.habits,
      right: remote.dataset.habits,
    },
    {
      path: 'dataset.habitDayStates',
      base: baseline.habitDayStates,
      left: local.dataset.habitDayStates,
      right: remote.dataset.habitDayStates,
    },
    {
      path: 'dataset.goals',
      base: baseline.goals,
      left: local.dataset.goals,
      right: remote.dataset.goals,
    },
    {
      path: 'dataset.goalSettings.statusDefinitions',
      base: baseline.goalSettings.statusDefinitions,
      left: local.dataset.goalSettings.statusDefinitions,
      right: remote.dataset.goalSettings.statusDefinitions,
    },
  ];
  for (const collection of entityMaps) {
    for (const [key, original] of Object.entries(collection.base)) {
      const left = collection.left[key];
      const right = collection.right[key];
      const leftDeletedAndRightEdited =
        left === undefined &&
        right !== undefined &&
        JSON.stringify(right) !== JSON.stringify(original);
      const rightDeletedAndLeftEdited =
        right === undefined &&
        left !== undefined &&
        JSON.stringify(left) !== JSON.stringify(original);
      if (!leftDeletedAndRightEdited && !rightDeletedAndLeftEdited) continue;
      const preserved = cloneJson((leftDeletedAndRightEdited ? right : left) as JsonValue);
      const path = `${collection.path}.${key}`;
      conflicts.push(
        semanticConflict(
          'delete-edit',
          path,
          [null, preserved],
          `A record was deleted on one device and edited on another. The edited value is kept locally and the deletion is retained in conflict history.`
        )
      );
      merged = Automerge.change(
        merged,
        { message: 'Preserve delete-versus-edit data' },
        (draft) => {
          const map = getMutablePath(draft as unknown as JsonObject, path.split('.').slice(0, -1));
          if (map && !(key in map)) map[key] = preserved;
        }
      );
    }
  }
  const baseActive = baseline.activeRoutine;
  if (baseActive) {
    const left = local.dataset.activeRoutine;
    const right = remote.dataset.activeRoutine;
    const leftDeleteRightEdit =
      left === null && right !== null && JSON.stringify(right) !== JSON.stringify(baseActive);
    const rightDeleteLeftEdit =
      right === null && left !== null && JSON.stringify(left) !== JSON.stringify(baseActive);
    if (leftDeleteRightEdit || rightDeleteLeftEdit) {
      const preserved = cloneJson((leftDeleteRightEdit ? right : left) as ActiveRoutine);
      conflicts.push(
        semanticConflict(
          'delete-edit',
          'dataset.activeRoutine',
          [null, preserved],
          'The active routine was removed on one device while it changed on another. The edited state is kept locally.'
        )
      );
      merged = Automerge.change(
        merged,
        { message: 'Preserve active-routine delete-versus-edit data' },
        (draft) => {
          if (draft.dataset.activeRoutine === null) draft.dataset.activeRoutine = preserved;
        }
      );
    }
  }
  if (conflicts.length === 0) return merged;
  return Automerge.change(merged, { message: 'Record delete-versus-edit conflicts' }, (draft) => {
    for (const conflict of conflicts) draft.conflicts[conflict.id] = conflict;
  });
}

function getMutablePath(target: JsonObject, path: string[]): JsonObject | null {
  let value: JsonValue | undefined = target;
  for (const part of path) {
    if (!isJsonObject(value)) return null;
    value = value[part];
  }
  return isJsonObject(value) ? value : null;
}
