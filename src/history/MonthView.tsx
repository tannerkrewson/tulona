import { Text } from '@expo/ui';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { HistoryDayTotal, HistoryPeriod } from '@domain';
import { useAppTheme } from '@theme';
import { AppButton } from '@ui';

import type { RoutineRuntime } from '../routine/routine-runtime';
import {
  BreakdownToggle,
  GoalProgress,
  HistoryChart,
  PeriodSummary,
  RankedDurationList,
  buildTotalChartData,
  rankedDurationItems,
  type HistoryBreakdownMode,
  type HistoryChartData,
  type HistoryChartPoint,
} from './analytics';
import { loadHistoryPeriodData, type HistoryPeriodData } from './history-period-data';

export interface MonthViewProps {
  /** The hydrated application runtime, not a History-specific data source. */
  runtime: RoutineRuntime;
  /** The selected calendar month from the shared History period model. */
  period: HistoryPeriod;
  /** Opens the existing Day mode for the exact logical day represented by a bar. */
  onDayPress?: (period: HistoryPeriod) => void;
  /** Optional deterministic clock for tests and callers that already own a clock. */
  nowMs?: number;
  testID?: string;
}

type MonthLoadState =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: HistoryPeriodData; error: null }
  | { status: 'error'; data: null; error: string };

function formatDayLabel(day: HistoryDayTotal): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
    new Date(day.period.startMs)
  );
}

/** Keeps the chart model small and leaves month aggregation in the shared loader/domain layer. */
export function buildMonthChartData(days: readonly HistoryDayTotal[]): HistoryChartData {
  return buildTotalChartData(
    days.map((day) => ({ key: day.logicalDay, label: formatDayLabel(day), totalMs: day.totalMs }))
  );
}

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function averageDailyTrackedMs(data: HistoryPeriodData, nowMs: number): number {
  const eligibleDays = data.days.filter((day) => day.period.startMs <= nowMs).length;
  return eligibleDays > 0 ? data.aggregation.totalMs / eligibleDays : 0;
}

function MonthLoadPanel({
  state,
  onRetry,
  testID,
}: {
  state: MonthLoadState;
  onRetry: () => void;
  testID: string;
}) {
  const { colors } = useAppTheme();

  if (state.status === 'loading') {
    return (
      <View
        accessibilityLabel="Loading month history"
        style={[styles.statePanel, { backgroundColor: colors.surface, borderColor: colors.border }]}
        testID={`${testID}-loading`}
      >
        <ActivityIndicator color={colors.primary} size="small" />
        <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>Loading month history…</Text>
      </View>
    );
  }

  if (state.status === 'ready') return null;

  return (
    <View
      accessibilityLabel="Month history unavailable"
      style={[styles.statePanel, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID={`${testID}-error`}
    >
      <Text textStyle={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>
        Month history unavailable
      </Text>
      <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>{state.error}</Text>
      <View style={styles.retryButtonWrap}>
        <AppButton
          label="Try again"
          onPress={onRetry}
          style={{ height: 44, width: 112 }}
          testID={`${testID}-retry`}
          variant="outlined"
        />
      </View>
    </View>
  );
}

function monthDayForPoint(
  daysByKey: ReadonlyMap<string, HistoryDayTotal>,
  point: HistoryChartPoint
): HistoryPeriod | null {
  return daysByKey.get(point.key)?.period ?? null;
}

/**
 * Phone-first monthly History analytics. All period/session semantics come
 * from loadHistoryPeriodData so Month cannot drift from Day, Week, or Year.
 */
export default function MonthView({
  runtime,
  period,
  onDayPress,
  nowMs,
  testID = 'history-month',
}: MonthViewProps) {
  const { colors } = useAppTheme();
  const [breakdownMode, setBreakdownMode] = useState<HistoryBreakdownMode>('activities');
  const [state, setState] = useState<MonthLoadState>({
    status: 'loading',
    data: null,
    error: null,
  });
  const requestId = useRef(0);
  const [clockMs, setClockMs] = useState(() => Date.now());

  const load = useCallback(
    (showLoading: boolean) => {
      const nextRequestId = requestId.current + 1;
      requestId.current = nextRequestId;

      if (period.kind !== 'month') {
        setState({
          status: 'error',
          data: null,
          error: 'Month view requires a month History period.',
        });
        return;
      }

      if (showLoading) setState({ status: 'loading', data: null, error: null });
      void loadHistoryPeriodData(runtime, period, nowMs)
        .then((data) => {
          if (requestId.current === nextRequestId) setState({ status: 'ready', data, error: null });
        })
        .catch((error: unknown) => {
          if (requestId.current !== nextRequestId) return;
          setState({ status: 'error', data: null, error: readableError(error) });
        });
    },
    [nowMs, period, runtime]
  );

  useFocusEffect(
    useCallback(() => {
      load(true);
      const refreshWhileCurrent = nowMs === undefined && period.endMs > Date.now();
      const timer = refreshWhileCurrent
        ? setInterval(() => {
            setClockMs(Date.now());
            load(false);
          }, 60_000)
        : null;
      return () => {
        if (timer) clearInterval(timer);
        requestId.current += 1;
      };
    }, [load, nowMs, period.endMs])
  );

  const data = state.status === 'ready' ? state.data : null;
  const effectiveNowMs = nowMs ?? clockMs;
  const chartData = useMemo(() => (data ? buildMonthChartData(data.days) : null), [data]);
  const rankedItems = useMemo(
    () => (data ? rankedDurationItems(data.aggregation, breakdownMode) : []),
    [breakdownMode, data]
  );
  const daysByKey = useMemo(
    () => new Map(data?.days.map((day) => [day.logicalDay, day]) ?? []),
    [data]
  );
  const handleDayPress = useCallback(
    (point: HistoryChartPoint) => {
      const dayPeriod = monthDayForPoint(daysByKey, point);
      if (dayPeriod) onDayPress?.(dayPeriod);
    },
    [daysByKey, onDayPress]
  );

  if (!data || !chartData) {
    return <MonthLoadPanel onRetry={() => load(true)} state={state} testID={testID} />;
  }

  return (
    <View style={styles.container} testID={testID}>
      <PeriodSummary
        averageMs={averageDailyTrackedMs(data, effectiveNowMs)}
        previousLabel="last month"
        previousTotalMs={data.comparisonAggregation.totalMs}
        testID={`${testID}-summary`}
        totalMs={data.aggregation.totalMs}
      />

      <HistoryChart
        caption="Each bar represents one logical day."
        data={chartData.data}
        height={190}
        onDatumPress={onDayPress ? handleDayPress : undefined}
        series={chartData.series}
        showDatumLabels
        testID={`${testID}-chart`}
        title="Daily tracked time"
        variant="total"
      />

      <View style={styles.section} testID={`${testID}-breakdown`}>
        <Text textStyle={{ color: colors.text, fontSize: 19, fontWeight: '700' }}>Breakdown</Text>
        <BreakdownToggle
          onChange={setBreakdownMode}
          testID={`${testID}-breakdown-toggle`}
          value={breakdownMode}
        />
        <RankedDurationList items={rankedItems} testID={`${testID}-ranked`} />
      </View>

      {data.goals.length > 0 ? (
        <View style={styles.section} testID={`${testID}-goals`}>
          <Text textStyle={{ color: colors.text, fontSize: 19, fontWeight: '700' }}>Goals</Text>
          <View style={styles.goalList}>
            {data.goals.map((goal) => {
              const activity = data.catalog.activities.find(
                (candidate) => candidate.id === goal.activityId
              );
              return (
                <GoalProgress
                  activityColor={activity?.color}
                  activityName={goal.activityName}
                  evaluation={goal.evaluation}
                  key={goal.activityId}
                  testID={`${testID}-goal-${goal.activityId}`}
                />
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    width: '100%',
  },
  goalList: {
    gap: 10,
    width: '100%',
  },
  section: {
    gap: 12,
    width: '100%',
  },
  statePanel: {
    alignItems: 'flex-start',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
    padding: 16,
    width: '100%',
  },
  retryButtonWrap: {
    alignSelf: 'flex-start',
  },
});
