import {
  activityComposition,
  buildActivityCompositionChartData,
  buildTotalChartData,
  comparePeriods,
  formatAnalyticsPercentage,
  goalEvaluationLabel,
  rankedDurationItems,
} from '../src/history/analytics/analytics-data';
import type {
  HistoryActivityTotal,
  HistoryDayTotal,
  HistoryFolderTotal,
  HistoryPeriod,
  TimeGoalEvaluation,
} from '../src/domain';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const period: HistoryPeriod = {
  kind: 'week',
  key: '2026-09-07',
  startMs: 0,
  endMs: 7 * 24 * 60 * 60 * 1000,
  startLogicalDay: '2026-09-07',
  endLogicalDay: '2026-09-13',
};

function activity(
  key: string,
  id: string,
  name: string,
  color: string | null,
  durationMs: number,
  percentage: number,
  folderName: string | null = null
): HistoryActivityTotal {
  return {
    key,
    id,
    kind: 'activity',
    name,
    color,
    iconName: null,
    folderId: null,
    folderName,
    durationMs,
    percentage,
  };
}

function day(
  logicalDay: string,
  activities: readonly HistoryActivityTotal[],
  totalMs: number
): HistoryDayTotal {
  return {
    logicalDay,
    period: {
      ...period,
      kind: 'day',
      key: logicalDay,
      startLogicalDay: logicalDay,
      endLogicalDay: logicalDay,
    },
    totalMs,
    activities: [...activities],
    folders: [],
  };
}

const focus = activity(
  'focus-snapshot',
  'activity-focus',
  'Focus',
  '#7C3AED',
  30 * 60 * 1000,
  0.75
);
const reading = activity(
  'reading-snapshot',
  'activity-reading',
  'Reading',
  '#7C3AED',
  10 * 60 * 1000,
  0.25,
  'Personal'
);
const days = [
  day('2026-09-07', [focus], focus.durationMs),
  day('2026-09-08', [reading], reading.durationMs),
];

const chart = buildActivityCompositionChartData(days);
assertEqual(chart.series.length, 2, 'snapshot identities remain separate chart series');
assertEqual(chart.series[0]?.color, '#7C3AED', 'chart series preserve the activity color');
assert(
  chart.series[0]?.key !== chart.series[1]?.key,
  'activities with the same color still receive distinct series keys'
);
assertEqual(chart.data.length, 2, 'chart data retains every day');
assertEqual(chart.data[0]?.totalMs, focus.durationMs, 'chart data keeps day totals');
const focusSeriesKey = chart.series.find((series) => series.label === 'Focus')?.key;
assert(focusSeriesKey, 'chart exposes a readable Focus series label');
assertEqual(
  chart.data[0]?.[focusSeriesKey],
  focus.durationMs,
  'chart maps activity time to its series'
);
assertEqual(
  chart.data[1]?.[focusSeriesKey],
  0,
  'missing activity days remain blank in their series'
);

const composition = activityComposition([focus, reading]);
assertEqual(composition.length, 2, 'composition keeps duplicate-color activities distinct');
assertEqual(composition[1]?.label, 'Reading', 'composition carries textual identity');

const rankedActivities = rankedDurationItems(
  { activities: [focus, reading], folders: [] },
  'activities'
);
assertEqual(rankedActivities.length, 2, 'ranked activities are not silently capped');
assertEqual(
  rankedActivities[1]?.secondaryLabel,
  'Personal',
  'activity folder metadata is retained'
);

const rootFolder: HistoryFolderTotal = {
  key: 'root',
  folderId: null,
  folderName: null,
  durationMs: 40,
  percentage: 1,
  activityColors: ['#7C3AED'],
  activityIds: ['activity-focus'],
};
const rankedFolders = rankedDurationItems({ activities: [], folders: [rootFolder] }, 'folders');
assertEqual(rankedFolders[0]?.name, 'Root', 'root activity grouping uses the catalog vocabulary');
assertEqual(rankedFolders[0]?.color, null, 'folders do not receive synthetic colors');

const totalChart = buildTotalChartData([{ key: 'week-1', label: 'Mon', totalMs: 60 }]);
assertEqual(
  totalChart.series[0]?.color,
  null,
  'total charts use theme styling instead of activity identity'
);
assertEqual(
  totalChart.data[0]?.['tracked-time'],
  60,
  'total chart maps values to its shared series'
);

assertEqual(formatAnalyticsPercentage(0.004), '<1%', 'small shares remain discoverable');
assertEqual(
  comparePeriods(120, 0, 'last week')?.percentage,
  null,
  'zero comparisons omit misleading percentages'
);
assertEqual(
  comparePeriods(120, 0, 'last week')?.label,
  'More than last week',
  'zero comparisons stay understandable'
);
assertEqual(
  comparePeriods(60, 60, 'last week')?.label,
  'No change vs last week',
  'equal comparisons are explicit'
);

const goalEvaluation: TimeGoalEvaluation = {
  kind: 'adherence',
  adherence: {
    activityId: 'activity-focus',
    goal: { type: 'target', durationMs: 30 * 60 * 1000, period: 'day' },
    period,
    periods: [],
    completedPeriods: 2,
    eligiblePeriods: 3,
    totalPeriods: 7,
  },
};
assertEqual(
  goalEvaluationLabel(goalEvaluation, 'Focus'),
  'Focus target goal for each day',
  'goal labels identify activity, type, and cadence'
);

console.log(
  'Validated History analytics data transforms, snapshot identity, colors, comparisons, and goal labels.'
);
