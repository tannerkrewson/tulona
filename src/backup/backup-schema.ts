import { z } from 'zod';

import {
  activeRoutineSchema,
  appSettingsSchema,
  catalogCollectionSchema,
  habitDayStateSchema,
  habitSchema,
  routineDefinitionSchema,
  routineRunHistorySchema,
  transitionSchema,
} from '@domain';
import type {
  ActiveRoutine,
  AppSettings,
  CatalogCollection,
  Habit,
  HabitDayState,
  RoutineDefinition,
  RoutineRunHistory,
  Transition,
} from '@domain';

export const BACKUP_FORMAT = 'life-tracker-backup' as const;
export const CURRENT_BACKUP_VERSION = 1 as const;
export const CURRENT_BACKUP_SCHEMA_VERSION = 1 as const;

/** The portable, dataset-scoped backup document. UI state is intentionally absent. */
export interface LifeTrackerBackup {
  format: typeof BACKUP_FORMAT;
  backupVersion: typeof CURRENT_BACKUP_VERSION;
  schemaVersion: typeof CURRENT_BACKUP_SCHEMA_VERSION;
  exportedAt: string;
  appVersion: string;
  settings: AppSettings;
  catalog: CatalogCollection;
  routineDefinitions: RoutineDefinition[];
  transitions: Transition[];
  routineHistory: RoutineRunHistory[];
  activeRoutine: ActiveRoutine | null;
  habits: Habit[];
  habitDayStates: HabitDayState[];
}

/**
 * Optional aliases let the in-memory migration step normalize older exports
 * without making those aliases part of the current output contract.
 */
export const backupInputSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    backupVersion: z.number().int(),
    schemaVersion: z.number().int(),
    exportedAt: z.string(),
    appVersion: z.string(),
    settings: appSettingsSchema,
    catalog: catalogCollectionSchema,
    routineDefinitions: z.array(routineDefinitionSchema).optional(),
    transitions: z.unknown(),
    routineHistory: z.unknown(),
    activeRoutine: activeRoutineSchema.nullable(),
    habits: z.unknown(),
    habitDayStates: z.unknown(),
  })
  .strip();

export const backupSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    backupVersion: z.literal(CURRENT_BACKUP_VERSION),
    schemaVersion: z.literal(CURRENT_BACKUP_SCHEMA_VERSION),
    exportedAt: z.string(),
    appVersion: z.string().min(1),
    settings: appSettingsSchema,
    catalog: catalogCollectionSchema,
    routineDefinitions: z.array(routineDefinitionSchema),
    transitions: z.array(transitionSchema),
    routineHistory: z.array(routineRunHistorySchema),
    activeRoutine: activeRoutineSchema.nullable(),
    habits: z.array(habitSchema),
    habitDayStates: z.array(habitDayStateSchema),
  })
  .strip();

export type BackupInput = z.input<typeof backupInputSchema>;
export type ParsedLifeTrackerBackup = z.infer<typeof backupSchema> & LifeTrackerBackup;
