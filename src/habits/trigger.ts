import {
  logicalDayBounds,
  type CatalogCollection,
  type Habit,
  type HabitTrigger,
  type LogicalDayKey,
  type TimeInterval,
} from '@domain';
import type { TrackerQuery, TrackerRange } from '../tracker/tracker-engine';
import type { TrackerServiceApi } from '../tracker/tracker-service';

import type { HabitDateInput } from './schedule';

export interface HabitCatalogReferenceApi {
  read(): Promise<CatalogCollection>;
}

export interface HabitTriggerEvaluatorOptions {
  now?: HabitDateInput;
  rolloverHour?: number;
}

export interface HabitTriggerEvaluation {
  complete: boolean;
  totalMs: number;
  minimumSeconds: number;
  range: TrackerRange;
  targetIds: string[];
}

function minimumSeconds(trigger: HabitTrigger): number {
  if (trigger.minimumSeconds !== undefined && trigger.minimumMs !== undefined) {
    throw new RangeError('Habit trigger cannot define both minimumSeconds and minimumMs');
  }
  const configured =
    trigger.minimumSeconds ??
    (trigger.minimumMs === undefined ? undefined : trigger.minimumMs / 1000);
  if (configured === undefined) return 1;
  if (!Number.isFinite(configured) || configured <= 0) {
    throw new RangeError('Habit trigger minimumSeconds must be positive and finite');
  }
  return configured;
}

export function normalizeHabitTrigger(trigger: HabitTrigger): HabitTrigger {
  const seconds = minimumSeconds(trigger);
  switch (trigger.kind) {
    case 'tracked-time':
      return { kind: trigger.kind, activityId: trigger.activityId, minimumSeconds: seconds };
    case 'folder-time':
      return { kind: trigger.kind, folderId: trigger.folderId, minimumSeconds: seconds };
    case 'routine-completion':
      return { kind: trigger.kind, routineId: trigger.routineId, minimumSeconds: seconds };
  }
}

function targetIds(trigger: HabitTrigger, catalog: CatalogCollection | null): string[] {
  switch (trigger.kind) {
    case 'tracked-time':
      return [trigger.activityId];
    case 'routine-completion':
      // Routine runs are attributed to their top-level routine transition. Step
      // activity intervals are deliberately not included here.
      return [trigger.routineId];
    case 'folder-time': {
      if (!catalog) throw new Error('A catalog is required to evaluate a folder habit trigger');
      return [...catalog.activities, ...catalog.routines]
        .filter((item) => item.folderId === trigger.folderId)
        .map((item) => item.id);
    }
  }
}

export function trackedMilliseconds(
  intervals: readonly TimeInterval[],
  activityIds: ReadonlySet<string> | readonly string[]
): number {
  const ids = activityIds instanceof Set ? activityIds : new Set(activityIds);
  return intervals.reduce(
    (total, interval) =>
      ids.has(interval.activityId ?? '')
        ? total + Math.max(0, interval.endMs - interval.startMs)
        : total,
    0
  );
}

export function evaluateHabitTrigger(
  trigger: HabitTrigger,
  intervals: readonly TimeInterval[],
  catalog: CatalogCollection | null = null
): Omit<HabitTriggerEvaluation, 'range'> {
  const seconds = minimumSeconds(trigger);
  const ids = targetIds(trigger, catalog);
  const totalMs = trackedMilliseconds(intervals, ids);
  return {
    complete: totalMs >= seconds * 1000,
    totalMs,
    minimumSeconds: seconds,
    targetIds: ids,
  };
}

function logicalDayDate(logicalDay: LogicalDayKey): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(logicalDay);
  if (!match) throw new RangeError(`Invalid logical day "${logicalDay}"`);
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  if (
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[3])
  ) {
    throw new RangeError(`Invalid logical day "${logicalDay}"`);
  }
  return date;
}

function nowMilliseconds(value: HabitDateInput | undefined): number {
  const result = value === undefined ? Date.now() : new Date(value).getTime();
  if (!Number.isFinite(result))
    throw new RangeError('Habit trigger evaluation time must be finite');
  return result;
}

export class HabitTriggerEvaluator {
  constructor(
    private readonly tracker: Pick<TrackerServiceApi, 'query'>,
    private readonly catalog: HabitCatalogReferenceApi | null = null,
    private readonly options: HabitTriggerEvaluatorOptions = {}
  ) {}

  async evaluate(
    habit: Pick<Habit, 'trigger'>,
    logicalDay: LogicalDayKey,
    options: HabitTriggerEvaluatorOptions = {}
  ): Promise<HabitTriggerEvaluation> {
    if (!habit.trigger) {
      const bounds = logicalDayBounds(logicalDayDate(logicalDay), {
        rolloverHour: options.rolloverHour ?? this.options.rolloverHour ?? 0,
      });
      return {
        complete: false,
        totalMs: 0,
        minimumSeconds: 1,
        range: { startMs: bounds.startMs, endMs: bounds.endMs },
        targetIds: [],
      };
    }
    const rolloverHour = options.rolloverHour ?? this.options.rolloverHour ?? 0;
    const bounds = logicalDayBounds(logicalDayDate(logicalDay), { rolloverHour });
    const nowMs = nowMilliseconds(options.now ?? this.options.now);
    const range = { startMs: bounds.startMs, endMs: bounds.endMs };
    const result: TrackerQuery = await this.tracker.query(range, nowMs);
    const catalog = this.catalog ? await this.catalog.read() : null;
    return {
      ...evaluateHabitTrigger(habit.trigger, result.intervals, catalog),
      range,
    };
  }

  async isComplete(
    habit: Pick<Habit, 'trigger'>,
    logicalDay: LogicalDayKey,
    options: HabitTriggerEvaluatorOptions = {}
  ): Promise<boolean> {
    return (await this.evaluate(habit, logicalDay, options)).complete;
  }
}

export async function automaticHabitCompletion(
  evaluator: HabitTriggerEvaluator,
  habit: Pick<Habit, 'trigger'>,
  logicalDay: LogicalDayKey,
  options?: HabitTriggerEvaluatorOptions
): Promise<boolean> {
  return evaluator.isComplete(habit, logicalDay, options);
}

export function createHabitTriggerEvaluator(
  tracker: Pick<TrackerServiceApi, 'query'>,
  catalog?: HabitCatalogReferenceApi,
  options?: HabitTriggerEvaluatorOptions
): HabitTriggerEvaluator {
  return new HabitTriggerEvaluator(tracker, catalog ?? null, options);
}

export const evaluateAutomaticCompletion = automaticHabitCompletion;
export const evaluateTrackedTime = evaluateHabitTrigger;
export const getTrackedMilliseconds = trackedMilliseconds;
