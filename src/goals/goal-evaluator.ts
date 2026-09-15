import {
  goalWeekIdentity,
  logicalDayDifference,
  logicalDayKey,
  shiftLogicalDay,
  timestampMs,
  type Activity,
  type Goal,
  type GoalEvaluationMode,
  type GoalEvaluationRule,
  type GoalHabitEvaluationRule,
  type GoalRuleOutcome,
  type GoalWeekIdentity,
  type Habit,
  type HabitDayState,
  type TimeInterval,
  type UUID,
} from '@domain';

import { evaluateHabitSchedule, type HabitSchedulePeriod } from '../habits/schedule';
import { habitCompleted } from '../habits/streak';

export type GoalWeekInput = GoalWeekIdentity | Date | number | string;

export interface GoalEvaluationOptions {
  now?: Date | number | string;
  rolloverHour?: number;
  weekStartsOn?: number;
}

/** Materialized source history supplied to the pure evaluator. */
export interface GoalEvaluationData {
  habits?: readonly Habit[];
  habitStates?: readonly HabitDayState[];
  /** Alias useful to callers that already name their persisted state collection `states`. */
  states?: readonly HabitDayState[];
  intervals?: readonly TimeInterval[];
  /** Alias for callers that distinguish these from raw tracker transitions. */
  materializedIntervals?: readonly TimeInterval[];
  /** When supplied, this is authoritative for deciding whether an activity source exists. */
  activityIds?: readonly UUID[];
  activities?: readonly Pick<Activity, 'id'>[];
}

export interface GoalRuleEvaluation {
  ruleIndex: number;
  rule: GoalEvaluationRule;
  outcome: GoalRuleOutcome;
  statusId: UUID;
  sourceFound: boolean;
  /** Completed scheduled days for habits, or measured milliseconds for activities. */
  measuredValue: number;
  /** Configured count or duration target for the rule. */
  targetValue: number;
  /** Number of scheduled habit periods considered for this week. */
  consideredPeriods?: number;
}

export type GoalEvaluationOutcome = GoalRuleOutcome | 'manual' | 'no-rules';

export interface GoalEvaluation {
  mode: GoalEvaluationMode;
  week: GoalWeekIdentity;
  outcome: GoalEvaluationOutcome;
  /** Null is intentional for manual goals and automatic goals without rules. */
  statusId: UUID | null;
  rules: GoalRuleEvaluation[];
}

type WeekPhase = 'future' | 'current' | 'historical';

interface HabitMeasurement {
  completed: number;
  considered: number;
  target: number;
  noSkipped: boolean;
  hasBadOutcome: boolean;
}

const OUTCOME_RANK: Record<GoalRuleOutcome, number> = {
  good: 2,
  partial: 1,
  'no-progress': 0,
};

function statusIdForOutcome(
  statusIds: GoalEvaluationRule['statusIds'],
  outcome: GoalRuleOutcome
): UUID {
  return outcome === 'no-progress' ? statusIds.noProgress : statusIds[outcome];
}

function nowMilliseconds(value: Date | number | string | undefined): number {
  const result = timestampMs(value ?? Date.now());
  if (!Number.isFinite(result)) throw new RangeError('Goal evaluation time must be finite');
  return result;
}

function isGoalWeekIdentity(value: GoalWeekInput): value is GoalWeekIdentity {
  return (
    typeof value === 'object' &&
    value !== null &&
    !(value instanceof Date) &&
    'weekStart' in value &&
    'weekEnd' in value &&
    'startMs' in value &&
    'endMs' in value
  );
}

function asCanonicalWeek(
  value: GoalWeekInput,
  options: Pick<GoalEvaluationOptions, 'rolloverHour' | 'weekStartsOn'>
): GoalWeekIdentity {
  if (!isGoalWeekIdentity(value)) {
    return goalWeekIdentity(value, options);
  }
  const identity = value as GoalWeekIdentity;
  if (
    !Number.isFinite(identity.startMs) ||
    !Number.isFinite(identity.endMs) ||
    identity.endMs < identity.startMs
  ) {
    throw new RangeError('Goal week identity must contain a finite ordered range');
  }
  // A supplied identity is already canonical. This also lets callers pass a
  // week produced with non-default settings without having to reconstruct it.
  return { ...identity };
}

function weekPhase(week: GoalWeekIdentity, nowMs: number): WeekPhase {
  if (nowMs < week.startMs) return 'future';
  if (nowMs >= week.endMs) return 'historical';
  return 'current';
}

function statesByDay(
  states: readonly HabitDayState[],
  habitId: UUID,
  week: GoalWeekIdentity
): Map<string, HabitDayState> {
  const result = new Map<string, HabitDayState>();
  const candidates = states
    .filter(
      (state) =>
        state.habitId === habitId &&
        state.logicalDay >= week.weekStart &&
        state.logicalDay <= week.weekEnd
    )
    .sort((left, right) => {
      const updated = left.updatedAt.localeCompare(right.updatedAt);
      if (updated) return updated;
      return JSON.stringify(left).localeCompare(JSON.stringify(right));
    });
  for (const state of candidates) result.set(state.logicalDay, state);
  return result;
}

function periodDays(period: HabitSchedulePeriod, rolloverHour: number): string[] {
  const count = logicalDayDifference(period.start, period.end);
  return Array.from({ length: count + 1 }, (_, index) =>
    shiftLogicalDay(period.start, index, { rolloverHour })
  );
}

function isConsideredDay(
  day: string,
  state: HabitDayState | undefined,
  phase: WeekPhase,
  currentDay: string | null
): boolean {
  if (phase === 'future') return false;
  if (phase === 'historical') return true;
  if (!currentDay) return false;
  if (day < currentDay) return true;
  if (day > currentDay) return false;
  // The current logical day is still unfinished unless the user has either
  // completed it or explicitly recorded a failed/skipped outcome.
  return (
    state !== undefined &&
    (habitCompleted(state) || state.outcome === 'failed' || state.outcome === 'skipped')
  );
}

function measureHabit(
  rule: GoalHabitEvaluationRule,
  habit: Habit,
  states: readonly HabitDayState[],
  week: GoalWeekIdentity,
  phase: WeekPhase,
  currentDay: string | null,
  rolloverHour: number,
  weekStartsOn: number
): HabitMeasurement {
  const periods = evaluateHabitSchedule(
    habit.schedule,
    { start: week.weekStart, end: week.weekEnd },
    { rolloverHour, weekStartsOn }
  );
  const byDay = statesByDay(states, habit.id, week);
  let completed = 0;
  let considered = 0;
  let hasBadOutcome = false;
  const countedDays = new Set<string>();

  for (const period of periods) {
    for (const day of periodDays(period, rolloverHour)) {
      if (countedDays.has(day)) continue;
      const state = byDay.get(day);
      if (!isConsideredDay(day, state, phase, currentDay)) continue;
      countedDays.add(day);
      considered += 1;
      if (habitCompleted(state ?? null)) completed += 1;
      if (state?.outcome === 'failed' || state?.outcome === 'skipped') {
        hasBadOutcome = true;
      }
    }
  }

  const target =
    rule.measurement === 'completed-days'
      ? (rule.targetCount ?? 1)
      : periods.reduce((total, period) => {
          if (period.kind === 'week') return total + period.requiredCount;
          return total + (countedDays.has(period.start) ? 1 : 0);
        }, 0);
  return {
    completed,
    considered,
    target,
    noSkipped: rule.measurement === 'no-skipped' || rule.measurement === 'every-day',
    hasBadOutcome,
  };
}

function habitOutcome(measurement: HabitMeasurement): GoalRuleOutcome {
  if (measurement.noSkipped) {
    if (
      measurement.considered > 0 &&
      measurement.completed >= measurement.target &&
      !measurement.hasBadOutcome
    ) {
      return 'good';
    }
    return measurement.completed > 0 ? 'partial' : 'no-progress';
  }
  if (measurement.completed >= measurement.target) return 'good';
  return measurement.completed > 0 ? 'partial' : 'no-progress';
}

function knownActivityIds(data: GoalEvaluationData): Set<string> | null {
  if (data.activityIds !== undefined) return new Set(data.activityIds);
  if (data.activities !== undefined) return new Set(data.activities.map((activity) => activity.id));
  return null;
}

function trackedDuration(
  intervals: readonly TimeInterval[],
  activityId: UUID,
  week: GoalWeekIdentity,
  nowMs: number
): number {
  const endOfEvidence = Math.min(week.endMs, Math.max(week.startMs, nowMs));
  if (endOfEvidence <= week.startMs) return 0;
  return intervals.reduce((total, interval) => {
    if (interval.activityId !== activityId) return total;
    if (
      !Number.isFinite(interval.startMs) ||
      !Number.isFinite(interval.endMs) ||
      interval.endMs <= interval.startMs
    ) {
      return total;
    }
    const start = Math.max(interval.startMs, week.startMs);
    const end = Math.min(interval.endMs, endOfEvidence);
    return end > start ? total + end - start : total;
  }, 0);
}

function durationOutcome(
  rule: Extract<GoalEvaluationRule, { kind: 'activity-duration' }>,
  measuredMs: number,
  sourceFound: boolean
): GoalRuleOutcome {
  if (!sourceFound) return 'no-progress';
  if (rule.comparison === 'at-least') {
    if (measuredMs >= rule.targetMs) return 'good';
    return measuredMs > 0 ? 'partial' : 'no-progress';
  }
  if (measuredMs <= rule.targetMs) return 'good';
  // A baseline makes a reduction goal's partial state meaningful. Without a
  // baseline, exceeding the maximum is deterministically a no-progress result.
  return rule.baselineMs !== undefined && measuredMs < rule.baselineMs ? 'partial' : 'no-progress';
}

function evaluateRule(
  rule: GoalEvaluationRule,
  ruleIndex: number,
  data: GoalEvaluationData,
  week: GoalWeekIdentity,
  phase: WeekPhase,
  currentDay: string | null,
  nowMs: number,
  rolloverHour: number,
  weekStartsOn: number
): GoalRuleEvaluation {
  if (rule.kind === 'habit') {
    const habit = (data.habits ?? []).find((candidate) => candidate.id === rule.habitId);
    if (!habit) {
      return {
        ruleIndex,
        rule,
        outcome: 'no-progress',
        statusId: rule.statusIds.noProgress,
        sourceFound: false,
        measuredValue: 0,
        targetValue: rule.targetCount ?? 1,
        consideredPeriods: 0,
      };
    }
    const measurement = measureHabit(
      rule,
      habit,
      data.habitStates ?? data.states ?? [],
      week,
      phase,
      currentDay,
      rolloverHour,
      weekStartsOn
    );
    const outcome = habitOutcome(measurement);
    return {
      ruleIndex,
      rule,
      outcome,
      statusId: statusIdForOutcome(rule.statusIds, outcome),
      sourceFound: true,
      measuredValue: measurement.completed,
      targetValue: measurement.target,
      consideredPeriods: measurement.considered,
    };
  }

  const activityIds = knownActivityIds(data);
  const sourceFound = activityIds
    ? activityIds.has(rule.activityId)
    : (data.intervals ?? data.materializedIntervals ?? []).some(
        (interval) => interval.activityId === rule.activityId
      );
  const measuredMs = trackedDuration(
    data.intervals ?? data.materializedIntervals ?? [],
    rule.activityId,
    week,
    nowMs
  );
  const outcome = durationOutcome(rule, measuredMs, sourceFound);
  return {
    ruleIndex,
    rule,
    outcome,
    statusId: statusIdForOutcome(rule.statusIds, outcome),
    sourceFound,
    measuredValue: measuredMs,
    targetValue: rule.targetMs,
  };
}

/**
 * Evaluates one goal for one canonical week without reading or mutating any
 * persistence layer. Materialize tracker intervals before calling this
 * function so the tracker remains the sole owner of session boundaries.
 */
export function evaluateGoal(
  goal: Pick<Goal, 'evaluationMode' | 'rules'>,
  weekValue: GoalWeekInput,
  data: GoalEvaluationData = {},
  options: GoalEvaluationOptions = {}
): GoalEvaluation {
  const suppliedIdentity = isGoalWeekIdentity(weekValue) ? weekValue : null;
  const rolloverHour =
    options.rolloverHour ?? (suppliedIdentity ? new Date(suppliedIdentity.startMs).getHours() : 0);
  const weekStartsOn =
    options.weekStartsOn ?? (suppliedIdentity ? new Date(suppliedIdentity.startMs).getDay() : 0);
  const week = asCanonicalWeek(weekValue, { rolloverHour, weekStartsOn });
  const nowMs = nowMilliseconds(options.now);
  const mode = goal.evaluationMode ?? 'manual';
  if (mode === 'manual') {
    return { mode, week, outcome: 'manual', statusId: null, rules: [] };
  }

  const rules = goal.rules ?? [];
  if (rules.length === 0) {
    return { mode, week, outcome: 'no-rules', statusId: null, rules: [] };
  }
  const phase = weekPhase(week, nowMs);
  const currentDay = phase === 'current' ? logicalDayKey(nowMs, { rolloverHour }) : null;
  const evaluations = rules.map((rule, ruleIndex) =>
    evaluateRule(rule, ruleIndex, data, week, phase, currentDay, nowMs, rolloverHour, weekStartsOn)
  );
  const worst = evaluations.reduce(
    (selected, candidate) => {
      if (!selected) return candidate;
      return OUTCOME_RANK[candidate.outcome] < OUTCOME_RANK[selected.outcome]
        ? candidate
        : selected;
    },
    undefined as GoalRuleEvaluation | undefined
  );
  return {
    mode,
    week,
    outcome: worst?.outcome ?? 'no-rules',
    statusId: worst?.statusId ?? null,
    rules: evaluations,
  };
}

export class GoalEvaluator {
  constructor(private readonly options: GoalEvaluationOptions = {}) {}

  evaluate(
    goal: Pick<Goal, 'evaluationMode' | 'rules'>,
    weekValue: GoalWeekInput,
    data: GoalEvaluationData = {},
    options: GoalEvaluationOptions = {}
  ): GoalEvaluation {
    return evaluateGoal(goal, weekValue, data, { ...this.options, ...options });
  }
}

export const evaluateAutomaticGoal = evaluateGoal;
export const evaluateGoalWeek = evaluateGoal;
