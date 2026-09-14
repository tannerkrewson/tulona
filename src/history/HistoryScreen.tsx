import { Column, Text } from '@expo/ui';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import {
  currentHistoryPeriod,
  dateForLogicalDay,
  formatHistoryPeriodTitle,
  historyPeriodForDate,
  logicalDayKey,
  nextHistoryPeriod,
  shiftLogicalDay,
  shiftHistoryPeriod as shiftDomainHistoryPeriod,
  weekBounds,
  type HistoryPeriod,
  type HistoryPeriodKind,
  type LogicalDayKey,
} from '@domain';
import { useAppTheme } from '@theme';
import { AppButton, AppScreen, EmptyState, errorText, getRowSurfaceStyle, IconButton } from '@ui';

import { loadRoutineRuntime, type RoutineRuntime } from '../routine/routine-runtime';
import DayTimeline from './DayTimeline';

export type HistoryRange = HistoryPeriodKind;
export type HistoryContentState = 'loading' | 'empty' | 'error';

export interface HistoryScreenProps {
  /** Allows a parent or a regression harness to replace the loaded state. */
  contentState?: HistoryContentState;
  errorMessage?: string;
  onRetry?: () => void;
  /** T9 wires the period label to the date-jump sheet. */
  onPeriodLabelPress?: () => void;
}

const RANGE_OPTIONS: readonly { label: string; value: HistoryRange }[] = [
  { label: 'Day', value: 'day' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
  { label: 'Year', value: 'year' },
];

function dayLabel(anchor: LogicalDayKey, today: LogicalDayKey): string {
  if (anchor === today) return 'Today';
  if (anchor === shiftLogicalDay(today, -1)) return 'Yesterday';
  return dateForLogicalDay(anchor).toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  });
}

export function formatHistoryPeriodLabel(
  range: HistoryRange,
  anchor: LogicalDayKey,
  today: LogicalDayKey
): string {
  if (range === 'day') return dayLabel(anchor, today);
  if (range === 'week') {
    const bounds = weekBounds(anchor);
    const start = new Date(bounds.start.startMs);
    const end = new Date(bounds.end.startMs);
    return `${start.toLocaleDateString([], { month: 'short', day: 'numeric' })}–${end.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  }
  return formatHistoryPeriodTitle(historyPeriodForDate(range, anchor));
}

export function shiftHistoryPeriod(
  anchor: LogicalDayKey,
  range: HistoryRange,
  amount: -1 | 1
): LogicalDayKey {
  return shiftDomainHistoryPeriod(historyPeriodForDate(range, anchor), amount).startLogicalDay;
}

function HistoryRangeSelector({
  value,
  onChange,
}: {
  value: HistoryRange;
  onChange: (value: HistoryRange) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View
      accessibilityLabel="History range"
      style={[styles.rangeSelector, { backgroundColor: colors.surfaceMuted }]}
      testID="history-range-selector"
    >
      {RANGE_OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityLabel={`${option.label} history view`}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.rangeOption,
              { backgroundColor: selected ? colors.primary : 'transparent' },
              pressed ? styles.pressed : null,
            ]}
            testID={`history-range-${option.value}`}
          >
            <Text
              textStyle={{
                color: selected ? colors.onPrimary : colors.textMuted,
                fontSize: 13,
                fontWeight: '700',
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function HistoryPeriodNavigation({
  period,
  options,
  nowMs,
  onChange,
  onToday,
  onPeriodLabelPress,
}: {
  period: HistoryPeriod;
  options: { rolloverHour?: number; weekStartsOn?: number };
  nowMs: number;
  onChange: (amount: -1 | 1) => void;
  onToday: () => void;
  onPeriodLabelPress?: () => void;
}) {
  const { colors } = useAppTheme();
  const current = currentHistoryPeriod(period.kind, nowMs, options).key === period.key;
  const nextDisabled = nextHistoryPeriod(period, options, nowMs) === null;
  const label = formatHistoryPeriodTitle(period, nowMs, options);

  return (
    <Column spacing={10} style={{ width: '100%' }}>
      <View style={styles.periodNavigation} testID="history-period-navigation">
        <IconButton
          accessibilityHint="Shows the previous history period"
          disabled={false}
          icon="chevron-left"
          label={`Previous ${period.kind}`}
          onPress={() => onChange(-1)}
          testID="history-previous"
          variant="muted"
        />
        <Pressable
          accessibilityHint={onPeriodLabelPress ? 'Opens date navigation' : undefined}
          accessibilityLabel={label}
          accessibilityRole={onPeriodLabelPress ? 'button' : undefined}
          disabled={!onPeriodLabelPress}
          onPress={onPeriodLabelPress}
          style={({ pressed }) => [styles.periodLabel, pressed ? styles.pressed : null]}
          testID="history-period-label"
        >
          <Text
            numberOfLines={1}
            textStyle={{ color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' }}
          >
            {label}
          </Text>
        </Pressable>
        <IconButton
          accessibilityHint={
            nextDisabled
              ? 'The current period cannot move into the future'
              : 'Shows the next history period'
          }
          disabled={nextDisabled}
          icon="chevron-right"
          label={`Next ${period.kind}`}
          onPress={() => onChange(1)}
          testID="history-next"
          variant="muted"
        />
      </View>
      {!current ? (
        <View style={styles.todayButtonWrap}>
          <AppButton
            label="Today"
            onPress={onToday}
            style={{ height: 40, width: 92 }}
            testID="history-today"
            variant="outlined"
          />
        </View>
      ) : null}
    </Column>
  );
}

function HistoryStatePanel({
  contentState,
  errorMessage,
  onRetry,
  range,
}: {
  contentState: HistoryContentState;
  errorMessage?: string;
  onRetry?: () => void;
  range: HistoryRange;
}) {
  const { colors } = useAppTheme();

  if (contentState === 'loading') {
    return (
      <Column
        alignment="center"
        spacing={10}
        style={{
          ...getRowSurfaceStyle({ backgroundColor: colors.surface }),
          paddingHorizontal: 20,
          paddingVertical: 24,
          width: '100%',
        }}
        testID="history-loading"
      >
        <ActivityIndicator color={colors.primary} size="small" />
        <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>Loading history…</Text>
      </Column>
    );
  }

  if (contentState === 'error') {
    return (
      <Column
        spacing={10}
        style={{
          ...getRowSurfaceStyle({ backgroundColor: colors.danger.background }),
          padding: 16,
          width: '100%',
        }}
        testID="history-error"
      >
        <Text textStyle={{ color: colors.danger.foreground, fontSize: 17, fontWeight: '700' }}>
          History unavailable
        </Text>
        <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>
          {errorMessage ?? 'Something went wrong while loading your history.'}
        </Text>
        {onRetry ? (
          <View style={styles.retryButtonWrap}>
            <AppButton
              label="Try again"
              onPress={onRetry}
              style={{ height: 44 }}
              testID="history-retry"
              variant="outlined"
            />
          </View>
        ) : null}
      </Column>
    );
  }

  return (
    <EmptyState
      description={
        range === 'day'
          ? 'Tracked sessions will appear here.'
          : 'Tracked time for this period will appear here.'
      }
      iconName="clock"
      testID="history-empty"
      title="No tracked activity"
    />
  );
}

function HistoryDayContent({
  runtime,
  period,
}: {
  runtime: RoutineRuntime;
  period: HistoryPeriod;
}) {
  const store = runtime.trackerStore;
  const catalog = store((state) => state.catalog);
  const transitions = store((state) => state.transitions);
  const loading = store((state) => state.loading);
  const persistenceError = store((state) => state.persistenceError);
  const [queryState, setQueryState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [queryError, setQueryError] = useState<string | null>(null);
  const queryRequest = useRef(0);

  const loadDay = useCallback(() => {
    const requestId = queryRequest.current + 1;
    queryRequest.current = requestId;
    setQueryState('loading');
    setQueryError(null);
    store.getState().setRange({ startMs: period.startMs, endMs: period.endMs });
    void store
      .getState()
      .hydrate()
      .then(() => {
        if (queryRequest.current === requestId) setQueryState('ready');
      })
      .catch((error: unknown) => {
        if (queryRequest.current !== requestId) return;
        setQueryError(errorText(error));
        setQueryState('error');
      });
  }, [period.endMs, period.startMs, store]);

  useFocusEffect(
    useCallback(() => {
      loadDay();
      return () => {
        queryRequest.current += 1;
      };
    }, [loadDay])
  );

  if (queryState === 'loading' || loading) {
    return <HistoryStatePanel contentState="loading" range="day" />;
  }
  if (queryState === 'error' || persistenceError) {
    return (
      <HistoryStatePanel
        contentState="error"
        errorMessage={queryError ?? errorText(persistenceError)}
        onRetry={loadDay}
        range="day"
      />
    );
  }
  if (!catalog) {
    return (
      <HistoryStatePanel
        contentState="error"
        errorMessage="The activity catalog is not available yet."
        onRetry={loadDay}
        range="day"
      />
    );
  }

  return <DayTimeline catalog={catalog} period={period} transitions={transitions} />;
}

/** Phone-first History shell with the real configured logical-day timeline. */
export default function HistoryScreen({
  contentState,
  errorMessage,
  onRetry,
  onPeriodLabelPress,
}: HistoryScreenProps) {
  const { colors } = useAppTheme();
  const [runtime, setRuntime] = useState<RoutineRuntime | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fallbackToday] = useState<LogicalDayKey>(() => logicalDayKey(Date.now()));
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [range, setRange] = useState<HistoryRange>('day');
  const [selectedAnchor, setSelectedAnchor] = useState<LogicalDayKey | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    void loadRoutineRuntime()
      .then(setRuntime)
      .catch((error: unknown) => setLoadError(errorText(error)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadRoutineRuntime()
      .then((nextRuntime) => {
        if (!cancelled) setRuntime(nextRuntime);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(errorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setClockMs(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const periodOptions = runtime
    ? {
        rolloverHour: runtime.settings.logicalDayRolloverHour,
        weekStartsOn: runtime.settings.weekStartsOn,
      }
    : {};
  const today = runtime
    ? currentHistoryPeriod('day', clockMs, periodOptions).startLogicalDay
    : fallbackToday;
  const anchor = selectedAnchor ?? today;
  const period = historyPeriodForDate(range, anchor, periodOptions);

  const changePeriod = (amount: -1 | 1) => {
    const next = shiftDomainHistoryPeriod(period, amount, periodOptions);
    if (amount === 1 && nextHistoryPeriod(period, periodOptions, clockMs) === null) return;
    setSelectedAnchor(next.startLogicalDay);
  };

  if (!runtime) {
    return (
      <AppScreen scrollable testID="history-screen" title="History">
        <HistoryStatePanel
          contentState={loadError ? 'error' : 'loading'}
          errorMessage={loadError ?? undefined}
          onRetry={loadError ? (onRetry ?? load) : undefined}
          range={range}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen scrollable testID="history-screen" title="History">
      <Column spacing={16} style={{ width: '100%' }}>
        <Column
          spacing={14}
          style={{
            ...getRowSurfaceStyle({ backgroundColor: colors.surface }),
            padding: 14,
            width: '100%',
          }}
          testID="history-navigation"
        >
          <HistoryRangeSelector onChange={setRange} value={range} />
          <HistoryPeriodNavigation
            nowMs={clockMs}
            onChange={changePeriod}
            onPeriodLabelPress={onPeriodLabelPress}
            onToday={() => setSelectedAnchor(null)}
            options={periodOptions}
            period={period}
          />
        </Column>
        {contentState ? (
          <HistoryStatePanel
            contentState={contentState}
            errorMessage={errorMessage}
            onRetry={onRetry}
            range={range}
          />
        ) : range === 'day' ? (
          <HistoryDayContent period={period} runtime={runtime} />
        ) : (
          <HistoryStatePanel contentState="empty" range={range} />
        )}
      </Column>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  rangeSelector: {
    borderRadius: 12,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    width: '100%',
  },
  rangeOption: {
    alignItems: 'center',
    borderRadius: 9,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 4,
  },
  periodNavigation: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  periodLabel: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 8,
  },
  retryButtonWrap: {
    alignSelf: 'flex-start',
  },
  pressed: {
    opacity: 0.72,
  },
  todayButtonWrap: {
    alignSelf: 'center',
  },
});
