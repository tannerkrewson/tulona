import {
  logicalDayKey,
  timestampMs,
  toTimestamp,
  type Habit,
  type LogicalDayKey,
  type UUID,
} from '@domain';
import type { HabitRepositoryApi } from '@data';

import type { TrackerMutation } from '../tracker/tracker-service';
import { evaluateHabitSchedule, type HabitDateInput, type HabitScheduleOptions } from './schedule';
import {
  createHabitTriggerEvaluator,
  type HabitCatalogReferenceApi,
  type HabitTriggerEvaluator,
  type HabitTriggerEvaluatorOptions,
} from './trigger';

export interface HabitReconciliationOptions extends HabitScheduleOptions {
  now?: HabitDateInput;
}

export interface HabitReconciliationResult {
  updated: number;
  habitIds: UUID[];
  logicalDays: LogicalDayKey[];
}

function asTimestamp(value: HabitDateInput | undefined): string {
  const timestamp = value === undefined ? Date.now() : value;
  return toTimestamp(timestamp);
}

function timeMs(value: HabitDateInput): number {
  const result = timestampMs(value);
  if (!Number.isFinite(result)) throw new RangeError('Reconciliation time must be finite');
  return result;
}

function dayRange(start: LogicalDayKey, end: LogicalDayKey, rolloverHour: number): LogicalDayKey[] {
  const periods = evaluateHabitSchedule({ kind: 'daily' }, { start, end }, { rolloverHour });
  return periods.map((period) => period.start);
}

function mutationStart(mutation: TrackerMutation, rolloverHour: number): LogicalDayKey {
  const timestamps = [mutation.previous?.timestamp, mutation.current?.timestamp].filter(
    (value): value is string => value !== undefined
  );
  if (timestamps.length === 0) {
    throw new RangeError('Tracker mutation has no timestamp to reconcile');
  }
  const earliest = Math.min(...timestamps.map((value) => timeMs(value)));
  return logicalDayKey(earliest, { rolloverHour });
}

function mutationActivityIds(mutation: TrackerMutation): Set<string> {
  return new Set(
    [
      ...(mutation.affectedActivityIds ?? []),
      mutation.previous?.activityId,
      mutation.current?.activityId,
    ].filter((value): value is string => value !== null && value !== undefined)
  );
}

function linkedHabitIds(
  habits: readonly Habit[],
  mutation: TrackerMutation,
  catalog: Awaited<ReturnType<HabitCatalogReferenceApi['read']>> | null
): UUID[] {
  const activityIds = mutationActivityIds(mutation);
  if (activityIds.size === 0) return habits.map((habit) => habit.id);
  const folderChildren = new Map<string, Set<string>>();
  if (catalog) {
    for (const folder of catalog.folders) {
      folderChildren.set(
        folder.id,
        new Set(
          [...catalog.activities, ...catalog.routines]
            .filter((item) => item.folderId === folder.id)
            .map((item) => item.id)
        )
      );
    }
  }
  return habits
    .filter((habit) => {
      if (!habit.trigger) return false;
      switch (habit.trigger.kind) {
        case 'tracked-time':
          return activityIds.has(habit.trigger.activityId);
        case 'routine-completion':
          return activityIds.has(habit.trigger.routineId);
        case 'folder-time': {
          const children = folderChildren.get(habit.trigger.folderId);
          return children ? [...activityIds].some((id) => children.has(id)) : false;
        }
      }
    })
    .map((habit) => habit.id);
}

export class HabitReconciliationService {
  private readonly catalog: HabitCatalogReferenceApi | null;
  private readonly options: HabitReconciliationOptions;

  constructor(
    private readonly repository: HabitRepositoryApi,
    private readonly evaluator: HabitTriggerEvaluator,
    catalogOrOptions: HabitCatalogReferenceApi | HabitReconciliationOptions | null = {},
    options: HabitReconciliationOptions = {}
  ) {
    if (catalogOrOptions && 'read' in catalogOrOptions) {
      this.catalog = catalogOrOptions;
      this.options = options;
    } else {
      this.catalog = null;
      this.options = catalogOrOptions ?? {};
    }
  }

  async reconcile(
    logicalDays: readonly LogicalDayKey[],
    habitIds?: readonly UUID[]
  ): Promise<HabitReconciliationResult> {
    const uniqueDays = [...new Set(logicalDays)];
    const habits = (await this.repository.readHabits()).filter(
      (habit) => habit.archivedAt === null && habit.trigger !== null
    );
    const selected = habitIds ? habits.filter((habit) => habitIds.includes(habit.id)) : habits;
    const updatedAt = asTimestamp(this.options.now);
    let updated = 0;
    for (const habit of selected) {
      for (const logicalDay of uniqueDays) {
        const complete = await this.evaluator.isComplete(habit, logicalDay, {
          now: this.options.now,
          rolloverHour: this.options.rolloverHour,
        });
        await this.repository.updateSignals(
          habit.id,
          logicalDay,
          { automatic: complete },
          updatedAt
        );
        updated += 1;
      }
    }
    return { updated, habitIds: selected.map((habit) => habit.id), logicalDays: uniqueDays };
  }

  async reconcileRange(
    start: LogicalDayKey,
    end: LogicalDayKey,
    habitIds?: readonly UUID[]
  ): Promise<HabitReconciliationResult> {
    return this.reconcile(dayRange(start, end, this.options.rolloverHour ?? 0), habitIds);
  }

  readonly reconcileTrackerEdit = async (
    mutation: TrackerMutation
  ): Promise<HabitReconciliationResult> => {
    const rolloverHour = this.options.rolloverHour ?? 0;
    const end = logicalDayKey(this.options.now ?? Date.now(), { rolloverHour });
    const start = mutationStart(mutation, rolloverHour);
    if (start > end) return { updated: 0, habitIds: [], logicalDays: [] };
    const habits = (await this.repository.readHabits()).filter(
      (habit) => habit.archivedAt === null && habit.trigger !== null
    );
    const catalogValue = this.catalog ? await this.catalog.read() : null;
    const ids = linkedHabitIds(habits, mutation, catalogValue);
    return this.reconcileRange(start, end, ids);
  };
}

export function createHabitReconciliationService(
  repository: HabitRepositoryApi,
  tracker: Parameters<typeof createHabitTriggerEvaluator>[0],
  catalog?: HabitCatalogReferenceApi,
  options?: HabitReconciliationOptions
): HabitReconciliationService {
  const evaluatorOptions: HabitTriggerEvaluatorOptions = {
    now: options?.now,
    rolloverHour: options?.rolloverHour,
  };
  return new HabitReconciliationService(
    repository,
    createHabitTriggerEvaluator(tracker, catalog, evaluatorOptions),
    catalog ?? null,
    options
  );
}
