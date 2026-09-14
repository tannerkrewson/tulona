import {
  formatDuration,
  type HistoryActivityTotal,
  type HistoryAggregation,
  type HistoryDayTotal,
  type TimeGoalEvaluation,
  type TimeGoalPeriod,
} from '@domain';

export type HistoryBreakdownMode = 'activities' | 'folders';
export type HistoryChartVariant = 'stacked' | 'total';

export interface ActivityCompositionSegment {
  readonly key: string;
  readonly label: string;
  readonly color: string | null;
  readonly durationMs: number;
}

export interface RankedDurationItem {
  readonly key: string;
  readonly id: string | null;
  readonly kind: 'activity' | 'folder';
  readonly name: string;
  readonly secondaryLabel: string | null;
  readonly durationMs: number;
  readonly percentage: number;
  readonly color: string | null;
  readonly activityColors: readonly string[];
  readonly composition: readonly ActivityCompositionSegment[];
}

export interface HistoryChartSeries {
  readonly key: string;
  readonly label: string;
  readonly color: string | null;
}

/**
 * Chart points deliberately carry readable labels alongside numeric values.
 * Skia's canvas is not a semantic surface, so the HistoryChart component can
 * expose these same labels as native press targets below the graph.
 */
export interface HistoryChartPoint {
  readonly key: string;
  readonly label: string;
  readonly x: number;
  readonly totalMs: number;
  [seriesKey: string]: string | number;
}

export interface HistoryChartData {
  readonly data: readonly HistoryChartPoint[];
  readonly series: readonly HistoryChartSeries[];
}

export interface PeriodComparison {
  readonly differenceMs: number;
  readonly percentage: number | null;
  readonly tone: 'increase' | 'decrease' | 'neutral';
  readonly label: string;
}

function safeDuration(durationMs: number): number {
  return Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
}

export function formatAnalyticsDuration(durationMs: number): string {
  return formatDuration(safeDuration(durationMs));
}

export function formatAnalyticsPercentage(fraction: number): string {
  const safeFraction = Number.isFinite(fraction) ? Math.max(0, fraction) : 0;
  const percentage = Math.round(safeFraction * 100);
  return percentage === 0 && safeFraction > 0 ? '<1%' : `${percentage}%`;
}

export function formatGoalPeriod(period: TimeGoalPeriod, plural = false): string {
  const label = period === 'day' ? 'day' : period === 'week' ? 'week' : 'month';
  return plural ? `${label}s` : label;
}

export function formatGoalType(type: 'target' | 'limit'): string {
  return type === 'target' ? 'Target' : 'Limit';
}

/**
 * A zero baseline intentionally does not produce a percentage. A percentage
 * change from zero is undefined and would be misleading in a period summary.
 */
export function comparePeriods(
  currentMs: number,
  previousMs: number,
  previousLabel = 'the previous period'
): PeriodComparison | null {
  const current = safeDuration(currentMs);
  const previous = safeDuration(previousMs);
  const differenceMs = current - previous;

  if (differenceMs === 0) {
    return {
      differenceMs: 0,
      percentage: previous > 0 ? 0 : null,
      tone: 'neutral',
      label: `No change vs ${previousLabel}`,
    };
  }

  if (previous === 0) {
    return {
      differenceMs,
      percentage: null,
      tone: differenceMs > 0 ? 'increase' : 'decrease',
      label: differenceMs > 0 ? `More than ${previousLabel}` : `Less than ${previousLabel}`,
    };
  }

  const percentage = differenceMs / previous;
  const roundedPercentage = Math.round(Math.abs(percentage) * 100);
  return {
    differenceMs,
    percentage,
    tone: differenceMs > 0 ? 'increase' : 'decrease',
    label: `${differenceMs > 0 ? '+' : '-'}${roundedPercentage}% vs ${previousLabel}`,
  };
}

export function activityComposition(
  activities: readonly HistoryActivityTotal[]
): ActivityCompositionSegment[] {
  return activities
    .filter((activity) => safeDuration(activity.durationMs) > 0)
    .map((activity) => ({
      key: activity.key,
      label: activity.name,
      color: activity.color,
      durationMs: safeDuration(activity.durationMs),
    }));
}

export function rankedDurationItems(
  aggregation: Pick<HistoryAggregation, 'activities' | 'folders'>,
  mode: HistoryBreakdownMode
): RankedDurationItem[] {
  if (mode === 'activities') {
    return aggregation.activities.map((activity) => ({
      key: activity.key,
      id: activity.id,
      kind: 'activity',
      name: activity.name,
      secondaryLabel: activity.folderName,
      durationMs: safeDuration(activity.durationMs),
      percentage: activity.percentage,
      color: activity.color,
      activityColors: activity.color ? [activity.color] : [],
      composition: activityComposition([activity]),
    }));
  }

  return aggregation.folders.map((folder) => ({
    key: folder.key,
    id: folder.folderId,
    kind: 'folder',
    name: folder.folderName ?? 'Root',
    secondaryLabel: `${folder.activityIds.length} ${folder.activityIds.length === 1 ? 'activity' : 'activities'}`,
    durationMs: safeDuration(folder.durationMs),
    percentage: folder.percentage,
    color: null,
    activityColors: folder.activityColors,
    composition: [],
  }));
}

function seriesKeyFor(identity: string, used: Set<string>): string {
  // FNV-1a keeps keys short and deterministic without exposing snapshot JSON
  // in object property names. The collision suffix keeps the mapping safe even
  // if two historical identities happen to hash to the same value.
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const base = `activity-${(hash >>> 0).toString(36)}`;
  let key = base;
  let suffix = 2;
  while (used.has(key)) {
    key = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(key);
  return key;
}

/** Builds a stacked-bar data model from T1's snapshot-aware daily totals. */
export function buildActivityCompositionChartData(
  days: readonly HistoryDayTotal[]
): HistoryChartData {
  const seriesByIdentity = new Map<
    string,
    { label: string; color: string | null; durationMs: number }
  >();

  for (const day of days) {
    for (const activity of day.activities) {
      const existing = seriesByIdentity.get(activity.key);
      if (existing) {
        existing.durationMs += safeDuration(activity.durationMs);
      } else {
        seriesByIdentity.set(activity.key, {
          label: activity.name,
          color: activity.color,
          durationMs: safeDuration(activity.durationMs),
        });
      }
    }
  }

  const orderedSeries = [...seriesByIdentity.entries()].sort(
    ([, left], [, right]) =>
      right.durationMs - left.durationMs || left.label.localeCompare(right.label)
  );
  const usedKeys = new Set<string>();
  const series = orderedSeries.map(([identity, value]) => ({
    key: seriesKeyFor(identity, usedKeys),
    label: value.label,
    color: value.color,
    identity,
  }));
  const seriesKeyByIdentity = new Map(series.map((item) => [item.identity, item.key]));

  return {
    series: series.map(({ key, label, color }) => ({ key, label, color })),
    data: days.map((day, index) => {
      const point: HistoryChartPoint = {
        key: day.logicalDay,
        label: day.logicalDay,
        x: index,
        totalMs: safeDuration(day.totalMs),
      };
      for (const item of series) point[item.key] = 0;
      for (const activity of day.activities) {
        const key = seriesKeyByIdentity.get(activity.key);
        if (key) point[key] = safeDuration(activity.durationMs);
      }
      return point;
    }),
  };
}

export function buildTotalChartData(
  points: readonly { key: string; label: string; totalMs: number }[]
): HistoryChartData {
  return {
    series: [{ key: 'tracked-time', label: 'Tracked time', color: null }],
    data: points.map((point, index) => ({
      key: point.key,
      label: point.label,
      x: index,
      totalMs: safeDuration(point.totalMs),
      'tracked-time': safeDuration(point.totalMs),
    })),
  };
}

export function goalEvaluationLabel(evaluation: TimeGoalEvaluation, activityName: string): string {
  const goal =
    evaluation.kind === 'progress' ? evaluation.progress.goal : evaluation.adherence.goal;
  const kind = formatGoalType(goal.type).toLowerCase();
  const period = formatGoalPeriod(goal.period);
  return `${activityName} ${kind} goal for each ${period}`;
}
