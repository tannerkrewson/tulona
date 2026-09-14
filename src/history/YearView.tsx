import { Text } from '@expo/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import {
  aggregateHistory,
  currentHistoryPeriod,
  historyMonthPeriod,
  type CatalogCollection,
  type HistoryPeriod,
  type HistoryPeriodOptions,
  type MonthKey,
} from '@domain';
import { useAppTheme } from '@theme';
import { AppButton, errorText, getRowSurfaceStyle } from '@ui';

import type { RoutineRuntime } from '../routine/routine-runtime';
import {
  BreakdownToggle,
  GoalProgress,
  HistoryChart,
  PeriodSummary,
  RankedDurationList,
} from './analytics';
import {
  buildTotalChartData,
  formatAnalyticsDuration,
  rankedDurationItems,
  type HistoryChartPoint,
  type HistoryBreakdownMode,
} from './analytics/analytics-data';
import { loadHistoryPeriodData, type HistoryPeriodData } from './history-period-data';

export interface YearViewProps {
  /** The selected calendar year from the shared History period state. */
  period: HistoryPeriod;
  /** The live application runtime used to query tracker and catalog data. */
  runtime: RoutineRuntime;
  /** Switches the parent History screen to Month mode for the selected month. */
  onMonthPress: (period: HistoryPeriod) => void;
  testID?: string;
}

export interface HistoryYearMonthTotal {
  period: HistoryPeriod;
  label: string;
  totalMs: number;
}

function monthLabel(period: HistoryPeriod): string {
  return new Intl.DateTimeFormat(undefined, { month: 'long' }).format(new Date(period.startMs));
}

/** Builds the twelve calendar months without assuming that a logical day starts at midnight. */
export function historyYearMonthPeriods(
  period: HistoryPeriod,
  options: HistoryPeriodOptions = {}
): HistoryPeriod[] {
  if (period.kind !== 'year' || !/^\d{4}$/.test(period.key)) {
    throw new RangeError('Year view requires a valid year period');
  }

  return Array.from({ length: 12 }, (_, index) =>
    historyMonthPeriod(`${period.key}-${String(index + 1).padStart(2, '0')}` as MonthKey, options)
  );
}

/** Aggregates each month from the already-loaded snapshot-aware year sessions. */
export function buildHistoryYearMonthTotals(
  data: Pick<HistoryPeriodData, 'catalog' | 'sessions'>,
  period: HistoryPeriod,
  options: HistoryPeriodOptions = {}
): HistoryYearMonthTotal[] {
  return historyYearMonthPeriods(period, options).map((month) => ({
    period: month,
    label: monthLabel(month),
    totalMs: aggregateHistory(data.sessions, month, data.catalog).totalMs,
  }));
}

/**
 * Current-year averages exclude calendar months that have not started yet;
 * completed years naturally average across all twelve months.
 */
export function historyYearAverageMonthCount(
  period: HistoryPeriod,
  months: readonly HistoryYearMonthTotal[],
  nowMs: number,
  options: HistoryPeriodOptions = {}
): number {
  if (months.length === 0) return 1;
  const current = currentHistoryPeriod('year', nowMs, options).key === period.key;
  if (!current) return months.length;
  return Math.max(1, months.filter((month) => month.period.startMs <= nowMs).length);
}

interface QueryState {
  status: 'loading' | 'ready' | 'error';
  data: HistoryPeriodData | null;
  error: string | null;
  requestKey: string;
}

function useYearData(
  runtime: RoutineRuntime,
  period: HistoryPeriod
): QueryState & { nowMs: number; retry: () => void } {
  const [reloadToken, setReloadToken] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [state, setState] = useState<QueryState>({
    status: 'loading',
    data: null,
    error: null,
    requestKey: '',
  });
  const options = useMemo<HistoryPeriodOptions>(
    () => ({
      rolloverHour: runtime.settings.logicalDayRolloverHour,
      weekStartsOn: runtime.settings.weekStartsOn,
    }),
    [runtime.settings.logicalDayRolloverHour, runtime.settings.weekStartsOn]
  );
  const isCurrentYear =
    period.kind === 'year' && currentHistoryPeriod('year', nowMs, options).key === period.key;
  const requestKey = `${period.kind}:${period.key}:${period.startMs}:${period.endMs}:${nowMs}:${reloadToken}`;

  useEffect(() => {
    if (!isCurrentYear) return undefined;
    const timer = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [isCurrentYear]);

  useEffect(() => {
    let cancelled = false;
    if (period.kind !== 'year') {
      return () => {
        cancelled = true;
      };
    }

    void loadHistoryPeriodData(runtime, period, nowMs)
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data, error: null, requestKey });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ status: 'error', data: null, error: errorText(error), requestKey });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [nowMs, period, requestKey, runtime]);

  const retry = useCallback(() => setReloadToken((value) => value + 1), []);
  const visibleState: QueryState =
    period.kind !== 'year'
      ? {
          status: 'error',
          data: null,
          error: 'Year view requires a year period.',
          requestKey,
        }
      : state.requestKey === requestKey
        ? state
        : { status: 'loading', data: null, error: null, requestKey };

  return { ...visibleState, nowMs, retry };
}

function StatePanel({
  error,
  onRetry,
  testID,
}: {
  error: string | null;
  onRetry: () => void;
  testID: string;
}) {
  const { colors } = useAppTheme();
  const isError = error !== null;
  return (
    <View
      style={{
        ...getRowSurfaceStyle({ backgroundColor: colors.surface }),
        alignItems: isError ? 'flex-start' : 'center',
        gap: 10,
        padding: 20,
        width: '100%',
      }}
      testID={testID}
    >
      {isError ? null : <ActivityIndicator color={colors.primary} size="small" />}
      <Text
        textStyle={{
          color: isError ? colors.danger.foreground : colors.textMuted,
          fontSize: 15,
          fontWeight: isError ? '600' : '400',
        }}
      >
        {error ?? 'Loading year…'}
      </Text>
      {isError ? (
        <AppButton
          label="Try again"
          onPress={onRetry}
          style={{ height: 44 }}
          testID={`${testID}-retry`}
          variant="outlined"
        />
      ) : null}
    </View>
  );
}

function activityColorForGoal(
  catalog: CatalogCollection,
  activityId: string,
  fallbackActivities: HistoryPeriodData['aggregation']['activities']
): string | null {
  return (
    catalog.activities.find((activity) => activity.id === activityId)?.color ??
    fallbackActivities.find((activity) => activity.id === activityId)?.color ??
    null
  );
}

function YearSummary({
  averageMs,
  averageMonthCount,
  data,
  period,
}: {
  averageMs: number;
  averageMonthCount: number;
  data: HistoryPeriodData;
  period: HistoryPeriod;
}) {
  const { colors } = useAppTheme();
  const averageLabel = `Average ${formatAnalyticsDuration(averageMs)} per month`;
  return (
    <View style={styles.summaryGroup} testID="history-year-summary">
      <PeriodSummary
        periodLabel={period.key}
        previousLabel="last year"
        previousTotalMs={data.comparisonAggregation.totalMs}
        testID="history-year-period-summary"
        totalMs={data.aggregation.totalMs}
      />
      <View
        accessible
        accessibilityLabel={`${averageLabel}${averageMonthCount < 12 ? ` across ${averageMonthCount} started months` : ''}`}
        style={[styles.averageRow, { backgroundColor: colors.surfaceMuted }]}
        testID="history-year-average"
      >
        <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>Average per month</Text>
        <Text textStyle={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>
          {formatAnalyticsDuration(averageMs)}
        </Text>
      </View>
    </View>
  );
}

function YearMonthChart({
  months,
  onMonthPress,
  period,
}: {
  months: readonly HistoryYearMonthTotal[];
  onMonthPress: (period: HistoryPeriod) => void;
  period: HistoryPeriod;
}) {
  const monthByKey = useMemo(
    () => new Map(months.map((month) => [month.period.key, month])),
    [months]
  );
  const onDatumPress = useCallback(
    (point: HistoryChartPoint) => {
      const month = monthByKey.get(point.key);
      if (month) onMonthPress(month.period);
    },
    [monthByKey, onMonthPress]
  );
  const chartData = useMemo(
    () =>
      buildTotalChartData(
        months.map(({ period: month, label, totalMs }) => ({ key: month.key, label, totalMs }))
      ),
    [months]
  );

  return (
    <HistoryChart
      data={chartData.data}
      height={190}
      onDatumPress={onDatumPress}
      series={chartData.series}
      testID="history-year-month-chart"
      title={`Tracked time by month in ${period.key}`}
      variant="total"
    />
  );
}

export default function YearView({ period, runtime, onMonthPress, testID }: YearViewProps) {
  const { colors } = useAppTheme();
  const [breakdownMode, setBreakdownMode] = useState<HistoryBreakdownMode>('activities');
  const { endLogicalDay, endMs, key, kind, startLogicalDay, startMs } = period;
  const selectedPeriod = useMemo<HistoryPeriod>(
    () => ({ kind, key, startMs, endMs, startLogicalDay, endLogicalDay }),
    [endLogicalDay, endMs, key, kind, startLogicalDay, startMs]
  );
  const state = useYearData(runtime, selectedPeriod);
  const options = useMemo<HistoryPeriodOptions>(
    () => ({
      rolloverHour: runtime.settings.logicalDayRolloverHour,
      weekStartsOn: runtime.settings.weekStartsOn,
    }),
    [runtime.settings.logicalDayRolloverHour, runtime.settings.weekStartsOn]
  );
  const months = useMemo(
    () => (state.data ? buildHistoryYearMonthTotals(state.data, selectedPeriod, options) : []),
    [options, selectedPeriod, state.data]
  );
  const monthCount = historyYearAverageMonthCount(selectedPeriod, months, state.nowMs, options);
  const rankedItems = useMemo(
    () => (state.data ? rankedDurationItems(state.data.aggregation, breakdownMode) : []),
    [breakdownMode, state.data]
  );

  if (state.status !== 'ready' || !state.data) {
    return (
      <StatePanel
        error={state.status === 'error' ? state.error : null}
        onRetry={state.retry}
        testID={state.status === 'error' ? 'history-year-error' : 'history-year-loading'}
      />
    );
  }

  const data = state.data;
  const averageMs = data.aggregation.totalMs / monthCount;
  const viewTestID = testID ?? 'history-year-view';

  return (
    <View style={styles.root} testID={viewTestID}>
      <YearSummary
        averageMonthCount={monthCount}
        averageMs={averageMs}
        data={data}
        period={selectedPeriod}
      />

      <YearMonthChart months={months} onMonthPress={onMonthPress} period={selectedPeriod} />

      <View style={styles.section} testID="history-year-breakdown">
        <Text textStyle={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>Breakdown</Text>
        <BreakdownToggle
          onChange={setBreakdownMode}
          testID="history-year-breakdown-toggle"
          value={breakdownMode}
        />
        <RankedDurationList items={rankedItems} testID="history-year-breakdown-list" />
      </View>

      {data.goals.length > 0 ? (
        <View style={styles.section} testID="history-year-goals">
          <Text textStyle={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>Goals</Text>
          <View style={styles.goalList}>
            {data.goals.map((goal) => (
              <GoalProgress
                activityColor={activityColorForGoal(
                  data.catalog,
                  goal.activityId,
                  data.aggregation.activities
                )}
                activityName={goal.activityName}
                evaluation={goal.evaluation}
                key={goal.activityId}
                testID={`history-year-goal-${goal.activityId}`}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 18,
    width: '100%',
  },
  summaryGroup: {
    gap: 8,
    width: '100%',
  },
  averageRow: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 14,
    width: '100%',
  },
  section: {
    gap: 12,
    width: '100%',
  },
  sectionTitle: {
    marginBottom: 0,
  },
  goalList: {
    gap: 10,
    width: '100%',
  },
});
