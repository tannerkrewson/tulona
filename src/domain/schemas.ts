import { z } from 'zod';

import { isUuid } from './ordering';
import type {
  ActiveRoutine,
  AppSettings,
  CatalogCollection,
  DatasetMetadata,
  Folder,
  GlobalMetadata,
  Habit,
  HabitDayState,
  HabitMonthCollection,
  RoutineDefinition,
  RoutineHistoryCollection,
  RoutineRunHistory,
  RoutineSnapshot,
  RoutineStep,
  Transition,
  TrackerMonthCollection,
} from './models';
import { timestampMs } from './time';

const uuid = z.string().refine(isUuid, 'Expected a UUID');
const isoTimestamp = z.string().refine((value) => {
  try {
    return Number.isFinite(timestampMs(value)) && new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}, 'Expected an ISO-8601 timestamp with milliseconds');
const logicalDay = z.string().refine((value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 &&
    date.getUTCDate() === Number(match[3])
  );
}, 'Expected a YYYY-MM-DD logical day');
const month = z.string().refine((value) => {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  return Boolean(match && Number(match[2]) >= 1 && Number(match[2]) <= 12);
}, 'Expected a YYYY-MM month');
const nullableArchivedAt = isoTimestamp.nullable();
const timestamps = { createdAt: isoTimestamp, updatedAt: isoTimestamp };
const routineTrackingMode = z.enum(['overall', 'steps']);

export const folderSchema = z
  .object({
    id: uuid,
    name: z.string().min(1),
    sortOrder: z.number().int().nonnegative(),
    color: z.string().nullable(),
    iconName: z.string().nullable(),
    ...timestamps,
    archivedAt: nullableArchivedAt,
  })
  .passthrough();

export const activitySchema = z
  .object({
    id: uuid,
    kind: z.literal('activity'),
    name: z.string().min(1),
    folderId: uuid.nullable(),
    sortOrder: z.number().int().nonnegative(),
    color: z.string().nullable(),
    iconName: z.string().nullable(),
    ...timestamps,
    archivedAt: nullableArchivedAt,
  })
  .passthrough();

const routineStepShape = {
  id: uuid,
  activityId: uuid.nullable(),
  name: z.string().nullable(),
  durationMs: z.number().int().positive(),
  sortOrder: z.number().int().nonnegative(),
  color: z.string().nullable(),
  iconName: z.string().nullable(),
  endBehavior: z.enum(['overtime', 'auto-advance', 'autoAdvance']).default('overtime'),
  notes: z.string().nullable().default(null),
  ...timestamps,
  archivedAt: nullableArchivedAt,
};
export const routineStepSchema = z.object(routineStepShape).passthrough();

export const routineDefinitionSchema = z
  .object({
    id: uuid,
    kind: z.literal('routine'),
    name: z.string().min(1),
    folderId: uuid.nullable(),
    sortOrder: z.number().int().nonnegative(),
    color: z.string().nullable(),
    iconName: z.string().nullable(),
    trackingMode: routineTrackingMode,
    steps: z.array(routineStepSchema),
    ...timestamps,
    archivedAt: nullableArchivedAt,
  })
  .passthrough()
  .superRefine((routine, context) => {
    routine.steps.forEach((step, index) => {
      if (routine.trackingMode === 'steps' && step.activityId === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['steps', index, 'activityId'],
          message: 'Step-tracked routines require an activity for every step',
        });
      } else if (routine.trackingMode === 'overall' && step.activityId !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['steps', index, 'activityId'],
          message: 'Overall routines cannot assign activities to individual steps',
        });
      }
    });
  });

export const transitionSchema = z
  .object({
    id: uuid,
    activityId: uuid.nullable(),
    timestamp: isoTimestamp,
    source: z.enum(['manual', 'routine', 'automatic', 'system', 'import', 'migration', 'recovery']),
    status: z.enum(['recorded', 'corrected', 'superseded']),
    createdAt: isoTimestamp,
    correctionOfId: uuid.nullable(),
    note: z.string().nullable(),
  })
  .passthrough();

export const routineStepSnapshotSchema = z
  .object({
    id: uuid,
    activityId: uuid.nullable(),
    name: z.string().nullable(),
    durationMs: z.number().int().positive(),
    sortOrder: z.number().int().nonnegative(),
    color: z.string().nullable(),
    iconName: z.string().nullable(),
    endBehavior: z.enum(['overtime', 'auto-advance', 'autoAdvance']).default('overtime'),
    notes: z.string().nullable().default(null),
  })
  .passthrough();
export const routineSnapshotSchema = z
  .object({
    id: uuid,
    name: z.string().min(1),
    trackingMode: routineTrackingMode,
    steps: z.array(routineStepSnapshotSchema),
    capturedAt: isoTimestamp,
  })
  .passthrough()
  .superRefine((snapshot, context) => {
    snapshot.steps.forEach((step, index) => {
      if (snapshot.trackingMode === 'steps' && step.activityId === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['steps', index, 'activityId'],
          message: 'Step-tracked routines require an activity for every step',
        });
      } else if (snapshot.trackingMode === 'overall' && step.activityId !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['steps', index, 'activityId'],
          message: 'Overall routines cannot assign activities to individual steps',
        });
      }
    });
  });

export const routineStepSessionSchema = z
  .object({
    stepId: uuid,
    status: z.enum(['pending', 'active', 'completed', 'skipped']),
    startedAt: isoTimestamp.nullable(),
    completedAt: isoTimestamp.nullable(),
    addedTimeMs: z.number().int().nonnegative(),
    outcome: z.enum(['done', 'skipped', 'autoAdvanced']).optional(),
    plannedDurationMs: z.number().int().positive().optional(),
  })
  .passthrough();

export const activeRoutineSchema = z
  .object({
    id: uuid,
    routineId: uuid,
    routineSnapshot: routineSnapshotSchema,
    status: z.enum([
      'running',
      'paused',
      'awaiting-next-activity',
      'completed',
      'cancelled',
      'abandoned',
    ]),
    startedAt: isoTimestamp,
    pausedAt: isoTimestamp.nullable(),
    completedAt: isoTimestamp.nullable(),
    currentStepIndex: z.number().int().nonnegative(),
    currentStepStartedAt: isoTimestamp.nullable(),
    pausedDurationMs: z.number().int().nonnegative(),
    stepSessions: z.array(routineStepSessionSchema),
    currentStepDeadlineAt: isoTimestamp.nullable().default(null),
    remainingMsWhenPaused: z.number().int().nullable().default(null),
    alarmFiredStepIds: z.array(uuid).default([]),
  })
  .passthrough();

export const routineRunHistorySchema = z
  .object({
    id: uuid,
    routineId: uuid,
    routineSnapshot: routineSnapshotSchema,
    status: z.enum(['completed', 'cancelled', 'abandoned']),
    startedAt: isoTimestamp,
    completedAt: isoTimestamp,
    durationMs: z.number().int().nonnegative(),
    stepSessions: z.array(routineStepSessionSchema),
  })
  .passthrough();

const habitScheduleSchema = z.union([
  z.object({ kind: z.literal('daily') }).passthrough(),
  z
    .object({
      kind: z.literal('weekly'),
      daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
    })
    .passthrough(),
  z.object({ kind: z.literal('weekdays') }).passthrough(),
  z
    .object({
      kind: z.literal('weekly-count'),
      timesPerWeek: z.number().int().min(1).max(7),
    })
    .passthrough(),
  z
    .object({
      kind: z.literal('interval'),
      everyDays: z.number().int().positive(),
      startDate: logicalDay,
    })
    .passthrough(),
]);
const habitTriggerSchema = z.union([
  z
    .object({
      kind: z.literal('tracked-time'),
      activityId: uuid,
      minimumSeconds: z.number().positive().optional(),
      minimumMs: z.number().positive().optional(),
    })
    .refine(
      ({ minimumSeconds, minimumMs }) => minimumSeconds === undefined || minimumMs === undefined,
      { message: 'Habit trigger cannot define both minimumSeconds and minimumMs' }
    )
    .passthrough(),
  z
    .object({
      kind: z.literal('folder-time'),
      folderId: uuid,
      minimumSeconds: z.number().positive().optional(),
      minimumMs: z.number().positive().optional(),
    })
    .refine(
      ({ minimumSeconds, minimumMs }) => minimumSeconds === undefined || minimumMs === undefined,
      { message: 'Habit trigger cannot define both minimumSeconds and minimumMs' }
    )
    .passthrough(),
  z
    .object({
      kind: z.literal('routine-completion'),
      routineId: uuid,
      minimumSeconds: z.number().positive().optional(),
      minimumMs: z.number().positive().optional(),
    })
    .refine(
      ({ minimumSeconds, minimumMs }) => minimumSeconds === undefined || minimumMs === undefined,
      { message: 'Habit trigger cannot define both minimumSeconds and minimumMs' }
    )
    .passthrough(),
]);
export const habitSchema = z
  .object({
    id: uuid,
    name: z.string().min(1),
    sortOrder: z.number().int().nonnegative(),
    schedule: habitScheduleSchema,
    trigger: habitTriggerSchema.nullable(),
    description: z.string().nullable(),
    color: z.string().nullable(),
    iconName: z.string().nullable(),
    ...timestamps,
    archivedAt: nullableArchivedAt,
  })
  .passthrough();

export const habitDayStateSchema = z
  .object({
    habitId: uuid,
    logicalDay,
    manual: z.boolean().nullable(),
    automatic: z.boolean().nullable(),
    updatedAt: isoTimestamp,
  })
  .passthrough();

export const alarmSettingsSchema = z
  .object({
    enabled: z.boolean(),
    leadTimeMs: z.number().int().nonnegative(),
    sound: z.boolean(),
    vibration: z.boolean(),
    volume: z.number().min(0).max(1).default(1),
  })
  .passthrough();
export const appSettingsSchema = z
  .object({
    settingsVersion: z.number().int().positive(),
    logicalDayRolloverHour: z.number().int().min(0).max(23),
    appearance: z.enum(['system', 'light', 'dark']),
    weekStartsOn: z.number().int().min(0).max(6),
    alarmSettings: alarmSettingsSchema,
    defaultRoutineBehavior: z.enum(['resume', 'restart']),
    showArchived: z.boolean(),
  })
  .passthrough();

export const datasetMetadataSchema = z
  .object({
    id: uuid,
    name: z.string().min(1),
    schemaVersion: z.number().int().positive(),
    archivedAt: nullableArchivedAt,
    ...timestamps,
  })
  .passthrough();
export const globalMetadataSchema = z
  .object({
    metadataVersion: z.number().int().positive(),
    schemaVersion: z.number().int().positive(),
    activeDatasetId: uuid.nullable(),
    datasets: z.array(datasetMetadataSchema),
    ...timestamps,
  })
  .passthrough();

export const catalogCollectionSchema = z
  .object({
    folders: z.array(folderSchema),
    activities: z.array(activitySchema),
    routines: z.array(routineDefinitionSchema),
  })
  .passthrough();
export const habitCollectionSchema = z
  .object({
    habits: z.array(habitSchema),
  })
  .passthrough();
export const trackerMonthCollectionSchema = z
  .object({
    month,
    transitions: z.array(transitionSchema),
    latestTransitions: z.array(transitionSchema),
  })
  .passthrough();
export const routineHistoryCollectionSchema = z
  .object({
    month,
    runs: z.array(routineRunHistorySchema),
  })
  .passthrough();
export const habitMonthCollectionSchema = z
  .object({
    month,
    states: z.array(habitDayStateSchema),
  })
  .passthrough();

export const operationChangeSchema = z
  .object({
    key: z.string().min(1),
    oldValue: z.string().nullable(),
    newValue: z.string().nullable(),
  })
  .passthrough();
export const operationJournalEntrySchema = z
  .object({
    id: z.string().min(1),
    datasetId: uuid.nullable(),
    kind: z.string().min(1),
    status: z.enum(['prepared', 'applying', 'committed', 'failed']),
    changes: z.array(operationChangeSchema).min(1),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
    error: z.string().nullable(),
  })
  .passthrough();

export const initialSchemaVersionSchema = z.literal(1);

export type FolderRecord = z.infer<typeof folderSchema> & Folder;
export type RoutineStepRecord = z.infer<typeof routineStepSchema> & RoutineStep;
export type RoutineDefinitionRecord = z.infer<typeof routineDefinitionSchema> & RoutineDefinition;
export type TransitionRecord = z.infer<typeof transitionSchema> & Transition;
export type RoutineSnapshotRecord = z.infer<typeof routineSnapshotSchema> & RoutineSnapshot;
export type ActiveRoutineRecord = z.infer<typeof activeRoutineSchema> & ActiveRoutine;
export type RoutineRunHistoryRecord = z.infer<typeof routineRunHistorySchema> & RoutineRunHistory;
export type HabitRecord = z.infer<typeof habitSchema> & Habit;
export type HabitDayStateRecord = z.infer<typeof habitDayStateSchema> & HabitDayState;
export type AppSettingsRecord = z.infer<typeof appSettingsSchema> & AppSettings;
export type DatasetMetadataRecord = z.infer<typeof datasetMetadataSchema> & DatasetMetadata;
export type GlobalMetadataRecord = z.infer<typeof globalMetadataSchema> & GlobalMetadata;
export type CatalogCollectionRecord = z.infer<typeof catalogCollectionSchema> & CatalogCollection;
export type HabitCollectionRecord = z.infer<typeof habitCollectionSchema>;
export type TrackerMonthCollectionRecord = z.infer<typeof trackerMonthCollectionSchema> &
  TrackerMonthCollection;
export type RoutineHistoryCollectionRecord = z.infer<typeof routineHistoryCollectionSchema> &
  RoutineHistoryCollection;
export type HabitMonthCollectionRecord = z.infer<typeof habitMonthCollectionSchema> &
  HabitMonthCollection;

export const persistedSchemas = {
  folder: folderSchema,
  activity: activitySchema,
  routineStep: routineStepSchema,
  routineDefinition: routineDefinitionSchema,
  transition: transitionSchema,
  activeRoutine: activeRoutineSchema,
  routineRunHistory: routineRunHistorySchema,
  habit: habitSchema,
  habitDayState: habitDayStateSchema,
  appSettings: appSettingsSchema,
  datasetMetadata: datasetMetadataSchema,
  globalMetadata: globalMetadataSchema,
  catalogCollection: catalogCollectionSchema,
  habitCollection: habitCollectionSchema,
  trackerMonthCollection: trackerMonthCollectionSchema,
  routineHistoryCollection: routineHistoryCollectionSchema,
  habitMonthCollection: habitMonthCollectionSchema,
  operationJournalEntry: operationJournalEntrySchema,
} as const;
