import {
  backupSchema,
  BACKUP_FORMAT,
  CURRENT_BACKUP_SCHEMA_VERSION,
  CURRENT_BACKUP_VERSION,
} from './backup-schema';
import type { LifeTrackerBackup, ParsedLifeTrackerBackup } from './backup-schema';
import type {
  Activity,
  CatalogCollection,
  Folder,
  HabitDayState,
  RoutineDefinition,
  RoutineRunHistory,
  RoutineSnapshot,
} from '@domain';

export type BackupImportErrorCode =
  | 'invalid-json'
  | 'invalid-document'
  | 'unsupported-format'
  | 'unsupported-version'
  | 'migration-failed'
  | 'schema'
  | 'semantic';

export class BackupImportError extends Error {
  readonly name = 'BackupImportError';

  constructor(
    readonly code: BackupImportErrorCode,
    message: string,
    readonly details?: readonly string[],
    readonly cause?: unknown
  ) {
    super(message);
  }
}

export interface BackupMigration {
  readonly fromVersion: number;
  readonly toVersion: number;
  migrate(value: unknown): unknown;
}

export class BackupMigrationRegistry {
  private readonly migrations = new Map<number, BackupMigration>();

  register(migration: BackupMigration): void {
    if (migration.toVersion !== migration.fromVersion + 1) {
      throw new RangeError('Backup migrations must advance exactly one version');
    }
    if (this.migrations.has(migration.fromVersion)) {
      throw new Error(
        `A backup migration from version ${migration.fromVersion} is already registered`
      );
    }
    this.migrations.set(migration.fromVersion, migration);
  }

  migrate(
    value: unknown,
    fromVersion: number,
    toVersion: number
  ): { value: unknown; versions: number[] } {
    if (!Number.isInteger(fromVersion) || fromVersion > toVersion) {
      throw new BackupImportError(
        'unsupported-version',
        'Backup version must be an ordered integer'
      );
    }
    let current = value;
    const versions: number[] = [];
    for (let version = fromVersion; version < toVersion; version += 1) {
      const migration = this.migrations.get(version);
      if (!migration) {
        throw new BackupImportError(
          'unsupported-version',
          `No migration is available from backup version ${version}`
        );
      }
      try {
        current = migration.migrate(current);
        versions.push(migration.toVersion);
      } catch (error) {
        throw new BackupImportError(
          'migration-failed',
          `Backup migration ${version} to ${migration.toVersion} failed`,
          undefined,
          error
        );
      }
    }
    return { value: current, versions };
  }
}

export interface BackupImportSummary {
  folders: number;
  activities: number;
  routines: number;
  transitions: number;
  routineRuns: number;
  habits: number;
  habitDayStates: number;
  archivedRecords: number;
  migrationsApplied: number[];
}

export interface BackupImportResult {
  backup: ParsedLifeTrackerBackup;
  summary: BackupImportSummary;
}

export interface ParseBackupOptions {
  migrations?: BackupMigrationRegistry;
  schemaMigrations?: BackupMigrationRegistry;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BackupImportError('invalid-document', 'Backup document must be a JSON object');
  }
  return value as Record<string, unknown>;
}

function flattenCollection<T>(value: unknown, property: string): T[] {
  if (!Array.isArray(value)) return [];
  if (value.every((entry) => typeof entry === 'object' && entry !== null && property in entry)) {
    return value.flatMap((entry) => {
      const records = (entry as Record<string, unknown>)[property];
      return Array.isArray(records) ? (records as T[]) : [];
    });
  }
  return value as T[];
}

function normalizeDocument(value: unknown): Record<string, unknown> {
  const input = objectValue(value);
  const catalog = objectValue(input.catalog);
  const routineDefinitions = input.routineDefinitions ?? catalog.routines;
  const normalizedCatalog: CatalogCollection = {
    ...catalog,
    folders: catalog.folders as Folder[],
    activities: catalog.activities as Activity[],
    routines: routineDefinitions as RoutineDefinition[],
  };
  const habitsValue = input.habits;
  const habits =
    typeof habitsValue === 'object' && habitsValue !== null && !Array.isArray(habitsValue)
      ? (habitsValue as Record<string, unknown>).habits
      : habitsValue;
  const normalizedHabits = Array.isArray(habits)
    ? habits.map((habit) => {
        if (typeof habit !== 'object' || habit === null) return habit;
        const candidate = habit as Record<string, unknown>;
        const trigger = candidate.trigger;
        if (
          typeof trigger !== 'object' ||
          trigger === null ||
          Array.isArray(trigger) ||
          !('minimumMs' in trigger) ||
          'minimumSeconds' in trigger
        ) {
          return habit;
        }
        const legacyTrigger = trigger as Record<string, unknown>;
        if (typeof legacyTrigger.minimumMs !== 'number') return habit;
        const { minimumMs: legacyMinimumMs, ...withoutLegacyMinimumMs } = legacyTrigger;
        return {
          ...candidate,
          trigger: {
            ...withoutLegacyMinimumMs,
            minimumSeconds: legacyMinimumMs / 1000,
          },
        };
      })
    : habits;
  return {
    ...input,
    catalog: normalizedCatalog,
    routineDefinitions: normalizedCatalog.routines,
    transitions:
      input.transitions === undefined
        ? undefined
        : flattenCollection(input.transitions, 'transitions'),
    routineHistory:
      input.routineHistory === undefined
        ? undefined
        : flattenCollection<RoutineRunHistory>(input.routineHistory, 'runs'),
    habits: habits === undefined ? undefined : normalizedHabits,
    habitDayStates:
      input.habitDayStates === undefined
        ? undefined
        : flattenCollection<HabitDayState>(input.habitDayStates, 'states'),
  };
}

function duplicateIds(
  values: readonly { id: string }[],
  label: string,
  errors: string[]
): Set<string> {
  const ids = new Set<string>();
  for (const value of values) {
    if (ids.has(value.id)) errors.push(`Duplicate ${label} ID "${value.id}"`);
    ids.add(value.id);
  }
  return ids;
}

function validateSemantics(backup: LifeTrackerBackup): string[] {
  const errors: string[] = [];
  duplicateIds(
    [...backup.catalog.folders, ...backup.catalog.activities, ...backup.catalog.routines],
    'catalog',
    errors
  );
  const folderIds = new Set(backup.catalog.folders.map((folder) => folder.id));
  const activityIds = new Set(backup.catalog.activities.map((activity) => activity.id));
  const routineIds = new Set(backup.catalog.routines.map((routine) => routine.id));
  const trackableIds = new Set([...activityIds, ...routineIds]);

  for (const item of [...backup.catalog.activities, ...backup.catalog.routines]) {
    if (item.folderId !== null && !folderIds.has(item.folderId)) {
      errors.push(`Catalog item "${item.id}" references unknown folder "${item.folderId}"`);
    }
  }
  for (const routine of backup.catalog.routines) {
    duplicateIds(routine.steps, 'routine step', errors);
    for (const step of routine.steps) {
      if (routine.trackingMode === 'steps' && step.activityId === null) {
        errors.push(`Step-tracked routine "${routine.id}" step "${step.id}" requires an activity`);
      } else if (step.activityId !== null && !activityIds.has(step.activityId)) {
        errors.push(`Routine step "${step.id}" references unknown activity "${step.activityId}"`);
      }
    }
  }

  const transitionIds = duplicateIds(backup.transitions, 'transition', errors);
  for (const transition of backup.transitions) {
    if (transition.activityId !== null && !trackableIds.has(transition.activityId)) {
      errors.push(
        `Transition "${transition.id}" references unknown trackable item "${transition.activityId}"`
      );
    }
    if (transition.correctionOfId === transition.id) {
      errors.push(`Transition "${transition.id}" cannot correct itself`);
    } else if (
      transition.correctionOfId !== null &&
      !transitionIds.has(transition.correctionOfId)
    ) {
      errors.push(
        `Transition "${transition.id}" corrects unknown transition "${transition.correctionOfId}"`
      );
    }
  }

  const runIds = duplicateIds(backup.routineHistory, 'routine run', errors);
  for (const run of backup.routineHistory) {
    if (!routineIds.has(run.routineId)) {
      errors.push(`Routine run "${run.id}" references unknown routine "${run.routineId}"`);
    }
    if (run.routineSnapshot.id !== run.routineId) {
      errors.push(`Routine run "${run.id}" has a mismatched routine snapshot`);
    }
    const runStepIds = validateSnapshot(
      run.routineSnapshot,
      `Routine run "${run.id}"`,
      activityIds,
      errors
    );
    validateStepSessions(run.stepSessions, `Routine run "${run.id}"`, runStepIds, errors);
  }
  if (backup.activeRoutine) {
    const active = backup.activeRoutine;
    if (!routineIds.has(active.routineId)) {
      errors.push(`Active routine references unknown routine "${active.routineId}"`);
    }
    if (active.routineSnapshot.id !== active.routineId) {
      errors.push('Active routine has a mismatched routine snapshot');
    }
    const activeStepIds = validateSnapshot(
      active.routineSnapshot,
      'Active routine',
      activityIds,
      errors
    );
    validateStepSessions(active.stepSessions, 'Active routine', activeStepIds, errors);
  }
  if (runIds.size !== backup.routineHistory.length) errors.push('Routine run IDs must be unique');

  const habitIds = duplicateIds(backup.habits, 'habit', errors);
  for (const habit of backup.habits) {
    if (habit.trigger?.kind === 'tracked-time' && !activityIds.has(habit.trigger.activityId)) {
      errors.push(`Habit "${habit.id}" references unknown activity "${habit.trigger.activityId}"`);
    }
    if (habit.trigger?.kind === 'folder-time' && !folderIds.has(habit.trigger.folderId)) {
      errors.push(`Habit "${habit.id}" references unknown folder "${habit.trigger.folderId}"`);
    }
    if (habit.trigger?.kind === 'routine-completion' && !routineIds.has(habit.trigger.routineId)) {
      errors.push(`Habit "${habit.id}" references unknown routine "${habit.trigger.routineId}"`);
    }
  }
  const stateKeys = new Set<string>();
  for (const state of backup.habitDayStates) {
    if (!habitIds.has(state.habitId)) {
      errors.push(`Habit day state references unknown habit "${state.habitId}"`);
    }
    const key = `${state.habitId}:${state.logicalDay}`;
    if (stateKeys.has(key)) errors.push(`Duplicate habit day state "${key}"`);
    stateKeys.add(key);
  }
  return errors;
}

function validateSnapshot(
  snapshot: RoutineSnapshot,
  label: string,
  activityIds: ReadonlySet<string>,
  errors: string[]
): Set<string> {
  const stepIds = duplicateIds(snapshot.steps, `${label} step`, errors);
  for (const step of snapshot.steps) {
    if (snapshot.trackingMode === 'steps' && step.activityId === null) {
      errors.push(`${label} step "${step.id}" requires an activity`);
    } else if (step.activityId !== null && !activityIds.has(step.activityId)) {
      errors.push(`${label} step "${step.id}" references unknown activity "${step.activityId}"`);
    }
  }
  return stepIds;
}

function validateStepSessions(
  sessions: readonly { stepId: string }[],
  label: string,
  stepIds: ReadonlySet<string>,
  errors: string[]
): void {
  for (const session of sessions) {
    if (!stepIds.has(session.stepId)) {
      errors.push(`${label} session references unknown step "${session.stepId}"`);
    }
  }
}

function parseJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch (error) {
    throw new BackupImportError('invalid-json', 'Backup file is not valid JSON', undefined, error);
  }
}

export function parseBackup(
  input: string | unknown,
  options: ParseBackupOptions = {}
): BackupImportResult {
  const raw = typeof input === 'string' ? parseJson(input) : input;
  const envelope = objectValue(raw);
  if (envelope.format !== BACKUP_FORMAT) {
    throw new BackupImportError(
      'unsupported-format',
      `Unsupported backup format "${String(envelope.format ?? 'missing')}"`
    );
  }
  if (typeof envelope.backupVersion !== 'number' || !Number.isInteger(envelope.backupVersion)) {
    throw new BackupImportError('unsupported-version', 'Backup version is missing or invalid');
  }
  if (envelope.backupVersion > CURRENT_BACKUP_VERSION) {
    throw new BackupImportError(
      'unsupported-version',
      `Backup version ${envelope.backupVersion} is newer than supported version ${CURRENT_BACKUP_VERSION}`
    );
  }
  if (typeof envelope.schemaVersion !== 'number' || !Number.isInteger(envelope.schemaVersion)) {
    throw new BackupImportError(
      'unsupported-version',
      'Backup schema version is missing or invalid'
    );
  }
  if (envelope.schemaVersion > CURRENT_BACKUP_SCHEMA_VERSION) {
    throw new BackupImportError(
      'unsupported-version',
      `Backup schema version ${envelope.schemaVersion} is newer than supported version ${CURRENT_BACKUP_SCHEMA_VERSION}`
    );
  }

  let migrated: unknown = raw;
  const versions: number[] = [];
  if (envelope.backupVersion < CURRENT_BACKUP_VERSION) {
    const result = (options.migrations ?? new BackupMigrationRegistry()).migrate(
      migrated,
      envelope.backupVersion,
      CURRENT_BACKUP_VERSION
    );
    migrated = result.value;
    versions.push(...result.versions);
  }
  if (envelope.schemaVersion < CURRENT_BACKUP_SCHEMA_VERSION) {
    const result = (
      options.schemaMigrations ??
      options.migrations ??
      new BackupMigrationRegistry()
    ).migrate(migrated, envelope.schemaVersion, CURRENT_BACKUP_SCHEMA_VERSION);
    migrated = result.value;
    versions.push(...result.versions);
  }

  const normalized = normalizeDocument(migrated);
  const result = backupSchema.safeParse(normalized);
  if (!result.success) {
    throw new BackupImportError(
      'schema',
      'Backup document failed schema validation',
      result.error.issues.map((issue) => issue.message)
    );
  }
  const backup = result.data as ParsedLifeTrackerBackup;
  const semanticErrors = validateSemantics(backup);
  if (semanticErrors.length > 0) {
    throw new BackupImportError(
      'semantic',
      'Backup document contains invalid references',
      semanticErrors
    );
  }
  return {
    backup,
    summary: {
      folders: backup.catalog.folders.length,
      activities: backup.catalog.activities.length,
      routines: backup.catalog.routines.length,
      transitions: backup.transitions.length,
      routineRuns: backup.routineHistory.length,
      habits: backup.habits.length,
      habitDayStates: backup.habitDayStates.length,
      archivedRecords: [
        ...backup.catalog.folders,
        ...backup.catalog.activities,
        ...backup.catalog.routines,
        ...backup.habits,
      ].filter((record) => record.archivedAt !== null).length,
      migrationsApplied: versions,
    },
  };
}

export const parseBackupJson = parseBackup;
