/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
/* eslint-enable @typescript-eslint/no-require-imports */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = path.resolve(process.cwd());
const month = fs.readFileSync(path.join(root, 'src/history/MonthView.tsx'), 'utf8');

assert(
  month.includes('runtime: RoutineRuntime') &&
    month.includes('period: HistoryPeriod') &&
    month.includes('onDayPress?: (period: HistoryPeriod) => void'),
  'Month must accept the real runtime, selected period, and Day-mode callback'
);
assert(
  month.includes('loadHistoryPeriodData(runtime, period, nowMs)') &&
    month.includes('data.comparisonAggregation.totalMs') &&
    month.includes('data.days'),
  'Month must load current/comparison month data and shared logical-day totals'
);
assert(
  month.includes('averageDailyTrackedMs') &&
    month.includes('previousLabel="last month"') &&
    month.includes('<PeriodSummary'),
  'Month must show total, average, and previous-month comparison'
);
assert(
  month.includes('buildTotalChartData') &&
    month.includes('<HistoryChart') &&
    month.includes('variant="total"') &&
    month.includes('showDatumLabels') &&
    month.includes('onDatumPress={onDayPress ? handleDayPress : undefined}'),
  'Month must render a theme-neutral daily Victory chart with textual datum targets'
);
assert(
  month.includes('<BreakdownToggle') &&
    month.includes('rankedDurationItems(data.aggregation, breakdownMode)') &&
    month.includes('<RankedDurationList') &&
    !month.includes('.slice(0,'),
  'Month must expose Activities/Folders rankings without silently capping results'
);
assert(
  month.includes('data.goals.length > 0') &&
    month.includes('<GoalProgress') &&
    month.includes('activityColor={activity?.color}'),
  'Month must render direct or adherence goals only when goals exist'
);
assert(
  !month.includes('react-native-calendars') &&
    !month.includes('PieChart') &&
    !month.includes('Untracked'),
  'Month must remain a restrained analytics view without a permanent calendar or untracked rows'
);
assert(
  month.includes('period.endMs > Date.now()') &&
    month.includes('setInterval') &&
    month.includes('load(false)') &&
    month.includes('60_000'),
  'Current-month data must refresh so a running session remains current without one-second rerenders'
);

console.log(
  'Validated History Month loading, comparison summary, daily chart accessibility, breakdowns, goals, and restrained phone-first scope.'
);
