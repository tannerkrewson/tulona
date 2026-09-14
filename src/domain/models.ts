/**
 * The domain uses strings for identifiers and timestamps so it can be shared
 * by native, web, import, and persistence code without depending on a UI or
 * storage runtime.
 */
export type UUID = string;
export type EntityId = UUID;
export type IsoTimestamp = string;
export type LogicalDayKey = string;
export type MonthKey = string;

export type Appearance = 'system' | 'light' | 'dark';
export type EntityState = 'active' | 'archived';
export type RecordStatus = 'active' | 'corrected' | 'superseded';
export type TransitionSource =
  'manual' | 'routine' | 'automatic' | 'system' | 'import' | 'migration' | 'recovery';
export type TransitionStatus = 'recorded' | 'corrected' | 'superseded';
export type RoutineRunStatus =
  'running' | 'paused' | 'awaiting-next-activity' | 'completed' | 'cancelled' | 'abandoned';
export type RoutineStepStatus = 'pending' | 'active' | 'completed' | 'skipped';
export type RoutineTrackingMode = 'overall' | 'steps';
export type RoutineStepEndBehavior = 'overtime' | 'auto-advance' | 'autoAdvance';
export type RoutineStepCompletionOutcome = 'done' | 'skipped' | 'autoAdvanced';
export type HabitSignalSource = 'manual' | 'automatic';
export type HabitDayOutcome = 'done' | 'failed' | 'skipped';
export type TimeGoalType = 'target' | 'limit';
export type TimeGoalPeriod = 'day' | 'week' | 'month';

export interface Timestamps {
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface Archivable {
  archivedAt: IsoTimestamp | null;
}

export interface TimeGoal {
  type: TimeGoalType;
  durationMs: number;
  period: TimeGoalPeriod;
}

export interface Folder extends Timestamps, Archivable {
  id: UUID;
  name: string;
  sortOrder: number;
  color: string | null;
  iconName: string | null;
}

export interface Activity extends Timestamps, Archivable {
  id: UUID;
  kind: 'activity';
  name: string;
  folderId: UUID | null;
  sortOrder: number;
  color: string | null;
  iconName: string | null;
  /** Optional target or limit used by History. Missing and null both mean disabled. */
  timeGoal?: TimeGoal | null;
}

export interface RoutineStep extends Timestamps, Archivable {
  id: UUID;
  activityId: UUID | null;
  name: string | null;
  durationMs: number;
  sortOrder: number;
  color: string | null;
  iconName: string | null;
  /** Defaults to overtime for records written before end behavior was added. */
  endBehavior?: RoutineStepEndBehavior;
  notes?: string | null;
}

export interface RoutineDefinition extends Timestamps, Archivable {
  id: UUID;
  kind: 'routine';
  name: string;
  folderId: UUID | null;
  sortOrder: number;
  color: string | null;
  iconName: string | null;
  trackingMode: RoutineTrackingMode;
  steps: RoutineStep[];
}

export type TrackableItem = Activity | RoutineDefinition;
export type CatalogItem = TrackableItem;

/** A transition is the authoritative record of what became active at a time. */
export interface Transition {
  id: UUID;
  activityId: UUID | null;
  timestamp: IsoTimestamp;
  source: TransitionSource;
  status: TransitionStatus;
  createdAt: IsoTimestamp;
  correctionOfId: UUID | null;
  note: string | null;
  /**
   * Immutable metadata captured when this transition was recorded. It is
   * optional so pre-History records remain readable and can be backfilled.
   */
  activitySnapshot?: HistoricalActivitySnapshot | null;
}

/** Public tracker name for the raw transition-log record. */
export type TimeTransition = Transition;

export interface TimeInterval {
  startMs: number;
  endMs: number;
  activityId: UUID | null;
  transitionId: UUID;
  activitySnapshot?: HistoricalActivitySnapshot | null;
}

/** Metadata needed to render history after the catalog record changes. */
export interface HistoricalActivitySnapshot {
  id: UUID;
  kind: 'activity' | 'routine';
  name: string;
  color: string | null;
  iconName: string | null;
  folderId: UUID | null;
  folderName: string | null;
  capturedAt?: IsoTimestamp;
}

export interface RoutineStepSnapshot {
  id: UUID;
  activityId: UUID | null;
  name: string | null;
  durationMs: number;
  sortOrder: number;
  color: string | null;
  iconName: string | null;
  endBehavior?: RoutineStepEndBehavior;
  notes?: string | null;
}

export interface RoutineSnapshot {
  id: UUID;
  name: string;
  trackingMode: RoutineTrackingMode;
  /** Captured parent routine styling; optional for snapshots written before this field existed. */
  color?: string | null;
  /** Captured parent routine icon; optional for snapshots written before this field existed. */
  iconName?: string | null;
  steps: RoutineStepSnapshot[];
  capturedAt: IsoTimestamp;
}

export interface RoutineStepSession {
  stepId: UUID;
  status: RoutineStepStatus;
  startedAt: IsoTimestamp | null;
  completedAt: IsoTimestamp | null;
  addedTimeMs: number;
  outcome?: RoutineStepCompletionOutcome;
  plannedDurationMs?: number;
}

/** The one authoritative active routine object persisted by the repository. */
export interface ActiveRoutine {
  id: UUID;
  routineId: UUID;
  routineSnapshot: RoutineSnapshot;
  status: RoutineRunStatus;
  startedAt: IsoTimestamp;
  pausedAt: IsoTimestamp | null;
  completedAt: IsoTimestamp | null;
  currentStepIndex: number;
  currentStepStartedAt: IsoTimestamp | null;
  pausedDurationMs: number;
  stepSessions: RoutineStepSession[];
  currentStepDeadlineAt?: IsoTimestamp | null;
  remainingMsWhenPaused?: number | null;
  alarmFiredStepIds?: UUID[];
}

export interface RoutineRunHistory {
  id: UUID;
  routineId: UUID;
  routineSnapshot: RoutineSnapshot;
  status: 'completed' | 'cancelled' | 'abandoned';
  startedAt: IsoTimestamp;
  completedAt: IsoTimestamp;
  durationMs: number;
  stepSessions: RoutineStepSession[];
}

export type RoutineSession = ActiveRoutine;
export type RoutineHistory = RoutineRunHistory;

export type HabitSchedule =
  | { kind: 'daily' }
  | { kind: 'weekly'; daysOfWeek: number[] }
  | { kind: 'weekdays' }
  | { kind: 'weekly-count'; timesPerWeek: number }
  | { kind: 'interval'; everyDays: number; startDate: LogicalDayKey };

export type HabitTrigger =
  | {
      kind: 'tracked-time';
      activityId: UUID;
      /** Seconds of materialized activity time required; omitted means one second. */
      minimumSeconds?: number;
      /** Legacy persisted spelling accepted at the boundary; services normalize to seconds. */
      minimumMs?: number;
    }
  | {
      kind: 'folder-time';
      folderId: UUID;
      /** Seconds of materialized child time required; omitted means one second. */
      minimumSeconds?: number;
      minimumMs?: number;
    }
  | {
      kind: 'routine-completion';
      routineId: UUID;
      /** Top-level routine time required; omitted means one second. */
      minimumSeconds?: number;
      minimumMs?: number;
    };

export interface Habit extends Timestamps, Archivable {
  id: UUID;
  name: string;
  sortOrder: number;
  schedule: HabitSchedule;
  trigger: HabitTrigger | null;
  description: string | null;
  color: string | null;
  iconName: string | null;
}

export interface HabitDayState {
  habitId: UUID;
  logicalDay: LogicalDayKey;
  manual: boolean | null;
  automatic: boolean | null;
  /** An explicit user outcome. Older records may not contain this field. */
  outcome?: HabitDayOutcome | null;
  updatedAt: IsoTimestamp;
}

export interface AlarmSettings {
  enabled: boolean;
  leadTimeMs: number;
  sound: boolean;
  vibration: boolean;
  volume?: number;
}

export interface AppSettings {
  settingsVersion: number;
  logicalDayRolloverHour: number;
  appearance: Appearance;
  weekStartsOn: number;
  minimumActivityDurationMs: number;
  alarmSettings: AlarmSettings;
  defaultRoutineBehavior: 'resume' | 'restart';
  showArchived: boolean;
}

export interface DatasetMetadata extends Timestamps {
  id: UUID;
  name: string;
  schemaVersion: number;
  archivedAt: IsoTimestamp | null;
}

export interface GlobalMetadata extends Timestamps {
  metadataVersion: number;
  schemaVersion: number;
  activeDatasetId: UUID | null;
  datasets: DatasetMetadata[];
}

export interface CatalogCollection {
  folders: Folder[];
  activities: Activity[];
  routines: RoutineDefinition[];
}

export interface HabitCollection {
  habits: Habit[];
}

export interface TrackerMonthCollection {
  month: MonthKey;
  transitions: Transition[];
  /** A display cache only; transitions remain the source of truth. */
  latestTransitions: Transition[];
}

export interface RoutineHistoryCollection {
  month: MonthKey;
  runs: RoutineRunHistory[];
}

export interface HabitMonthCollection {
  month: MonthKey;
  states: HabitDayState[];
}
