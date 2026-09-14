import {
  aggregateHistory,
  aggregateHistoryByDay,
  comparisonHistoryPeriod,
  evaluateTimeGoal,
  materializeHistorySessions,
  type CatalogCollection,
  type HistoryAggregation,
  type HistoryDayTotal,
  type HistoryPeriod,
  type HistoryPeriodOptions,
  type HistorySession,
  type TimeGoalEvaluation,
} from '@domain';

import type { RoutineRuntime } from '../routine/routine-runtime';

export interface HistoryPeriodData {
  period: HistoryPeriod;
  comparisonPeriod: HistoryPeriod;
  catalog: CatalogCollection;
  sessions: HistorySession[];
  comparisonSessions: HistorySession[];
  aggregation: HistoryAggregation;
  comparisonAggregation: HistoryAggregation;
  days: HistoryDayTotal[];
  goals: Array<{ activityId: string; activityName: string; evaluation: TimeGoalEvaluation }>;
}

/**
 * Loads only the selected period and its immediately preceding comparable
 * period. Keeping this query outside render functions lets all range views use
 * the same clipping, snapshot, and running-session semantics.
 */
export async function loadHistoryPeriodData(
  runtime: Pick<RoutineRuntime, 'catalogService' | 'trackerService' | 'settings'>,
  period: HistoryPeriod,
  nowMs = Date.now()
): Promise<HistoryPeriodData> {
  const options: HistoryPeriodOptions = {
    rolloverHour: runtime.settings.logicalDayRolloverHour,
    weekStartsOn: runtime.settings.weekStartsOn,
  };
  const comparisonPeriod = comparisonHistoryPeriod(period, options);
  const [currentQuery, comparisonQuery, catalog] = await Promise.all([
    runtime.trackerService.query(period, nowMs),
    runtime.trackerService.query(comparisonPeriod, nowMs),
    runtime.catalogService.read(),
  ]);
  const sessions = materializeHistorySessions(currentQuery.transitions, period, nowMs);
  const comparisonSessions = materializeHistorySessions(
    comparisonQuery.transitions,
    comparisonPeriod,
    nowMs
  );
  const aggregation = aggregateHistory(sessions, period, catalog);
  const comparisonAggregation = aggregateHistory(comparisonSessions, comparisonPeriod, catalog);
  const days = aggregateHistoryByDay(sessions, period, options, catalog);
  const goals = catalog.activities.flatMap((activity) => {
    const evaluation = evaluateTimeGoal(activity, sessions, period, options, nowMs);
    return evaluation ? [{ activityId: activity.id, activityName: activity.name, evaluation }] : [];
  });

  return {
    period,
    comparisonPeriod,
    catalog,
    sessions,
    comparisonSessions,
    aggregation,
    comparisonAggregation,
    days,
    goals,
  };
}
