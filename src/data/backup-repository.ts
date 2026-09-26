import {
  activeRoutineSchema,
  appSettingsSchema,
  catalogCollectionSchema,
  goalCollectionSchema,
  goalSettingsSchema,
  goalWeekCollectionSchema,
  habitCollectionSchema,
  habitMonthCollectionSchema,
  monthKey,
  routineHistoryCollectionSchema,
  trackerMonthCollectionSchema,
  type CatalogCollection,
  type Habit,
  type HabitDayState,
  type ActiveRoutine,
  type AppSettings,
  type Goal,
  type GoalSettings,
  type GoalWeekCollection,
  type RoutineRunHistory,
  type Transition,
} from '@domain';

import { CatalogRepository } from './catalog-repository';
import type { DatabaseSnapshotCommit, KeyValueDatabase } from './database';
import { PersistenceError } from './errors';
import { HabitRepository } from './habit-repository';
import { GoalRepository } from './goal-repository';
import { RoutineRepository } from './routine-repository';
import { SettingsRepository } from './settings-repository';
import type { DatasetNamespace } from './namespaces';
import { TrackerRepository } from './tracker-repository';

export interface BackupDatasetSnapshot {
  settings: AppSettings;
  catalog: CatalogCollection;
  transitions: Transition[];
  routineHistory: RoutineRunHistory[];
  activeRoutine: ActiveRoutine | null;
  habits: Habit[];
  habitDayStates: HabitDayState[];
  goals: Goal[];
  goalSettings: GoalSettings;
  goalWeeks: GoalWeekCollection[];
}

export interface BackupRepositoryApi {
  read(namespace: DatasetNamespace): Promise<BackupDatasetSnapshot>;
  write(namespace: DatasetNamespace, snapshot: BackupDatasetSnapshot): Promise<void>;
  verify(namespace: DatasetNamespace, expected: BackupDatasetSnapshot): Promise<void>;
  readConsistent?(namespace: DatasetNamespace): Promise<ConsistentBackupRead>;
  applySynchronizedSnapshot?(
    namespace: DatasetNamespace,
    snapshot: BackupDatasetSnapshot,
    expectedEntries: ReadonlyMap<string, string>,
    compare: ReadonlyMap<string, string | null>,
    writes: ReadonlyMap<string, string>
  ): Promise<boolean>;
}

export interface ConsistentBackupRead {
  snapshot: BackupDatasetSnapshot;
  /** Raw values from the same storage snapshot used to build `snapshot`. */
  entries: ReadonlyMap<string, string>;
}

class SnapshotDatabase implements KeyValueDatabase {
  private readonly values: Map<string, string>;

  constructor(entries: ReadonlyMap<string, string>) {
    this.values = new Map(entries);
  }

  async read(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async write(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.values.delete(key);
  }

  async multiRead(keys: readonly string[]): Promise<ReadonlyMap<string, string | null>> {
    return new Map(keys.map((key) => [key, this.values.get(key) ?? null]));
  }

  async multiWrite(entries: readonly (readonly [string, string])[]): Promise<void> {
    for (const [key, value] of entries) this.values.set(key, value);
  }

  async multiRemove(keys: readonly string[]): Promise<void> {
    for (const key of keys) this.values.delete(key);
  }

  async verify(key: string, expectedValue: string | null): Promise<void> {
    if ((this.values.get(key) ?? null) !== expectedValue) {
      throw new Error('The in-memory database snapshot did not retain a written value');
    }
  }

  async keys(): Promise<readonly string[]> {
    return [...this.values.keys()];
  }
}

function sortTransitions(values: readonly Transition[]): Transition[] {
  return [...values].sort(
    (left, right) =>
      left.timestamp.localeCompare(right.timestamp) || left.id.localeCompare(right.id)
  );
}

function sortRuns(values: readonly RoutineRunHistory[]): RoutineRunHistory[] {
  return [...values].sort(
    (left, right) =>
      left.completedAt.localeCompare(right.completedAt) || left.id.localeCompare(right.id)
  );
}

function sortStates(values: readonly HabitDayState[]): HabitDayState[] {
  return [...values].sort(
    (left, right) =>
      left.logicalDay.localeCompare(right.logicalDay) || left.habitId.localeCompare(right.habitId)
  );
}

function sortCatalog(catalog: CatalogCollection): CatalogCollection {
  const byOrder = <T extends { sortOrder: number; id: string }>(values: readonly T[]) =>
    [...values].sort(
      (left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)
    );
  return {
    folders: byOrder(catalog.folders),
    activities: byOrder(catalog.activities),
    routines: byOrder(catalog.routines).map((routine) => ({
      ...routine,
      steps: byOrder(routine.steps),
    })),
  };
}

export function normalizeBackupSnapshot(snapshot: BackupDatasetSnapshot): BackupDatasetSnapshot {
  return {
    settings: snapshot.settings,
    catalog: sortCatalog(snapshot.catalog),
    transitions: sortTransitions(snapshot.transitions),
    routineHistory: sortRuns(snapshot.routineHistory),
    activeRoutine: snapshot.activeRoutine,
    habits: [...snapshot.habits].sort(
      (left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)
    ),
    habitDayStates: sortStates(snapshot.habitDayStates),
    goals: [...snapshot.goals],
    goalSettings: {
      ...snapshot.goalSettings,
      statusDefinitions: [...snapshot.goalSettings.statusDefinitions].sort(
        (left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)
      ),
    },
    goalWeeks: [...snapshot.goalWeeks]
      .sort((left, right) => left.weekStart.localeCompare(right.weekStart))
      .map((week) => ({
        weekStart: week.weekStart,
        statuses: [...week.statuses].sort((left, right) => left.goalId.localeCompare(right.goalId)),
      })),
  };
}

function monthRange(start: string, end: string): string[] {
  const [startYear, startMonth] = start.split('-').map(Number);
  const [endYear, endMonth] = end.split('-').map(Number);
  const values: string[] = [];
  let year = startYear;
  let month = startMonth;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    values.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return values;
}

export class BackupRepository implements BackupRepositoryApi {
  constructor(private readonly database: KeyValueDatabase) {}

  async read(namespace: DatasetNamespace): Promise<BackupDatasetSnapshot> {
    return (await this.readConsistent(namespace)).snapshot;
  }

  async readConsistent(namespace: DatasetNamespace): Promise<ConsistentBackupRead> {
    const entries = this.database.readSnapshot ? await this.database.readSnapshot() : null;
    const database = entries ? new SnapshotDatabase(entries) : this.database;
    return {
      snapshot: await this.readFrom(database, namespace),
      entries: entries ?? new Map(),
    };
  }

  private async readFrom(
    database: KeyValueDatabase,
    namespace: DatasetNamespace
  ): Promise<BackupDatasetSnapshot> {
    const catalogRepository = new CatalogRepository(database, namespace);
    const trackerRepository = new TrackerRepository(database, namespace);
    const routineRepository = new RoutineRepository(database, namespace);
    const habitRepository = new HabitRepository(database, namespace);
    const goalRepository = new GoalRepository(database, namespace);
    const settingsRepository = new SettingsRepository(database, namespace);
    const [
      catalog,
      settings,
      habits,
      activeRoutine,
      goals,
      goalSettings,
      goalWeeks,
      trackerMonths,
      historyMonths,
      habitMonths,
    ] = await Promise.all([
      catalogRepository.read(),
      settingsRepository.read(),
      habitRepository.readHabits(),
      routineRepository.readActive(),
      goalRepository.readGoals(),
      goalRepository.readSettings(),
      goalRepository.readWeeks(),
      this.months(database, namespace, 'tracker'),
      this.months(database, namespace, 'routine-history'),
      this.months(database, namespace, 'habit-days'),
    ]);
    const transitions = (
      await Promise.all(trackerMonths.map((month) => trackerRepository.readMonth(month)))
    ).flatMap((collection) => collection.transitions);
    const routineHistory = (
      await Promise.all(historyMonths.map((month) => routineRepository.readHistory(month)))
    ).flatMap((collection) => collection.runs);
    const habitDayStates = (
      await Promise.all(habitMonths.map((month) => habitRepository.readMonth(month)))
    ).flatMap((collection) => collection.states);
    return normalizeBackupSnapshot({
      settings,
      catalog,
      transitions,
      routineHistory,
      activeRoutine,
      habits,
      habitDayStates,
      goals,
      goalSettings,
      goalWeeks,
    });
  }

  async applySynchronizedSnapshot(
    namespace: DatasetNamespace,
    snapshot: BackupDatasetSnapshot,
    expectedEntries: ReadonlyMap<string, string>,
    compare: ReadonlyMap<string, string | null>,
    writes: ReadonlyMap<string, string>
  ): Promise<boolean> {
    if (!this.database.compareAndApplySnapshot || !this.database.readSnapshot) {
      await this.write(namespace, snapshot);
      await this.database.multiWrite([...writes]);
      return true;
    }
    const current = await this.database.readSnapshot();
    const prefix = `${namespace.key('catalog').slice(0, namespace.key('catalog').lastIndexOf(':') + 1)}`;
    const expectedPrefix = new Map([...expectedEntries].filter(([key]) => key.startsWith(prefix)));
    const snapshotEntries = encodeDatasetSnapshot(namespace, snapshot);
    const currentPrefix = [...current.keys()].filter((key) => key.startsWith(prefix));
    const deletes = currentPrefix.filter((key) => !snapshotEntries.has(key));
    const commit: DatabaseSnapshotCommit = {
      prefix,
      expectedPrefix,
      compare,
      writes: new Map([...snapshotEntries, ...writes]),
      deletes,
      source: 'sync',
    };
    return this.database.compareAndApplySnapshot(commit);
  }

  async write(namespace: DatasetNamespace, snapshot: BackupDatasetSnapshot): Promise<void> {
    const normalized = normalizeBackupSnapshot(snapshot);
    const catalogRepository = new CatalogRepository(this.database, namespace);
    const trackerRepository = new TrackerRepository(this.database, namespace);
    const routineRepository = new RoutineRepository(this.database, namespace);
    const habitRepository = new HabitRepository(this.database, namespace);
    const goalRepository = new GoalRepository(this.database, namespace);
    const settingsRepository = new SettingsRepository(this.database, namespace);
    await catalogRepository.write(normalized.catalog);
    await settingsRepository.write(normalized.settings);
    await habitRepository.writeHabits(normalized.habits);
    await goalRepository.writeGoals(normalized.goals);
    await goalRepository.writeSettings(normalized.goalSettings);
    const existingGoalWeeks = await goalRepository.readWeeks();
    const incomingGoalWeeks = new Set(normalized.goalWeeks.map((week) => week.weekStart));
    for (const week of existingGoalWeeks) {
      if (incomingGoalWeeks.has(week.weekStart)) continue;
      for (const status of week.statuses) {
        await goalRepository.deleteWeeklyStatus(status.goalId, status.weekStart);
      }
    }
    for (const week of normalized.goalWeeks) await goalRepository.writeWeek(week);

    const trackerCollections = groupTransitions(normalized.transitions);
    if (trackerCollections.length > 0) {
      await trackerRepository.writeCrossMonth(
        trackerCollections,
        `backup-dataset-tracker-${namespace.datasetId}`,
        'backup-dataset-write'
      );
    }
    for (const history of groupRuns(normalized.routineHistory)) {
      await routineRepository.writeHistory(history);
    }
    for (const collection of groupStates(normalized.habitDayStates)) {
      await habitRepository.writeMonth(collection);
    }
    if (normalized.activeRoutine) await routineRepository.writeActive(normalized.activeRoutine);
    else await routineRepository.clearActive();
  }

  async verify(namespace: DatasetNamespace, expected: BackupDatasetSnapshot): Promise<void> {
    const actual = normalizeBackupSnapshot(await this.read(namespace));
    const normalizedExpected = normalizeBackupSnapshot(expected);
    if (JSON.stringify(actual) !== JSON.stringify(normalizedExpected)) {
      throw new PersistenceError(
        'verification',
        'Imported dataset verification did not match the normalized backup'
      );
    }
  }

  private async months(
    database: KeyValueDatabase,
    namespace: DatasetNamespace,
    collection: 'tracker' | 'routine-history' | 'habit-days'
  ): Promise<string[]> {
    const prefix = `${namespace.key(collection)}:`;
    const keys = database.keys ? await database.keys() : [];
    const discovered = keys
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length))
      .filter((suffix) => /^\d{4}-(0[1-9]|1[0-2])$/.test(suffix));
    if (discovered.length > 0) return [...new Set(discovered)].sort();
    if (keys.length > 0) return [];

    // Adapters without key enumeration still get a complete practical range;
    // the normal web/native adapter uses getAllKeys above.
    return monthRange('1970-01', monthKey(Date.now()));
  }
}

function groupTransitions(transitions: readonly Transition[]) {
  const groups = new Map<string, Transition[]>();
  for (const transition of transitions) {
    const month = monthKey(transition.timestamp);
    groups.set(month, [...(groups.get(month) ?? []), transition]);
  }
  return [...groups.entries()].map(([month, values]) => ({
    month: month as `${number}-${number}`,
    transitions: values,
    latestTransitions: [],
  }));
}

function groupRuns(runs: readonly RoutineRunHistory[]) {
  const groups = new Map<string, RoutineRunHistory[]>();
  for (const run of runs) {
    const month = monthKey(run.completedAt);
    groups.set(month, [...(groups.get(month) ?? []), run]);
  }
  return [...groups.entries()].map(([month, values]) => ({
    month: month as `${number}-${number}`,
    runs: values,
  }));
}

function groupStates(states: readonly HabitDayState[]) {
  const groups = new Map<string, HabitDayState[]>();
  for (const state of states) {
    const month = state.logicalDay.slice(0, 7);
    groups.set(month, [...(groups.get(month) ?? []), state]);
  }
  return [...groups.entries()].map(([month, values]) => ({
    month: month as `${number}-${number}`,
    states: values,
  }));
}

function latestTransitions(transitions: readonly Transition[]): Transition[] {
  const latest = new Map<string, Transition>();
  for (const transition of sortTransitions(transitions)) {
    latest.set(transition.activityId ?? 'none', transition);
  }
  return [...latest.values()];
}

function encodeDatasetSnapshot(
  namespace: DatasetNamespace,
  input: BackupDatasetSnapshot
): Map<string, string> {
  const snapshot = normalizeBackupSnapshot(input);
  const values = new Map<string, string>();
  const put = <T>(key: string, schema: { parse(value: unknown): T }, value: unknown) => {
    values.set(key, JSON.stringify(schema.parse(value)));
  };

  put(namespace.key('catalog'), catalogCollectionSchema, snapshot.catalog);
  put(namespace.key('settings'), appSettingsSchema, snapshot.settings);
  put(namespace.key('habits'), habitCollectionSchema, { habits: snapshot.habits });
  put(namespace.key('goals'), goalCollectionSchema, { goals: snapshot.goals });
  put(namespace.key('goal-settings'), goalSettingsSchema, snapshot.goalSettings);
  if (snapshot.activeRoutine) {
    put(namespace.key('active-routine'), activeRoutineSchema, snapshot.activeRoutine);
  }
  for (const collection of groupTransitions(snapshot.transitions)) {
    put(namespace.key('tracker', collection.month), trackerMonthCollectionSchema, {
      ...collection,
      latestTransitions: latestTransitions(collection.transitions),
    });
  }
  for (const collection of groupRuns(snapshot.routineHistory)) {
    put(
      namespace.key('routine-history', collection.month),
      routineHistoryCollectionSchema,
      collection
    );
  }
  for (const collection of groupStates(snapshot.habitDayStates)) {
    put(namespace.key('habit-days', collection.month), habitMonthCollectionSchema, collection);
  }
  for (const week of snapshot.goalWeeks) {
    put(namespace.key('goal-weeks', week.weekStart), goalWeekCollectionSchema, week);
  }
  return values;
}
