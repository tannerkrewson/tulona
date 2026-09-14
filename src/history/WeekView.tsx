import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from '@expo/ui';

import {
  currentHistoryPeriod,
  dateForLogicalDay,
  type HistoryDayTotal,
  type HistoryPeriod,
  type LogicalDayKey,
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
  buildActivityCompositionChartData,
  rankedDurationItems,
  type HistoryBreakdownMode,
  type HistoryChartPoint,
} from './analytics';
import { loadHistoryPeriodData, type HistoryPeriodData } from './history-period-data';

const WEEK_DAY_COUNT = 7;
const LIVE_REFRESH_MS = 60_000;

export interface WeekViewProps {
  runtime: RoutineRuntime;
  period: HistoryPeriod;
  onDayPress: (logicalDay: LogicalDayKey) => void;
  testID?: string;
}

interface WeekLoadState {
  data: HistoryPeriodData | null;
  error: string | null;
  loading: boolean;
}

/** Keeps future days empty even if a caller supplies stale or synthetic totals. */
export function blankFutureWeekDays(
  days: readonly HistoryDayTotal[],
  nowMs: number
): HistoryDayTotal[] {
  if (!Number.isFinite(nowMs)) return [...days];

  return days.map((day) =>
    day.period.startMs >= nowMs ? { ...day, totalMs: 0, activities: [], folders: [] } : day
  );
}

export function formatWeekDayLabel(day: HistoryDayTotal, rolloverHour = 0): string {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    weekday: 'short',
  }).format(dateForLogicalDay(day.logicalDay, rolloverHour));
}

export function averageTrackedTimePerDay(totalMs: number, dayCount = WEEK_DAY_COUNT): number {
  if (!Number.isFinite(totalMs) || totalMs < 0 || !Number.isFinite(dayCount) || dayCount <= 0) {
    return 0;
  }
  return totalMs / dayCount;
}

function useLiveWeekNow(period: HistoryPeriod, rolloverHour: number, weekStartsOn: number): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const current = currentHistoryPeriod('week', nowMs, { rolloverHour, weekStartsOn });
  const isCurrentWeek = current.key === period.key;

  useEffect(() => {
    if (!isCurrentWeek) return undefined;

    const update = () => setNowMs(Date.now());
    update();
    const timer = setInterval(update, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [isCurrentWeek]);

  return nowMs;
}

function SectionHeading({ title }: { title: string }) {
  const { colors } = useAppTheme();
  return <Text textStyle={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{title}</Text>;
}

function WeekLoadingState({ testID }: { testID: string }) {
  const { colors } = useAppTheme();
  return (
    <View
      accessibilityLabel="Loading week history"
      style={[styles.state, getRowSurfaceStyle({ backgroundColor: colors.surface })]}
      testID={`${testID}-loading`}
    >
      <ActivityIndicator color={colors.primary} size="small" />
      <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>Loading week history…</Text>
    </View>
  );
}

function WeekErrorState({
  message,
  onRetry,
  testID,
}: {
  message: string;
  onRetry: () => void;
  testID: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View
      accessibilityLabel={`Week history unavailable. ${message}`}
      style={[styles.state, getRowSurfaceStyle({ backgroundColor: colors.danger.background })]}
      testID={`${testID}-error`}
    >
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 17, fontWeight: '700' }}>
        Week history unavailable
      </Text>
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{message}</Text>
      <View style={styles.retryWrap}>
        <AppButton
          label="Try again"
          onPress={onRetry}
          testID={`${testID}-retry`}
          variant="outlined"
        />
      </View>
    </View>
  );
}

function goalColor(data: HistoryPeriodData, activityId: string): string | null {
  const activity = data.catalog.activities.find((candidate) => candidate.id === activityId);
  if (activity?.color) return activity.color;
  return (
    data.aggregation.activities.find((candidate) => candidate.id === activityId)?.color ?? null
  );
}

function WeekContent({
  data,
  days,
  rolloverHour,
  breakdownMode,
  onBreakdownModeChange,
  onChartDayPress,
  testID,
}: {
  data: HistoryPeriodData;
  days: readonly HistoryDayTotal[];
  rolloverHour: number;
  breakdownMode: HistoryBreakdownMode;
  onBreakdownModeChange: (mode: HistoryBreakdownMode) => void;
  onChartDayPress: (point: HistoryChartPoint) => void;
  testID: string;
}) {
  const chartData = useMemo(() => {
    const composition = buildActivityCompositionChartData(days);
    return {
      ...composition,
      data: composition.data.map((point, index) => ({
        ...point,
        label: days[index] ? formatWeekDayLabel(days[index], rolloverHour) : point.label,
      })),
    };
  }, [days, rolloverHour]);
  const breakdownItems = useMemo(
    () => rankedDurationItems(data.aggregation, breakdownMode),
    [breakdownMode, data.aggregation]
  );
  const dayCount = Math.max(WEEK_DAY_COUNT, days.length);
  const averageMs = averageTrackedTimePerDay(data.aggregation.totalMs, dayCount);

  return (
    <View style={styles.content} testID={testID}>
      <PeriodSummary
        averageMs={averageMs}
        previousLabel="last week"
        previousTotalMs={data.comparisonAggregation.totalMs}
        testID={`${testID}-summary`}
        totalMs={data.aggregation.totalMs}
      />

      <View style={styles.section} testID={`${testID}-days`}>
        <HistoryChart
          caption="Select a day to open its timeline."
          data={chartData.data}
          onDatumPress={onChartDayPress}
          series={chartData.series}
          showDatumLabels
          testID={`${testID}-chart`}
          title="Time by day"
          variant="stacked"
        />
      </View>

      <View style={styles.section} testID={`${testID}-breakdown`}>
        <SectionHeading title="Breakdown" />
        <BreakdownToggle
          onChange={onBreakdownModeChange}
          testID={`${testID}-breakdown-toggle`}
          value={breakdownMode}
        />
        <RankedDurationList items={breakdownItems} testID={`${testID}-breakdown-list`} />
      </View>

      {data.goals.length > 0 ? (
        <View style={styles.section} testID={`${testID}-goals`}>
          <SectionHeading title="Goals" />
          <View style={styles.goalList}>
            {data.goals.map((goal) => (
              <GoalProgress
                activityColor={goalColor(data, goal.activityId)}
                activityName={goal.activityName}
                evaluation={goal.evaluation}
                key={goal.activityId}
                testID={`${testID}-goal-${goal.activityId}`}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Phone-first Week analytics backed by the shared, snapshot-aware History loader. */
export function WeekView({ runtime, period, onDayPress, testID = 'history-week' }: WeekViewProps) {
  const rolloverHour = runtime.settings.logicalDayRolloverHour;
  const weekStartsOn = runtime.settings.weekStartsOn;
  const nowMs = useLiveWeekNow(period, rolloverHour, weekStartsOn);
  const [breakdownMode, setBreakdownMode] = useState<HistoryBreakdownMode>('activities');
  const [loadState, setLoadState] = useState<WeekLoadState>({
    data: null,
    error: null,
    loading: true,
  });
  const requestRef = useRef(0);

  const load = useCallback(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoadState((previous) => ({ ...previous, error: null, loading: true }));
    void loadHistoryPeriodData(runtime, period, nowMs)
      .then((data) => {
        if (requestRef.current !== requestId) return;
        setLoadState({ data, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (requestRef.current !== requestId) return;
        setLoadState((previous) => ({ ...previous, error: errorText(error), loading: false }));
      });
  }, [nowMs, period, runtime]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => {
      clearTimeout(timer);
      requestRef.current += 1;
    };
  }, [load]);

  const data = loadState.data?.period.key === period.key ? loadState.data : null;
  const days = useMemo(() => (data ? blankFutureWeekDays(data.days, nowMs) : []), [data, nowMs]);
  const onChartDayPress = useCallback(
    (point: HistoryChartPoint) => {
      if (days.some((day) => day.logicalDay === point.key)) {
        onDayPress(point.key as LogicalDayKey);
      }
    },
    [days, onDayPress]
  );

  if (!data) {
    if (loadState.error) {
      return <WeekErrorState message={loadState.error} onRetry={load} testID={testID} />;
    }
    return <WeekLoadingState testID={testID} />;
  }

  return (
    <WeekContent
      breakdownMode={breakdownMode}
      data={data}
      days={days}
      onBreakdownModeChange={setBreakdownMode}
      onChartDayPress={onChartDayPress}
      rolloverHour={rolloverHour}
      testID={testID}
    />
  );
}

export default WeekView;

const styles = StyleSheet.create({
  content: {
    gap: 18,
    width: '100%',
  },
  goalList: {
    gap: 8,
    width: '100%',
  },
  retryWrap: {
    alignSelf: 'flex-start',
  },
  section: {
    gap: 10,
    width: '100%',
  },
  state: {
    alignItems: 'flex-start',
    gap: 10,
    padding: 16,
    width: '100%',
  },
});
