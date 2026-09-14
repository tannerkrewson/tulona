import { Column, Text } from '@expo/ui';
import {
  dateForLogicalDay,
  logicalDayKey,
  shiftLogicalDay,
  weekBounds,
  type LogicalDayKey,
} from '@domain';
import { useAppTheme } from '@theme';
import { AppButton, AppScreen, EmptyState, getRowSurfaceStyle, IconButton } from '@ui';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

export type HistoryRange = 'day' | 'week' | 'month' | 'year';
export type HistoryContentState = 'loading' | 'empty' | 'error';

export interface HistoryScreenProps {
  /** Allows the later data views to replace the shell state without changing navigation. */
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

function shortDate(date: Date): string {
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function dayLabel(anchor: LogicalDayKey, today: LogicalDayKey): string {
  if (anchor === today) return 'Today';
  if (anchor === shiftLogicalDay(today, -1)) return 'Yesterday';
  return dateForLogicalDay(anchor).toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  });
}

function weekLabel(anchor: LogicalDayKey): string {
  const bounds = weekBounds(anchor);
  const start = new Date(bounds.start.startMs);
  const end = new Date(bounds.end.startMs);
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${shortDate(start)}–${end.getDate()}`;
  }
  return `${shortDate(start)}–${end.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`;
}

export function formatHistoryPeriodLabel(
  range: HistoryRange,
  anchor: LogicalDayKey,
  today: LogicalDayKey
): string {
  if (range === 'day') return dayLabel(anchor, today);
  const date = dateForLogicalDay(anchor);
  if (range === 'week') return weekLabel(anchor);
  if (range === 'month') {
    return date.toLocaleDateString([], { month: 'long', year: 'numeric' });
  }
  return date.toLocaleDateString([], { year: 'numeric' });
}

function periodStartMs(anchor: LogicalDayKey, range: HistoryRange): number {
  if (range === 'day') return dateForLogicalDay(anchor).getTime();
  if (range === 'week') return weekBounds(anchor).start.startMs;

  const date = dateForLogicalDay(anchor);
  if (range === 'month') return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
  return new Date(date.getFullYear(), 0, 1).getTime();
}

export function shiftHistoryPeriod(
  anchor: LogicalDayKey,
  range: HistoryRange,
  amount: -1 | 1
): LogicalDayKey {
  if (range === 'day') return shiftLogicalDay(anchor, amount);
  if (range === 'week') return shiftLogicalDay(anchor, amount * 7);

  const date = dateForLogicalDay(anchor);
  date.setDate(1);
  if (range === 'month') date.setMonth(date.getMonth() + amount);
  else {
    date.setMonth(0);
    date.setFullYear(date.getFullYear() + amount);
  }
  return logicalDayKey(date);
}

function isCurrentPeriod(
  anchor: LogicalDayKey,
  range: HistoryRange,
  today: LogicalDayKey
): boolean {
  return periodStartMs(anchor, range) === periodStartMs(today, range);
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
  anchor,
  range,
  today,
  onChange,
  onToday,
  onPeriodLabelPress,
}: {
  anchor: LogicalDayKey;
  range: HistoryRange;
  today: LogicalDayKey;
  onChange: (amount: -1 | 1) => void;
  onToday: () => void;
  onPeriodLabelPress?: () => void;
}) {
  const { colors } = useAppTheme();
  const label = formatHistoryPeriodLabel(range, anchor, today);
  const current = isCurrentPeriod(anchor, range, today);
  const nextAnchor = shiftHistoryPeriod(anchor, range, 1);
  const nextDisabled = periodStartMs(nextAnchor, range) > periodStartMs(today, range);

  return (
    <Column spacing={10} style={{ width: '100%' }}>
      <View style={styles.periodNavigation} testID="history-period-navigation">
        <IconButton
          accessibilityHint="Shows the previous history period"
          disabled={false}
          icon="chevron-left"
          label={`Previous ${range}`}
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
          label={`Next ${range}`}
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

/** Phone-first navigation shell for the replacement History tab. */
export default function HistoryScreen({
  contentState = 'empty',
  errorMessage,
  onRetry,
  onPeriodLabelPress,
}: HistoryScreenProps) {
  const { colors } = useAppTheme();
  const [today] = useState<LogicalDayKey>(() => logicalDayKey(Date.now()));
  const [range, setRange] = useState<HistoryRange>('day');
  const [anchor, setAnchor] = useState<LogicalDayKey>(today);

  const changePeriod = (amount: -1 | 1) => {
    const next = shiftHistoryPeriod(anchor, range, amount);
    if (amount === 1 && periodStartMs(next, range) > periodStartMs(today, range)) return;
    setAnchor(next);
  };

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
            anchor={anchor}
            onChange={changePeriod}
            onPeriodLabelPress={onPeriodLabelPress}
            onToday={() => setAnchor(today)}
            range={range}
            today={today}
          />
        </Column>
        <HistoryStatePanel
          contentState={contentState}
          errorMessage={errorMessage}
          onRetry={onRetry}
          range={range}
        />
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
