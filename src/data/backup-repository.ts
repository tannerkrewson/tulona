import {
  monthKey,
  type CatalogCollection,
  type Habit,
  type HabitDayState,
  type ActiveRoutine,
  type AppSettings,
  type RoutineRunHistory,
  type Transition,
} from '@domain';

import { CatalogRepository } from './catalog-repository';
import type { KeyValueDatabase } from './database';
import { PersistenceError } from './errors';
import { HabitRepository } from './habit-repository';
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
}

export interface BackupRepositoryApi {
  read(namespace: DatasetNamespace): Promise<BackupDatasetSnapshot>;
  write(namespace: DatasetNamespace, snapshot: BackupDatasetSnapshot): Promise<void>;
  verify(namespace: DatasetNamespace, expected: BackupDatasetSnapshot): Promise<void>;
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
    const catalogRepository = new CatalogRepository(this.database, namespace);
    const trackerRepository = new TrackerRepository(this.database, namespace);
    const routineRepository = new RoutineRepository(this.database, namespace);
    const habitRepository = new HabitRepository(this.database, namespace);
    const settingsRepository = new SettingsRepository(this.database, namespace);
    const [catalog, settings, habits, activeRoutine, trackerMonths, historyMonths, habitMonths] =
      await Promise.all([
        catalogRepository.read(),
        settingsRepository.read(),
        habitRepository.readHabits(),
        routineRepository.readActive(),
        this.months(namespace, 'tracker'),
        this.months(namespace, 'routine-history'),
        this.months(namespace, 'habit-days'),
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
    });
  }

  async write(namespace: DatasetNamespace, snapshot: BackupDatasetSnapshot): Promise<void> {
    const normalized = normalizeBackupSnapshot(snapshot);
    const catalogRepository = new CatalogRepository(this.database, namespace);
    const trackerRepository = new TrackerRepository(this.database, namespace);
    const routineRepository = new RoutineRepository(this.database, namespace);
    const habitRepository = new HabitRepository(this.database, namespace);
    const settingsRepository = new SettingsRepository(this.database, namespace);
    await catalogRepository.write(normalized.catalog);
    await settingsRepository.write(normalized.settings);
    await habitRepository.writeHabits(normalized.habits);

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
    namespace: DatasetNamespace,
    collection: 'tracker' | 'routine-history' | 'habit-days'
  ): Promise<string[]> {
    const prefix = `${namespace.key(collection)}:`;
    const keys = this.database.keys ? await this.database.keys() : [];
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
