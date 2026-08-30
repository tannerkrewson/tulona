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
export type RoutineRunStatus = 'running' | 'paused' | 'completed' | 'abandoned';
export type RoutineStepStatus = 'pending' | 'active' | 'completed' | 'skipped';
export type HabitSignalSource = 'manual' | 'automatic';

export interface Timestamps {
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface Archivable {
  archivedAt: IsoTimestamp | null;
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
}

export interface RoutineStep extends Timestamps, Archivable {
  id: UUID;
  activityId: UUID;
  name: string | null;
  durationMs: number;
  sortOrder: number;
  color: string | null;
  iconName: string | null;
}

export interface RoutineDefinition extends Timestamps, Archivable {
  id: UUID;
  kind: 'routine';
  name: string;
  folderId: UUID | null;
  sortOrder: number;
  color: string | null;
  iconName: string | null;
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
}

export interface TimeInterval {
  startMs: number;
  endMs: number;
  activityId: UUID | null;
  transitionId: UUID;
}

export interface RoutineStepSnapshot {
  id: UUID;
  activityId: UUID;
  name: string | null;
  durationMs: number;
  sortOrder: number;
  color: string | null;
  iconName: string | null;
}

export interface RoutineSnapshot {
  id: UUID;
  name: string;
  steps: RoutineStepSnapshot[];
  capturedAt: IsoTimestamp;
}

export interface RoutineStepSession {
  stepId: UUID;
  status: RoutineStepStatus;
  startedAt: IsoTimestamp | null;
  completedAt: IsoTimestamp | null;
  addedTimeMs: number;
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
}

export interface RoutineRunHistory {
  id: UUID;
  routineId: UUID;
  routineSnapshot: RoutineSnapshot;
  status: 'completed' | 'abandoned';
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
  | { kind: 'interval'; everyDays: number; startDate: LogicalDayKey };

export type HabitTrigger =
  | { kind: 'tracked-time'; activityId: UUID; minimumMs: number }
  | { kind: 'routine-completion'; routineId: UUID };

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
  updatedAt: IsoTimestamp;
}

export interface AlarmSettings {
  enabled: boolean;
  leadTimeMs: number;
  sound: boolean;
  vibration: boolean;
}

export interface AppSettings {
  settingsVersion: number;
  logicalDayRolloverHour: number;
  appearance: Appearance;
  weekStartsOn: number;
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
