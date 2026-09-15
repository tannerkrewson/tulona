import { historyWeekPeriod } from '../src/domain';

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
/* eslint-enable @typescript-eslint/no-require-imports */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = path.resolve(process.cwd());
const week = fs.readFileSync(path.join(root, 'src/history/WeekView.tsx'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'src/history/history-period-data.ts'), 'utf8');

assert(
  week.includes('runtime: RoutineRuntime') &&
    week.includes('period: HistoryPeriod') &&
    week.includes('onDayPress: (logicalDay: LogicalDayKey) => void'),
  'WeekView must accept the real runtime, selected period, and logical-day callback'
);
assert(
  week.includes('loadHistoryPeriodData(runtime, period, nowMs)') &&
    week.includes('runtime.settings.logicalDayRolloverHour') &&
    week.includes('runtime.settings.weekStartsOn'),
  'WeekView must load real current and comparison data with configured time settings'
);
assert(
  loader.includes('comparisonHistoryPeriod(period, options)') &&
    loader.includes('trackerService.query(period, nowMs)') &&
    loader.includes('trackerService.query(comparisonPeriod, nowMs)') &&
    loader.includes('aggregateHistoryByDay(sessions, period, options, catalog)'),
  'the shared loader must provide the current/comparison week and per-day real aggregation'
);
assert(
  week.includes('LIVE_REFRESH_MS') &&
    week.includes("currentHistoryPeriod('week', nowMs") &&
    week.includes('loadHistoryPeriodData(runtime, period, nowMs)'),
  'the current week must refresh through now for a running session'
);
assert(
  week.includes('blankFutureWeekDays') &&
    week.includes('day.period.startMs >= nowMs') &&
    week.includes('totalMs: 0') &&
    week.includes('activities: []'),
  'future days in the current week must remain blank rather than becoming failures'
);
assert(
  week.includes('PeriodSummary') &&
    week.includes('averageMs={averageMs}') &&
    week.includes('previousTotalMs={data.comparisonAggregation.totalMs}') &&
    week.includes('previousLabel="last week"'),
  'WeekView must show total, average per day, and previous-week comparison'
);
assert(
  week.includes('buildActivityCompositionChartData(days)') &&
    week.includes('variant="stacked"') &&
    week.includes('showDatumLabels') &&
    week.includes('onDatumPress={onChartDayPress}') &&
    week.includes('onDayPress(point.key as LogicalDayKey)'),
  'WeekView must use the actual-color stacked chart with textual day targets'
);
assert(
  week.includes('rankedDurationItems(data.aggregation, breakdownMode)') &&
    week.includes('<BreakdownToggle') &&
    week.includes('<RankedDurationList') &&
    !week.includes('.slice('),
  'WeekView must use snapshot-aware Activities/Folders rankings without truncating them'
);
assert(
  week.includes('const WEEK_DAY_COUNT = 7') &&
    week.includes('Math.max(WEEK_DAY_COUNT, days.length)'),
  'WeekView must preserve all seven logical day positions for its average and chart'
);
assert(
  !week.includes('textTransform:') &&
    !week.includes('textTransform') &&
    !week.includes('All tracked time'),
  'WeekView must avoid all-caps styling and slop copy'
);

const mondayWeek = historyWeekPeriod(new Date(2026, 8, 16, 12), {
  rolloverHour: 4,
  weekStartsOn: 1,
});
assert(mondayWeek.startLogicalDay === '2026-09-14', 'week start must honor Monday preference');
assert(mondayWeek.endLogicalDay === '2026-09-20', 'week must contain exactly seven logical days');

const sundayWeek = historyWeekPeriod(new Date(2026, 8, 16, 12), {
  rolloverHour: 4,
  weekStartsOn: 0,
});
assert(sundayWeek.startLogicalDay === '2026-09-13', 'week start must honor Sunday preference');

console.log(
  'Validated History Week loader wiring, live/future handling, summary, chart, breakdown, and week-start semantics.'
);
