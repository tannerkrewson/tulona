import './web-crypto';

import * as Y from 'yjs';

import type { Transition } from '@domain';

import {
  BACKUP_FORMAT,
  CURRENT_BACKUP_SCHEMA_VERSION,
  CURRENT_BACKUP_VERSION,
  type LifeTrackerBackup,
} from './backup-schema';

export const DROPBOX_SYNC_FORMAT = 'tulona-yjs-sync' as const;
export const DROPBOX_SYNC_DOCUMENT_VERSION = 1 as const;

export type SyncDocument = Y.Doc;

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type Ordered = { id: string; sortOrder: number };

/**
 * Each collection is a root map of whole records keyed by a stable identity. Edits to different
 * records always merge; when two devices edit the same record concurrently, one version wins.
 */
const COLLECTIONS: Record<string, (backup: LifeTrackerBackup) => [string, unknown][]> = {
  folders: (backup) => backup.catalog.folders.map((value) => [value.id, value]),
  activities: (backup) => backup.catalog.activities.map((value) => [value.id, value]),
  routines: (backup) => backup.catalog.routines.map((value) => [value.id, value]),
  transitions: (backup) => backup.transitions.map((value) => [value.id, value]),
  routineHistory: (backup) => backup.routineHistory.map((value) => [value.id, value]),
  habits: (backup) => backup.habits.map((value) => [value.id, value]),
  habitDayStates: (backup) =>
    backup.habitDayStates.map((value) => [`${value.habitId}|${value.logicalDay}`, value]),
  goals: (backup) => backup.goals.map((value) => [value.id, value]),
  goalStatuses: (backup) =>
    backup.goalWeeks.flatMap((week) =>
      week.statuses.map((value): [string, unknown] => [`${week.weekStart}|${value.goalId}`, value])
    ),
  statusDefinitions: (backup) =>
    backup.goalSettings.statusDefinitions.map((value) => [value.id, value]),
};

/** Deleted status definitions stay restorable in case another device starts using one. */
const RETIRED_STATUS_DEFINITIONS = 'retiredStatusDefinitions';

/** Settings merge field by field. */
const FIELDS: Record<string, (backup: LifeTrackerBackup) => Record<string, unknown>> = {
  settings: (backup) => ({ ...backup.settings }),
  goalSettings: ({ goalSettings: { statusDefinitions: _statusDefinitions, ...fields } }) => fields,
  state: (backup) => ({ activeRoutine: backup.activeRoutine }),
};

/** Key order differs between stored and freshly built records, so compare canonically. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value ?? null)) as Json;
}

function entriesOf(backup: LifeTrackerBackup): Map<string, Map<string, unknown>> {
  const entries = new Map<string, Map<string, unknown>>();
  for (const [name, read] of Object.entries(COLLECTIONS)) entries.set(name, new Map(read(backup)));
  for (const [name, read] of Object.entries(FIELDS)) {
    entries.set(name, new Map(Object.entries(read(backup))));
  }
  return entries;
}

/**
 * Records the edits that turned `previous` into `next`: changed records are rewritten and removed
 * records deleted. Records nobody touched keep whatever other devices wrote.
 */
export function applyBackupChanges(
  document: SyncDocument,
  previous: LifeTrackerBackup | null,
  next: LifeTrackerBackup
): void {
  const before = previous ? entriesOf(previous) : null;
  document.transact(() => {
    for (const [name, records] of entriesOf(next)) {
      const map = document.getMap<Json>(name);
      const prior = before?.get(name);
      for (const [key, value] of records) {
        if (prior?.has(key) && canonicalJson(prior.get(key)) === canonicalJson(value)) continue;
        map.set(key, toJson(value));
      }
      for (const key of prior?.keys() ?? []) {
        if (records.has(key)) continue;
        map.delete(key);
        if (name === 'statusDefinitions') {
          document.getMap<Json>(RETIRED_STATUS_DEFINITIONS).set(key, toJson(prior?.get(key)));
        }
      }
    }
  });
}

/** Adds records the document lacks without changing or removing any it already holds. */
export function addMissingRecords(document: SyncDocument, backup: LifeTrackerBackup): void {
  document.transact(() => {
    for (const [name, records] of entriesOf(backup)) {
      const map = document.getMap<Json>(name);
      for (const [key, value] of records) {
        if (!map.has(key)) map.set(key, toJson(value));
      }
    }
  });
}

export function createSyncDocument(backup: LifeTrackerBackup, datasetId: string): SyncDocument {
  const document = new Y.Doc();
  document.transact(() => {
    const meta = document.getMap<Json>('meta');
    meta.set('format', DROPBOX_SYNC_FORMAT);
    meta.set('version', DROPBOX_SYNC_DOCUMENT_VERSION);
    meta.set('datasetId', datasetId);
  });
  applyBackupChanges(document, null, backup);
  return document;
}

export function mergeSyncDocuments(target: SyncDocument, source: SyncDocument): void {
  Y.applyUpdateV2(target, Y.encodeStateAsUpdateV2(source));
}

export function cloneSyncDocument(document: SyncDocument): SyncDocument {
  const clone = new Y.Doc();
  mergeSyncDocuments(clone, document);
  return clone;
}

/** Whether both documents hold exactly the same edits, so neither has anything to send. */
export function sameSyncState(left: SyncDocument, right: SyncDocument): boolean {
  return Y.equalSnapshots(Y.snapshot(left), Y.snapshot(right));
}

export function syncDocumentDatasetId(document: SyncDocument): string {
  return String(document.getMap<Json>('meta').get('datasetId') ?? '');
}

function compareOrdered(left: Ordered, right: Ordered): number {
  return left.sortOrder - right.sortOrder || left.id.localeCompare(right.id);
}

function values<T>(document: SyncDocument, name: string): T[] {
  return [...document.getMap<Json>(name).values()] as T[];
}

/** Two devices can record a transition at the same instant; the tracker keeps one per timestamp. */
function uniqueRecordedTimestamps(transitions: Transition[]): Transition[] {
  const recorded = new Map<string, Transition>();
  for (const transition of transitions) {
    if (transition.status !== 'recorded') continue;
    const prior = recorded.get(transition.timestamp);
    if (!prior || transition.id.localeCompare(prior.id) < 0) {
      recorded.set(transition.timestamp, transition);
    }
  }
  return transitions.filter(
    (transition) =>
      transition.status !== 'recorded' || recorded.get(transition.timestamp) === transition
  );
}

/**
 * Deletions on one device can race with new references on another. Mirror what the app does
 * locally so the merged dataset stays valid: a deleted goal takes its weekly statuses with it, a
 * deleted status definition that is in use again comes back, and a correction whose original
 * transition was deleted stands on its own.
 */
function repairReferences(document: SyncDocument, backup: LifeTrackerBackup): void {
  const goalIds = new Set(backup.goals.map((goal) => goal.id));
  backup.goalWeeks = backup.goalWeeks
    .map((week) => ({
      ...week,
      statuses: week.statuses.filter((status) => goalIds.has(status.goalId)),
    }))
    .filter((week) => week.statuses.length > 0);

  const definitions = backup.goalSettings.statusDefinitions;
  const knownStatuses = new Set(definitions.map((definition) => definition.id));
  const retired = document.getMap<Json>(RETIRED_STATUS_DEFINITIONS);
  const usedStatuses = [
    ...backup.goalWeeks.flatMap((week) => week.statuses.map((status) => status.statusId)),
    ...backup.goals.flatMap((goal) =>
      goal.rules.flatMap((rule) =>
        rule.kind === 'weekly-status' ? [] : Object.values(rule.statusIds)
      )
    ),
  ];
  for (const id of usedStatuses) {
    const definition = retired.get(id) as (typeof definitions)[number] | undefined;
    if (knownStatuses.has(id) || !definition) continue;
    definitions.push({ ...definition, sortOrder: definitions.length });
    knownStatuses.add(id);
  }

  const transitionIds = new Set(backup.transitions.map((transition) => transition.id));
  backup.transitions = backup.transitions.map((transition) =>
    transition.correctionOfId !== null && !transitionIds.has(transition.correctionOfId)
      ? { ...transition, correctionOfId: null }
      : transition
  );
}

export function projectSyncDocument(
  document: SyncDocument,
  options: { exportedAt?: string; appVersion?: string } = {}
): LifeTrackerBackup {
  type Backup = LifeTrackerBackup;
  const routines = values<Backup['catalog']['routines'][number]>(document, 'routines').sort(
    compareOrdered
  );
  const weeks = new Map<string, Backup['goalWeeks'][number]['statuses']>();
  for (const status of values<Backup['goalWeeks'][number]['statuses'][number]>(
    document,
    'goalStatuses'
  )) {
    weeks.set(status.weekStart, [...(weeks.get(status.weekStart) ?? []), status]);
  }
  const fields = (name: string) => document.getMap<Json>(name).toJSON();
  const backup = JSON.parse(
    JSON.stringify({
      format: BACKUP_FORMAT,
      backupVersion: CURRENT_BACKUP_VERSION,
      schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
      exportedAt: options.exportedAt ?? new Date().toISOString(),
      appVersion: options.appVersion ?? '0.1.0',
      settings: fields('settings') as Backup['settings'],
      catalog: {
        folders: values<Backup['catalog']['folders'][number]>(document, 'folders').sort(
          compareOrdered
        ),
        activities: values<Backup['catalog']['activities'][number]>(document, 'activities').sort(
          compareOrdered
        ),
        routines,
      },
      routineDefinitions: routines,
      transitions: uniqueRecordedTimestamps(
        values<Transition>(document, 'transitions').sort(
          (left, right) =>
            left.timestamp.localeCompare(right.timestamp) || left.id.localeCompare(right.id)
        )
      ),
      routineHistory: values<Backup['routineHistory'][number]>(document, 'routineHistory').sort(
        (left, right) =>
          left.completedAt.localeCompare(right.completedAt) || left.id.localeCompare(right.id)
      ),
      activeRoutine: (fields('state').activeRoutine ?? null) as Backup['activeRoutine'],
      habits: values<Backup['habits'][number]>(document, 'habits').sort(compareOrdered),
      habitDayStates: values<Backup['habitDayStates'][number]>(document, 'habitDayStates').sort(
        (left, right) =>
          left.logicalDay.localeCompare(right.logicalDay) ||
          left.habitId.localeCompare(right.habitId)
      ),
      goals: values<Backup['goals'][number]>(document, 'goals').sort((left, right) =>
        left.id.localeCompare(right.id)
      ),
      goalSettings: {
        ...(fields('goalSettings') as Omit<Backup['goalSettings'], 'statusDefinitions'>),
        statusDefinitions: values<Backup['goalSettings']['statusDefinitions'][number]>(
          document,
          'statusDefinitions'
        )
          .sort(compareOrdered)
          .map((definition, sortOrder) => ({ ...definition, sortOrder })),
      },
      goalWeeks: [...weeks]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([weekStart, statuses]) => ({
          weekStart,
          statuses: statuses.sort((left, right) => left.goalId.localeCompare(right.goalId)),
        })),
    } satisfies LifeTrackerBackup)
  ) as LifeTrackerBackup;
  repairReferences(document, backup);
  return backup;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x2000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x2000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  if (!value || value.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(value)) {
    throw new Error('Dropbox synchronization file contains invalid encoded data');
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function encodeSyncDocument(document: SyncDocument): string {
  return bytesToBase64(Y.encodeStateAsUpdateV2(document));
}

export function decodeSyncDocument(encoded: string): SyncDocument {
  const document = new Y.Doc();
  try {
    Y.applyUpdateV2(document, base64ToBytes(encoded.replace(/\s/g, '')));
  } catch (error) {
    throw new Error('Dropbox synchronization document is unreadable', { cause: error });
  }
  const meta = document.getMap<Json>('meta');
  if (
    document.store.pendingStructs !== null ||
    meta.get('format') !== DROPBOX_SYNC_FORMAT ||
    meta.get('version') !== DROPBOX_SYNC_DOCUMENT_VERSION ||
    !syncDocumentDatasetId(document)
  ) {
    throw new Error('Dropbox synchronization document has an unsupported format or version');
  }
  return document;
}
