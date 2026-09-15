import {
  aggregateHistory,
  createHistoricalActivitySnapshot,
  historyMonthPeriod,
  historyYearPeriod,
  type CatalogCollection,
  type HistorySession,
} from '../src/domain';

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
/* eslint-enable @typescript-eslint/no-require-imports */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const root = path.resolve(process.cwd());
const yearView = fs.readFileSync(path.join(root, 'src/history/YearView.tsx'), 'utf8');

assert(
  yearView.includes('runtime: RoutineRuntime') &&
    yearView.includes('period: HistoryPeriod') &&
    yearView.includes('onMonthPress: (period: HistoryPeriod) => void'),
  'YearView must accept the real runtime, selected period, and Month navigation callback'
);
assert(
  yearView.includes('loadHistoryPeriodData(runtime, period, nowMs)') &&
    yearView.includes('comparisonAggregation.totalMs'),
  'YearView must load current and comparison year data through the shared period-data loader'
);
assert(
  yearView.includes('historyMonthPeriod') &&
    yearView.includes('Array.from({ length: 12 }') &&
    yearView.includes('aggregateHistory(data.sessions, month, data.catalog)'),
  'YearView must derive twelve calendar-month totals with configured rollover and real sessions'
);
assert(
  yearView.includes('variant="total"') &&
    yearView.includes('buildTotalChartData') &&
    yearView.includes('onDatumPress={onDatumPress}') &&
    yearView.includes('onMonthPress(month.period)'),
  'YearView must use the shared total chart and make every month an accessible Month target'
);
assert(
  yearView.includes('PeriodSummary') &&
    yearView.includes('Average per month') &&
    yearView.includes('RankedDurationList') &&
    yearView.includes('BreakdownToggle'),
  'YearView must keep annual summary and Activities/Folders breakdown compact and shared'
);
assert(
  yearView.includes('currentHistoryPeriod') &&
    yearView.includes('setInterval(() => setNowMs(Date.now()), 60_000)'),
  'YearView must refresh a current running year without replacing the persisted session'
);

const rolloverOptions = { rolloverHour: 4, weekStartsOn: 1 };
const year = historyYearPeriod('2026', rolloverOptions);
const months = Array.from({ length: 12 }, (_, index) =>
  historyMonthPeriod(`2026-${String(index + 1).padStart(2, '0')}`, rolloverOptions)
);
assertEqual(months.length, 12, 'a year must expose all twelve calendar months');
assertEqual(
  new Date(months[0]!.startMs).getHours(),
  4,
  'month boundaries must retain the configured logical-day rollover'
);
assertEqual(
  months[0]!.endMs,
  months[1]!.startMs,
  'adjacent month periods must share a calendar-safe boundary'
);
assertEqual(
  months[11]!.endMs,
  year.endMs,
  'the December period must end at the selected year boundary'
);

const activityId = '11111111-1111-4111-8111-111111111111';
const snapshot = createHistoricalActivitySnapshot(
  {
    id: activityId,
    kind: 'activity',
    name: 'Archived focus name',
    color: '#123456',
    iconName: null,
    folderId: null,
  },
  null
);
const session: HistorySession = {
  activityId,
  activitySnapshot: snapshot,
  endMs: months[0]!.startMs + 90 * 60 * 1000,
  isRunning: false,
  startMs: months[0]!.startMs + 30 * 60 * 1000,
  transitionId: '22222222-2222-4222-8222-222222222222',
};
const currentCatalog: CatalogCollection = {
  activities: [
    {
      archivedAt: null,
      color: '#abcdef',
      createdAt: '2026-01-01T00:00:00.000Z',
      folderId: null,
      iconName: null,
      id: activityId,
      kind: 'activity',
      name: 'Current focus name',
      sortOrder: 0,
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  folders: [],
  routines: [],
};
const aggregation = aggregateHistory([session], year, currentCatalog);
assertEqual(
  aggregation.activities[0]?.name,
  'Archived focus name',
  'annual aggregation must use historical activity names rather than current catalog names'
);
assertEqual(
  aggregation.activities[0]?.color,
  '#123456',
  'annual aggregation must use historical activity colors rather than current catalog colors'
);
assertEqual(
  aggregation.totalMs,
  60 * 60 * 1000,
  'annual aggregation must preserve session duration'
);

console.log(
  'Validated History Year props, calendar-month chart navigation, running refresh, and snapshot-aware aggregation.'
);
