import { Column, Row, ScrollView, Text } from '@expo/ui';
import { useIsFocused, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text as NativeText,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ViewStyle } from 'react-native';

import type { Habit, HabitDayOutcome, HabitDayState, LogicalDayKey } from '@domain';
import { AppIcon } from '@icons';
import { getAccessibleTextColor, useAppTheme } from '@theme';
import {
  EmptyState,
  errorText,
  getRowSurfaceStyle,
  ROW_SURFACE_CONTENT_GAP,
  ROW_SURFACE_ICON_SIZE,
  ROW_SURFACE_PADDING_HORIZONTAL,
  ROW_SURFACE_RADIUS,
  Screen,
} from '@ui';

import { HabitErrorMessage } from './HabitErrorMessage';
import { HabitHeader } from './HabitHeader';
import {
  DEFAULT_HABIT_CATEGORY,
  groupHabitsByCategory,
  HABIT_CATEGORY_OPTIONS,
  habitStartDay,
  type HabitCategory,
} from './categories';
import {
  formatHabitDay,
  formatHabitRolloverHour,
  habitDaySwipeTarget,
  habitWeekDays,
  habitWeekSwipeTarget,
  isPastMidnightHabitDay,
  shiftHabitWeek,
  sundayFirstWeekdayLabels,
} from './date-navigation';
import {
  habitCompletionLabel,
  habitOutcomeLabel,
  habitSignalSummary,
  toggleHabitMetricMode,
  type HabitMetricMode,
} from './habit-format';
import { loadHabitStore } from './habit-runtime';
import { calculateHabitStreak, habitCompleted, habitCompletionCount } from './streak';
import type { HabitStore } from './habit-store';

export default function HabitListScreen() {
  const { colors } = useAppTheme();
  const focused = useIsFocused();
  const router = useRouter();
  const [store, setStore] = useState<HabitStore | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!focused) return;
    let cancelled = false;
    const load = store
      ? store
          .getState()
          .refresh()
          .then(() => store)
      : loadHabitStore();
    void load
      .then((nextStore) => {
        if (!cancelled) {
          if (!store) setStore(() => nextStore);
          setLoadError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(errorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, [focused, store]);

  if (!store) {
    return (
      <Screen testID="habits-screen">
        <Column spacing={20} style={{ width: '100%' }}>
          <HabitHeader
            onAdd={() => router.push('/habit/new')}
            title="Habits"
            testID="habits-header"
          />
          <HabitErrorMessage
            message={loadError}
            onRetry={() => {
              setLoadError(null);
              void loadHabitStore()
                .then((nextStore) => setStore(() => nextStore))
                .catch((error: unknown) => setLoadError(errorText(error)));
            }}
            onBack={() => router.replace('/(tabs)')}
            retryTestID="habits-retry"
          />
          <Column
            style={{
              backgroundColor: loadError ? 'transparent' : colors.surface,
              borderColor: loadError ? 'transparent' : colors.border,
              borderRadius: 16,
              borderWidth: loadError ? 0 : 1,
              padding: 18,
              width: '100%',
            }}
          >
            <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>
              {loadError ? 'Your habits could not be loaded.' : 'Loading habits...'}
            </Text>
          </Column>
        </Column>
      </Screen>
    );
  }

  return <HabitListContent store={store} />;
}

function HabitListContent({ store }: { store: HabitStore }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const habits = store((state) => state.habits);
  const states = store((state) => state.states);
  const today = store((state) => state.today);
  const selectedDay = store((state) => state.selectedDay);
  const logicalDayRolloverHour = store((state) => state.logicalDayRolloverHour);
  const saving = store((state) => state.saving);
  const persistenceError = store((state) => state.persistenceError);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [contentWidth, setContentWidth] = useState(0);
  const [metricMode, setMetricMode] = useState<HabitMetricMode>('streak');
  const [selectedCategory, setSelectedCategory] = useState<HabitCategory>(DEFAULT_HABIT_CATEGORY);
  const [dismissedPastMidnightDay, setDismissedPastMidnightDay] = useState<LogicalDayKey | null>(
    null
  );
  const lastAction = useRef<(() => Promise<unknown>) | null>(null);
  const habitsByCategory = useMemo(
    () => groupHabitsByCategory(habits, today, { rolloverHour: logicalDayRolloverHour }),
    [habits, logicalDayRolloverHour, today]
  );
  const visibleHabits = habitsByCategory[selectedCategory];
  const pastMidnightWarningVisible =
    selectedCategory === 'active' &&
    isPastMidnightHabitDay(selectedDay, clockMs, logicalDayRolloverHour) &&
    dismissedPastMidnightDay !== selectedDay;

  useEffect(() => {
    const timer = setInterval(() => setClockMs(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const runAction = useCallback((action: () => Promise<unknown>) => {
    lastAction.current = action;
    void action().catch(() => undefined);
  }, []);

  const selectDay = useCallback(
    (day: LogicalDayKey) => runAction(() => store.getState().selectDay(day)),
    [runAction, store]
  );
  const toggleMetricDisplay = useCallback(
    () => setMetricMode((mode) => toggleHabitMetricMode(mode)),
    []
  );

  const renderDay = (day: LogicalDayKey) => (
    <HabitDayList
      activeHabits={habitsByCategory.active}
      day={day}
      logicalDayRolloverHour={logicalDayRolloverHour}
      onDetails={(habitId) => router.push(`/habit/${habitId}`)}
      onOutcome={(habitId, outcome) =>
        runAction(() => store.getState().setOutcome(habitId, day, outcome))
      }
      onCycle={(habitId) => runAction(() => store.getState().cycleOutcome(habitId, day))}
      onToggleMetricDisplay={toggleMetricDisplay}
      metricMode={metricMode}
      saving={saving}
      states={states}
    />
  );

  return (
    <Screen scrollable={false} testID="habits-screen">
      <View
        onLayout={(event) => setContentWidth(event.nativeEvent.layout.width)}
        style={{ flex: 1, gap: 14, minHeight: 0, width: '100%' }}
      >
        <HabitHeader
          onAdd={() => router.push('/habit/new')}
          title="Habits"
          testID="habits-header"
        />
        <HabitErrorMessage
          message={persistenceError ? errorText(persistenceError) : null}
          onBack={() => router.replace('/(tabs)')}
          onRetry={() => {
            const action = lastAction.current;
            runAction(action ?? (() => store.getState().refresh()));
          }}
        />
        <HabitCategorySwitcher
          counts={habitsByCategory}
          onChange={setSelectedCategory}
          value={selectedCategory}
        />
        {selectedCategory === 'active' ? (
          <>
            <HabitWeekStrip
              onSelectDay={selectDay}
              rolloverHour={logicalDayRolloverHour}
              selectedDay={selectedDay}
              today={today}
            />
            {pastMidnightWarningVisible ? (
              <View
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
                style={{ width: '100%' }}
                testID="habit-past-midnight-warning"
              >
                <Column
                  spacing={6}
                  style={{
                    backgroundColor: colors.warning.background,
                    borderColor: colors.warning.foreground,
                    borderRadius: 12,
                    borderWidth: 1,
                    padding: 14,
                    width: '100%',
                  }}
                >
                  <Text
                    textStyle={{
                      color: colors.warning.foreground,
                      fontSize: 14,
                      fontWeight: '700',
                    }}
                  >
                    Past midnight reminder
                  </Text>
                  <Text
                    textStyle={{ color: colors.warning.foreground, fontSize: 14, lineHeight: 20 }}
                  >
                    {`It’s after midnight. Your logical day rolls over at ${formatHabitRolloverHour(logicalDayRolloverHour)}. Check that you’re logging the intended day; entries saved now apply to ${formatHabitDay(selectedDay)}.`}
                  </Text>
                  <Pressable
                    accessibilityHint="Dismisses this reminder without changing habit data"
                    accessibilityLabel="Keep logging on this logical day"
                    accessibilityRole="button"
                    onPress={() => setDismissedPastMidnightDay(selectedDay)}
                    style={({ pressed }) => ({
                      alignSelf: 'flex-start',
                      borderRadius: 8,
                      opacity: pressed ? 0.65 : 1,
                      paddingHorizontal: 2,
                      paddingVertical: 4,
                    })}
                    testID="habit-past-midnight-keep"
                  >
                    <NativeText
                      selectable={false}
                      style={{ color: colors.warning.foreground, fontSize: 14, fontWeight: '700' }}
                    >
                      Keep logging here
                    </NativeText>
                  </Pressable>
                </Column>
              </View>
            ) : null}
            <HabitDayPager
              contentWidth={contentWidth}
              horizontalInsets={{ left: 20 + insets.left, right: 20 + insets.right }}
              onSelectDay={selectDay}
              renderDay={renderDay}
              rolloverHour={logicalDayRolloverHour}
              selectedDay={selectedDay}
              today={today}
            />
          </>
        ) : (
          <HabitCategoryList
            category={selectedCategory}
            habits={visibleHabits}
            onDetails={(habitId) => router.push(`/habit/${habitId}`)}
            rolloverHour={logicalDayRolloverHour}
          />
        )}
      </View>
    </Screen>
  );
}

function HabitCategorySwitcher({
  counts,
  onChange,
  value,
}: {
  counts: Readonly<Record<HabitCategory, readonly Habit[]>>;
  onChange: (category: HabitCategory) => void;
  value: HabitCategory;
}) {
  const { colors } = useAppTheme();

  return (
    <View
      accessibilityLabel="Habit categories"
      style={[styles.categorySwitcher, { backgroundColor: colors.surfaceMuted }]}
      testID="habit-category-switcher"
    >
      {HABIT_CATEGORY_OPTIONS.map((option) => {
        const selected = option.value === value;
        const count = counts[option.value].length;
        return (
          <Pressable
            accessibilityLabel={`${option.label} habits, ${count}`}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.categoryOption,
              { backgroundColor: selected ? colors.primary : 'transparent' },
              pressed ? styles.categoryPressed : null,
            ]}
            testID={`habit-category-${option.value}`}
          >
            <NativeText
              selectable={false}
              style={{
                color: selected ? colors.onPrimary : colors.textMuted,
                fontSize: 13,
                fontWeight: '700',
              }}
            >
              {`${option.label} (${count})`}
            </NativeText>
          </Pressable>
        );
      })}
    </View>
  );
}

function HabitCategoryList({
  category,
  habits,
  onDetails,
  rolloverHour,
}: {
  category: Exclude<HabitCategory, 'active'>;
  habits: readonly Habit[];
  onDetails: (habitId: string) => void;
  rolloverHour: number;
}) {
  const { colors } = useAppTheme();
  const future = category === 'future';

  return (
    <ScrollView style={{ height: '100%', width: '100%' }}>
      <Column spacing={12} style={{ paddingBottom: 20, paddingTop: 12, width: '100%' }}>
        <Text textStyle={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
          {future
            ? 'These habits will become active when their scheduled start date arrives.'
            : 'Archived habits keep their history and can be restored from their details.'}
        </Text>
        {habits.length === 0 ? (
          <EmptyState
            iconName={future ? 'calendar-days' : 'archive'}
            testID={`habits-${category}-empty`}
            title={future ? 'No future habits' : 'No archived habits'}
          />
        ) : (
          <Column spacing={8} style={{ width: '100%' }}>
            {habits.map((habit) => (
              <HabitCategoryListItem
                category={category}
                habit={habit}
                key={habit.id}
                onDetails={() => onDetails(habit.id)}
                rolloverHour={rolloverHour}
              />
            ))}
          </Column>
        )}
      </Column>
    </ScrollView>
  );
}

function HabitCategoryListItem({
  category,
  habit,
  onDetails,
  rolloverHour,
}: {
  category: Exclude<HabitCategory, 'active'>;
  habit: Habit;
  onDetails: () => void;
  rolloverHour: number;
}) {
  const { colors } = useAppTheme();
  const future = category === 'future';
  const subtitle = future
    ? `Starts ${formatHabitDay(habitStartDay(habit, { rolloverHour }))}`
    : 'Archived habit · Open details to restore';
  const accent = habit.color ?? colors.primary;

  return (
    <Pressable
      accessibilityHint="Opens habit details, where it can be edited or restored"
      accessibilityLabel={`${habit.name}. ${subtitle}`}
      accessibilityRole="button"
      onPress={onDetails}
      style={({ pressed }) => [
        getRowSurfaceStyle({ backgroundColor: colors.surface }),
        styles.categoryListItem,
        pressed ? styles.categoryPressed : null,
      ]}
      testID={`habit-category-item-${category}-${habit.id}`}
    >
      <View style={[styles.categoryIcon, { backgroundColor: accent }]}>
        <AppIcon
          accessibilityLabel={future ? 'Future habit' : 'Archived habit'}
          color={getAccessibleTextColor(accent)}
          name={habit.iconName ?? (future ? 'calendar-days' : 'archive')}
          size={20}
        />
      </View>
      <View style={styles.categoryListText}>
        <NativeText
          numberOfLines={1}
          selectable={false}
          style={{ color: colors.text, fontSize: 17, fontWeight: '600', lineHeight: 22 }}
        >
          {habit.name}
        </NativeText>
        <NativeText
          numberOfLines={1}
          selectable={false}
          style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}
        >
          {subtitle}
        </NativeText>
      </View>
      <AppIcon
        accessibilityLabel="Open details"
        color={colors.textMuted}
        name="chevron-right"
        size={20}
      />
    </Pressable>
  );
}

const DAY_SWIPE_THRESHOLD = 48;
const DAY_SETTLE_DURATION = 200;
const WEEK_SWIPE_THRESHOLD = 40;
const WEEK_SETTLE_DURATION = 180;
const HABIT_MENU_WIDTH = 220;
const HABIT_MENU_HEIGHT = 190;
// Habit cards intentionally exceed the compact row height: the optional
// outcome subtitle and the current-streak summary need a second text line.
const HABIT_ROW_MIN_HEIGHT = 72;
const HABIT_ROW_TEXT_BLOCK_HEIGHT = 38;
const HABIT_ROW_STREAK_WIDTH = 96;

const styles = StyleSheet.create({
  categoryIcon: {
    alignItems: 'center',
    borderRadius: 8,
    height: ROW_SURFACE_ICON_SIZE,
    justifyContent: 'center',
    width: ROW_SURFACE_ICON_SIZE,
  },
  categoryListItem: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: HABIT_ROW_MIN_HEIGHT,
    paddingHorizontal: ROW_SURFACE_PADDING_HORIZONTAL,
    paddingVertical: 12,
    width: '100%',
  },
  categoryListText: {
    flex: 1,
    marginLeft: ROW_SURFACE_CONTENT_GAP,
    marginRight: ROW_SURFACE_CONTENT_GAP,
    minWidth: 0,
  },
  categoryOption: {
    alignItems: 'center',
    borderRadius: 9,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 8,
  },
  categoryPressed: {
    opacity: 0.72,
  },
  categorySwitcher: {
    borderRadius: 12,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    width: '100%',
  },
});

function webGestureStyle(touchAction: 'pan-y' | 'none'): ViewStyle | undefined {
  if (Platform.OS !== 'web') return undefined;
  return {
    touchAction,
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
  } as unknown as ViewStyle;
}

function HabitDayPager({
  contentWidth,
  horizontalInsets,
  selectedDay,
  today,
  rolloverHour,
  onSelectDay,
  renderDay,
}: {
  contentWidth: number;
  horizontalInsets: { left: number; right: number };
  selectedDay: LogicalDayKey;
  today: LogicalDayKey;
  rolloverHour: number;
  onSelectDay: (day: LogicalDayKey) => void;
  renderDay: (day: LogicalDayKey) => ReactNode;
}) {
  const { width: viewportWidth } = useWindowDimensions();
  const [dragX] = useState(() => new Animated.Value(0));
  const gestureLock = useRef({ locked: false });
  const useNativeDriver = Platform.OS !== 'web';
  const gestureStyle = webGestureStyle('pan-y');
  const insetWidth = horizontalInsets.left + horizontalInsets.right;
  const measuredContentWidth =
    contentWidth > 0 ? contentWidth : Math.max(Math.min(viewportWidth - insetWidth, 720), 280);
  const effectiveWidth = measuredContentWidth + insetWidth;
  const pageGap = 12;
  const pageStride = effectiveWidth + pageGap;

  const prevDay = habitDaySwipeTarget(selectedDay, -1, today, rolloverHour) ?? selectedDay;
  const nextTarget = habitDaySwipeTarget(selectedDay, 1, today, rolloverHour);
  const nextDay = nextTarget ?? selectedDay;
  const translateX = dragX.interpolate({
    extrapolate: 'clamp',
    inputRange: [-pageStride, 0, pageStride],
    outputRange: [nextTarget ? -pageStride : -pageStride / 3, 0, pageStride],
  });

  useEffect(() => {
    dragX.setValue(0);
    gestureLock.current.locked = false;
  }, [dragX, gestureLock, selectedDay]);

  const settleTo = useCallback(
    (target: number, nextDayValue?: LogicalDayKey) => {
      gestureLock.current.locked = true;
      dragX.stopAnimation();
      Animated.timing(dragX, {
        duration: DAY_SETTLE_DURATION,
        isInteraction: false,
        toValue: target,
        useNativeDriver,
      }).start(({ finished }) => {
        if (!finished) {
          gestureLock.current.locked = false;
          return;
        }
        if (nextDayValue) {
          // Keep the settled offset in place; the selectedDay effect resets
          // the drag once the middle page becomes the target day, so the
          // pre-rendered neighbor content stays visually continuous.
          onSelectDay(nextDayValue);
          return;
        }
        gestureLock.current.locked = false;
      });
    },
    [dragX, onSelectDay, useNativeDriver]
  );

  const panResponder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          !gestureLock.current.locked &&
          Math.abs(gesture.dx) > 12 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          !gestureLock.current.locked &&
          Math.abs(gesture.dx) > 12 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
        onPanResponderGrant: () => {
          if (gestureLock.current.locked) return;
          dragX.stopAnimation();
        },
        // Map the gesture directly to the animated value. The interpolated
        // transform below retains future-day resistance without extra
        // per-frame JS work on platforms that support the native driver.
        onPanResponderMove: Animated.event([null, { dx: dragX }], { useNativeDriver }),
        onPanResponderRelease: (_, gesture) => {
          if (gestureLock.current.locked) return;
          if (Math.abs(gesture.dx) < DAY_SWIPE_THRESHOLD) {
            settleTo(0);
            return;
          }
          if (gesture.dx > 0) {
            settleTo(pageStride, prevDay);
            return;
          }
          if (!nextTarget) {
            settleTo(0);
            return;
          }
          settleTo(-pageStride, nextTarget);
        },
        onPanResponderTerminate: () => {
          gestureLock.current.locked = false;
          dragX.setValue(0);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [dragX, gestureLock, nextTarget, pageStride, prevDay, settleTo, useNativeDriver]
  );

  return (
    <View
      {...panResponder.panHandlers}
      style={[
        {
          flex: 1,
          marginLeft: -horizontalInsets.left,
          marginRight: -horizontalInsets.right,
          minHeight: 0,
          overflow: 'hidden',
          width: effectiveWidth,
        },
        gestureStyle,
      ]}
      testID="habit-day-navigation"
    >
      <Animated.View
        style={{
          flex: 1,
          flexDirection: 'row',
          flexShrink: 0,
          marginLeft: -pageStride,
          minHeight: 0,
          transform: [
            {
              translateX,
            },
          ],
          width: pageStride * 3,
        }}
      >
        {[
          { day: prevDay, key: `prev-${prevDay}` },
          { day: selectedDay, key: `current-${selectedDay}` },
          { day: nextDay, key: `next-${nextDay}` },
        ].map(({ day, key }) => (
          <View
            key={key}
            style={{
              flexBasis: effectiveWidth,
              flexGrow: 0,
              flexShrink: 0,
              marginRight: pageGap,
              minHeight: 0,
              paddingLeft: horizontalInsets.left,
              paddingRight: horizontalInsets.right,
              width: effectiveWidth,
            }}
          >
            {renderDay(day)}
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

function HabitWeekStrip({
  selectedDay,
  today,
  rolloverHour,
  onSelectDay,
}: {
  selectedDay: LogicalDayKey;
  today: LogicalDayKey;
  rolloverHour: number;
  onSelectDay: (day: LogicalDayKey) => void;
}) {
  const { colors } = useAppTheme();
  const { width: viewportWidth } = useWindowDimensions();
  const [pageWidth, setPageWidth] = useState(0);
  const [dragX] = useState(() => new Animated.Value(0));
  const gestureLock = useRef({ locked: false });
  const useNativeDriver = Platform.OS !== 'web';
  const gestureStyle = webGestureStyle('pan-y');
  const effectiveWidth = pageWidth > 0 ? pageWidth : Math.max(viewportWidth - 40, 280);

  const prevAnchor = shiftHabitWeek(selectedDay, -1, rolloverHour);
  const nextAnchor = shiftHabitWeek(selectedDay, 1, rolloverHour);
  const prevDays = habitWeekDays(prevAnchor, rolloverHour);
  const currentDays = habitWeekDays(selectedDay, rolloverHour);
  const nextDays = habitWeekDays(nextAnchor, rolloverHour);
  const nextWeekTarget = habitWeekSwipeTarget(selectedDay, 1, today, rolloverHour);

  useEffect(() => {
    dragX.setValue(0);
    gestureLock.current.locked = false;
  }, [dragX, gestureLock, selectedDay]);

  const settleTo = useCallback(
    (target: number, nextDayValue?: LogicalDayKey) => {
      gestureLock.current.locked = true;
      dragX.stopAnimation();
      Animated.timing(dragX, {
        duration: WEEK_SETTLE_DURATION,
        toValue: target,
        useNativeDriver,
      }).start(({ finished }) => {
        if (!finished) {
          gestureLock.current.locked = false;
          return;
        }
        if (nextDayValue) {
          onSelectDay(nextDayValue);
          return;
        }
        gestureLock.current.locked = false;
      });
    },
    [dragX, onSelectDay, useNativeDriver]
  );

  const panResponder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          !gestureLock.current.locked &&
          Math.abs(gesture.dx) > 10 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          !gestureLock.current.locked &&
          Math.abs(gesture.dx) > 10 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: () => {
          if (gestureLock.current.locked) return;
          dragX.stopAnimation();
        },
        // Keep the known pre-optimization gesture path until the week-strip
        // jank has been profiled on the target devices.
        onPanResponderMove: (_, gesture) => {
          if (gestureLock.current.locked) return;
          let dx = gesture.dx;
          if (dx < 0 && !nextWeekTarget) dx /= 3;
          dx = Math.max(-effectiveWidth, Math.min(effectiveWidth, dx));
          dragX.setValue(dx);
        },
        onPanResponderRelease: (_, gesture) => {
          if (gestureLock.current.locked) return;
          if (Math.abs(gesture.dx) < WEEK_SWIPE_THRESHOLD) {
            settleTo(0);
            return;
          }
          if (gesture.dx > 0) {
            settleTo(effectiveWidth, prevAnchor);
            return;
          }
          if (!nextWeekTarget) {
            settleTo(0);
            return;
          }
          settleTo(-effectiveWidth, nextWeekTarget);
        },
        onPanResponderTerminate: () => {
          gestureLock.current.locked = false;
          dragX.setValue(0);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [dragX, effectiveWidth, gestureLock, nextWeekTarget, prevAnchor, settleTo]
  );

  return (
    <View
      onLayout={(event) => setPageWidth(event.nativeEvent.layout.width)}
      style={{
        backgroundColor: colors.surface,
        borderRadius: ROW_SURFACE_RADIUS,
        overflow: 'hidden',
        width: '100%',
      }}
      testID="habit-week-strip"
    >
      <View {...panResponder.panHandlers} style={[{ width: '100%' }, gestureStyle]}>
        <Animated.View
          style={{
            flexDirection: 'row',
            marginLeft: -effectiveWidth,
            transform: [{ translateX: dragX }],
            width: effectiveWidth * 3,
          }}
        >
          {[
            { days: prevDays, key: `week-prev-${prevDays[0]}` },
            { days: currentDays, key: `week-current-${currentDays[0]}` },
            { days: nextDays, key: `week-next-${nextDays[0]}` },
          ].map(({ days, key }) => (
            <View
              key={key}
              style={{
                flexBasis: effectiveWidth,
                flexGrow: 0,
                flexShrink: 0,
                paddingHorizontal: 4,
                paddingVertical: 8,
                width: effectiveWidth,
              }}
            >
              <WeekDaysRow
                days={days}
                onSelectDay={onSelectDay}
                selectedDay={selectedDay}
                today={today}
              />
            </View>
          ))}
        </Animated.View>
      </View>
    </View>
  );
}

function WeekDaysRow({
  days,
  selectedDay,
  today,
  onSelectDay,
}: {
  days: LogicalDayKey[];
  selectedDay: LogicalDayKey;
  today: LogicalDayKey;
  onSelectDay: (day: LogicalDayKey) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Row alignment="center" spacing={4} style={{ width: '100%' }}>
      {days.map((day, index) => {
        const selected = day === selectedDay;
        const future = day > today;
        return (
          <Pressable
            accessibilityLabel={`${sundayFirstWeekdayLabels[index]} ${day.slice(8)}${selected ? ', selected' : ''}`}
            accessibilityRole="button"
            accessibilityState={{ disabled: future, selected }}
            disabled={future}
            key={day}
            onPress={() => onSelectDay(day)}
            style={({ pressed }) => ({
              alignItems: 'center',
              backgroundColor: selected ? colors.primary : 'transparent',
              borderRadius: 10,
              flex: 1,
              height: 54,
              justifyContent: 'center',
              opacity: future ? 0.35 : pressed ? 0.65 : 1,
            })}
            testID={`habit-day-${day}`}
          >
            <Text
              textStyle={{
                color: selected ? colors.onPrimary : colors.textMuted,
                fontSize: 11,
                fontWeight: '600',
              }}
            >
              {sundayFirstWeekdayLabels[index]}
            </Text>
            <Text
              textStyle={{
                color: selected ? colors.onPrimary : colors.text,
                fontSize: 18,
                fontWeight: selected ? '700' : '600',
              }}
            >
              {day.slice(8)}
            </Text>
          </Pressable>
        );
      })}
    </Row>
  );
}

function HabitDayList({
  activeHabits,
  day,
  logicalDayRolloverHour,
  onDetails,
  onOutcome,
  onCycle,
  onToggleMetricDisplay,
  metricMode,
  saving,
  states,
}: {
  activeHabits: Habit[];
  day: LogicalDayKey;
  logicalDayRolloverHour: number;
  onDetails: (habitId: string) => void;
  onOutcome: (habitId: string, outcome: HabitDayOutcome | null) => void;
  onCycle: (habitId: string) => void;
  onToggleMetricDisplay: () => void;
  metricMode: HabitMetricMode;
  saving: boolean;
  states: HabitDayState[];
}) {
  return (
    <ScrollView style={{ height: '100%', width: '100%' }}>
      <Column spacing={12} style={{ paddingBottom: 20, paddingTop: 12, width: '100%' }}>
        {activeHabits.length === 0 ? (
          <EmptyState iconName="heart" testID="habits-empty" title="No active habits yet" />
        ) : (
          <Column spacing={8} style={{ width: '100%' }}>
            {activeHabits.map((habit) => (
              <HabitListItem
                habit={habit}
                key={habit.id}
                saving={saving}
                state={states.find(
                  (candidate) => candidate.habitId === habit.id && candidate.logicalDay === day
                )}
                states={states.filter((candidate) => candidate.habitId === habit.id)}
                selectedDay={day}
                logicalDayRolloverHour={logicalDayRolloverHour}
                metricMode={metricMode}
                onDetails={() => onDetails(habit.id)}
                onCycle={() => onCycle(habit.id)}
                onOutcome={(outcome) => onOutcome(habit.id, outcome)}
                onToggleMetricDisplay={onToggleMetricDisplay}
              />
            ))}
          </Column>
        )}
      </Column>
    </ScrollView>
  );
}

interface HabitMenuAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

function HabitListItem({
  habit,
  state,
  states,
  selectedDay,
  saving,
  logicalDayRolloverHour,
  onCycle,
  onDetails,
  onOutcome,
  onToggleMetricDisplay,
  metricMode,
}: {
  habit: Habit;
  state: HabitDayState | undefined;
  states: HabitDayState[];
  selectedDay: HabitDayState['logicalDay'];
  saving: boolean;
  logicalDayRolloverHour: number;
  onCycle: () => void;
  onDetails: () => void;
  onOutcome: (outcome: HabitDayOutcome | null) => void;
  onToggleMetricDisplay: () => void;
  metricMode: HabitMetricMode;
}) {
  const { colors } = useAppTheme();
  const [menuAnchor, setMenuAnchor] = useState<HabitMenuAnchor | null>(null);
  const longPressed = useRef(false);
  const rowRef = useRef<View>(null);
  const complete = habitCompleted(state ?? null);
  const outcome = state?.outcome ?? null;
  const accent = habit.color ?? colors.primary;
  const streak = calculateHabitStreak(habit, states, {
    now: selectedDay,
    rolloverHour: logicalDayRolloverHour,
    weekStartsOn: 0,
  });
  const totalDays = habitCompletionCount(states);
  const metricValue = metricMode === 'total-days' ? totalDays : streak.current;
  const metricLabel = metricMode === 'total-days' ? 'Total Days' : 'Current Streak';
  const statusIcon =
    outcome === 'failed' ? 'x' : outcome === 'skipped' ? 'skip-forward' : complete ? 'check' : null;
  const statusBackground = accent;
  const statusColor = getAccessibleTextColor(statusBackground);
  const statusLabel = habitOutcomeLabel(outcome) ?? habitCompletionLabel(state ?? null);
  const menuOpen = menuAnchor !== null;
  const noSelectStyle =
    Platform.OS === 'web'
      ? ({
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        } as unknown as ViewStyle)
      : ({ userSelect: 'none' } as ViewStyle);

  return (
    <View
      collapsable={false}
      ref={rowRef}
      style={[{ position: 'relative', width: '100%', zIndex: menuOpen ? 2 : 1 }, noSelectStyle]}
      testID={`habit-card-${habit.id}`}
    >
      <Pressable
        accessibilityHint="Cycles this habit through not done, done, failed, and skipped. Long press for more actions."
        accessibilityLabel={`${habit.name}. ${statusLabel}. ${metricValue} ${metricLabel.toLowerCase()}. Signals: ${habitSignalSummary(state ?? null)}.`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: complete, disabled: saving }}
        accessibilityValue={{ text: statusLabel }}
        delayLongPress={500}
        disabled={saving}
        onLongPress={() => {
          longPressed.current = true;
          rowRef.current?.measureInWindow((x, y, width, height) => {
            setMenuAnchor({ height, width, x, y });
          });
        }}
        onPress={() => {
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          onCycle();
        }}
        style={({ pressed }) => ({
          alignItems: 'center',
          ...getRowSurfaceStyle({
            backgroundColor: colors.surface,
          }),
          flexDirection: 'row',
          minHeight: HABIT_ROW_MIN_HEIGHT,
          opacity: saving ? 0.55 : pressed ? 0.72 : 1,
          paddingHorizontal: ROW_SURFACE_PADDING_HORIZONTAL,
          paddingVertical: 0,
          userSelect: 'none',
          width: '100%',
          ...(Platform.OS === 'web'
            ? ({
                WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none',
              } as unknown as ViewStyle)
            : null),
        })}
        testID={`toggle-habit-${habit.id}`}
      >
        <Row
          alignment="center"
          spacing={ROW_SURFACE_CONTENT_GAP}
          style={{ height: HABIT_ROW_MIN_HEIGHT, width: '100%' }}
        >
          <Pressable
            accessibilityHint="Cycles this habit through not done, done, failed, and skipped"
            accessibilityLabel={`${habit.name}, ${statusLabel}`}
            accessibilityValue={{ text: statusLabel }}
            accessibilityRole="button"
            accessibilityState={{ disabled: saving }}
            disabled={saving}
            onPress={(event) => {
              event.stopPropagation();
              onCycle();
            }}
            style={({ pressed }) => ({
              alignItems: 'center',
              backgroundColor: statusBackground,
              borderRadius: 8,
              height: ROW_SURFACE_ICON_SIZE,
              justifyContent: 'center',
              opacity: saving ? 0.55 : pressed ? 0.72 : 1,
              width: ROW_SURFACE_ICON_SIZE,
            })}
            testID={`status-habit-${habit.id}`}
          >
            {statusIcon ? (
              <AppIcon
                accessibilityLabel={statusLabel}
                color={statusColor}
                name={statusIcon}
                size={20}
                strokeWidth={2.5}
              />
            ) : null}
          </Pressable>
          <View
            style={{
              flex: 1,
              height: HABIT_ROW_TEXT_BLOCK_HEIGHT,
              justifyContent: 'center',
              minWidth: 0,
            }}
          >
            <Text
              numberOfLines={1}
              textStyle={{ color: colors.text, fontSize: 17, fontWeight: '600', lineHeight: 22 }}
            >
              {habit.name}
            </Text>
            <Text
              numberOfLines={1}
              textStyle={{ color: colors.textMuted, fontSize: 12, lineHeight: 16 }}
            >
              {statusLabel}
            </Text>
          </View>
          <Pressable
            accessibilityHint="Toggles all visible habits between current streak and total days"
            accessibilityLabel={`${metricLabel}: ${metricValue}`}
            accessibilityRole="button"
            accessibilityState={{ disabled: saving }}
            accessibilityValue={{ text: String(metricValue) }}
            disabled={saving}
            onPress={(event) => {
              event.stopPropagation();
              onToggleMetricDisplay();
            }}
            style={{
              alignItems: 'flex-end',
              alignSelf: 'stretch',
              flexShrink: 0,
              justifyContent: 'center',
              marginLeft: 'auto',
              minWidth: HABIT_ROW_STREAK_WIDTH,
              width: HABIT_ROW_STREAK_WIDTH,
            }}
            testID={`toggle-habit-metric-${habit.id}`}
          >
            <Text
              numberOfLines={1}
              textStyle={{ color: colors.text, fontSize: 17, fontWeight: '600', lineHeight: 22 }}
            >
              {String(metricValue)}
            </Text>
            <Text
              numberOfLines={1}
              textStyle={{ color: colors.textMuted, fontSize: 12, lineHeight: 16 }}
            >
              {metricLabel}
            </Text>
          </Pressable>
        </Row>
      </Pressable>
      {menuAnchor ? (
        <HabitActionMenu
          anchor={menuAnchor}
          onClose={() => setMenuAnchor(null)}
          testID={`habit-actions-${habit.id}`}
        >
          <HabitAction
            label={outcome === 'done' ? 'Clear done' : 'Mark done'}
            onPress={() => {
              setMenuAnchor(null);
              onOutcome(outcome === 'done' ? null : 'done');
            }}
            testID={`habit-action-done-${habit.id}`}
          />
          <HabitAction
            label={outcome === 'failed' ? 'Clear failed' : 'Mark failed (X)'}
            onPress={() => {
              setMenuAnchor(null);
              onOutcome(outcome === 'failed' ? null : 'failed');
            }}
            testID={`habit-action-failed-${habit.id}`}
          />
          <HabitAction
            label={outcome === 'skipped' ? 'Clear skipped' : 'Skip day'}
            onPress={() => {
              setMenuAnchor(null);
              onOutcome(outcome === 'skipped' ? null : 'skipped');
            }}
            testID={`habit-action-skipped-${habit.id}`}
          />
          <HabitAction
            label="View details"
            onPress={() => {
              setMenuAnchor(null);
              onDetails();
            }}
            testID={`habit-action-details-${habit.id}`}
          />
        </HabitActionMenu>
      ) : null}
    </View>
  );
}

function HabitAction({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
        borderRadius: 8,
        minHeight: 42,
        justifyContent: 'center',
        paddingHorizontal: 10,
      })}
      testID={testID}
    >
      <NativeText selectable={false} style={{ color: colors.text, fontSize: 14 }}>
        {label}
      </NativeText>
    </Pressable>
  );
}

function HabitActionMenu({
  anchor,
  children,
  onClose,
  testID,
}: {
  anchor: HabitMenuAnchor;
  children: ReactNode;
  onClose: () => void;
  testID: string;
}) {
  const { colors } = useAppTheme();
  const { width: viewportWidth } = useWindowDimensions();
  const maxLeft = Math.max(8, viewportWidth - HABIT_MENU_WIDTH - 8);
  const left = Math.min(Math.max(anchor.x + anchor.width - HABIT_MENU_WIDTH, 8), maxLeft);
  const top = Math.max(8, anchor.y - HABIT_MENU_HEIGHT - 8);

  return (
    <Modal animationType="fade" transparent visible onRequestClose={onClose}>
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <Pressable
          accessibilityLabel="Close habit actions"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={{
            backgroundColor: colors.surface,
            boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.18)',
            borderColor: colors.border,
            borderRadius: 12,
            borderWidth: 1,
            elevation: 12,
            left,
            padding: 5,
            position: 'absolute',
            top,
            width: HABIT_MENU_WIDTH,
            zIndex: 10,
          }}
          testID={testID}
        >
          {children}
        </View>
      </View>
    </Modal>
  );
}
