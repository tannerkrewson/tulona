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
import type { ViewStyle } from 'react-native';

import type { Habit, HabitDayOutcome, HabitDayState, LogicalDayKey } from '@domain';
import { AppIcon } from '@icons';
import { getAccessibleTextColor, useAppTheme } from '@theme';
import { EmptyState, errorText, getRowSurfaceStyle, Screen } from '@ui';

import { HabitErrorMessage } from './HabitErrorMessage';
import { HabitHeader } from './HabitHeader';
import {
  habitDaySwipeTarget,
  habitWeekDays,
  habitWeekSwipeTarget,
  shiftHabitWeek,
  sundayFirstWeekdayLabels,
} from './date-navigation';
import { habitCompletionLabel, habitOutcomeLabel, habitSignalSummary } from './habit-format';
import { loadHabitStore } from './habit-runtime';
import { calculateHabitStreak, habitCompleted } from './streak';
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
  const router = useRouter();
  const habits = store((state) => state.habits);
  const states = store((state) => state.states);
  const today = store((state) => state.today);
  const selectedDay = store((state) => state.selectedDay);
  const logicalDayRolloverHour = store((state) => state.logicalDayRolloverHour);
  const saving = store((state) => state.saving);
  const persistenceError = store((state) => state.persistenceError);
  const lastAction = useRef<(() => Promise<unknown>) | null>(null);
  const activeHabits = habits
    .filter((habit) => habit.archivedAt === null)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const archivedCount = habits.filter((habit) => habit.archivedAt !== null).length;

  const runAction = useCallback((action: () => Promise<unknown>) => {
    lastAction.current = action;
    void action().catch(() => undefined);
  }, []);

  const selectDay = useCallback(
    (day: LogicalDayKey) => runAction(() => store.getState().selectDay(day)),
    [runAction, store]
  );

  const renderDay = (day: LogicalDayKey) => (
    <HabitDayList
      activeHabits={activeHabits}
      archivedCount={archivedCount}
      day={day}
      logicalDayRolloverHour={logicalDayRolloverHour}
      onDetails={(habitId) => router.push(`/habit/${habitId}`)}
      onOutcome={(habitId, outcome) =>
        runAction(() => store.getState().setOutcome(habitId, day, outcome))
      }
      onToggle={(habitId) => runAction(() => store.getState().toggleManual(habitId, day))}
      saving={saving}
      states={states}
    />
  );

  return (
    <Screen scrollable={false} testID="habits-screen">
      <View style={{ flex: 1, gap: 14, minHeight: 0, width: '100%' }}>
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
        <HabitWeekStrip
          onSelectDay={selectDay}
          rolloverHour={logicalDayRolloverHour}
          selectedDay={selectedDay}
          today={today}
        />
        <HabitDayPager
          onSelectDay={selectDay}
          renderDay={renderDay}
          rolloverHour={logicalDayRolloverHour}
          selectedDay={selectedDay}
          today={today}
        />
      </View>
    </Screen>
  );
}

const DAY_SWIPE_THRESHOLD = 48;
const DAY_SETTLE_DURATION = 200;
const WEEK_SWIPE_THRESHOLD = 40;
const WEEK_SETTLE_DURATION = 180;
const HABIT_MENU_WIDTH = 220;
const HABIT_MENU_HEIGHT = 190;

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
  selectedDay,
  today,
  rolloverHour,
  onSelectDay,
  renderDay,
}: {
  selectedDay: LogicalDayKey;
  today: LogicalDayKey;
  rolloverHour: number;
  onSelectDay: (day: LogicalDayKey) => void;
  renderDay: (day: LogicalDayKey) => ReactNode;
}) {
  const { width: viewportWidth } = useWindowDimensions();
  const [pageWidth, setPageWidth] = useState(0);
  const [dragX] = useState(() => new Animated.Value(0));
  const gestureLock = useRef({ locked: false });
  const useNativeDriver = Platform.OS !== 'web';
  const gestureStyle = webGestureStyle('pan-y');
  const effectiveWidth = pageWidth > 0 ? pageWidth : Math.max(viewportWidth - 40, 280);

  const prevDay = habitDaySwipeTarget(selectedDay, -1, today, rolloverHour) ?? selectedDay;
  const nextTarget = habitDaySwipeTarget(selectedDay, 1, today, rolloverHour);
  const nextDay = nextTarget ?? selectedDay;

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
        onPanResponderMove: (_, gesture) => {
          if (gestureLock.current.locked) return;
          let dx = gesture.dx;
          // Resistance when swiping into a blocked future day.
          if (dx < 0 && !nextTarget) dx /= 3;
          dx = Math.max(-effectiveWidth, Math.min(effectiveWidth, dx));
          dragX.setValue(dx);
        },
        onPanResponderRelease: (_, gesture) => {
          if (gestureLock.current.locked) return;
          if (Math.abs(gesture.dx) < DAY_SWIPE_THRESHOLD) {
            settleTo(0);
            return;
          }
          if (gesture.dx > 0) {
            settleTo(effectiveWidth, prevDay);
            return;
          }
          if (!nextTarget) {
            settleTo(0);
            return;
          }
          settleTo(-effectiveWidth, nextTarget);
        },
        onPanResponderTerminate: () => {
          gestureLock.current.locked = false;
          dragX.setValue(0);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [dragX, effectiveWidth, gestureLock, nextTarget, prevDay, settleTo]
  );

  return (
    <View
      {...panResponder.panHandlers}
      onLayout={(event) => setPageWidth(event.nativeEvent.layout.width)}
      style={[{ flex: 1, minHeight: 0, overflow: 'hidden', width: '100%' }, gestureStyle]}
      testID="habit-day-navigation"
    >
      <Animated.View
        style={{
          flex: 1,
          flexDirection: 'row',
          marginLeft: -effectiveWidth,
          minHeight: 0,
          transform: [{ translateX: dragX }],
          width: effectiveWidth * 3,
        }}
      >
        {[
          { day: prevDay, key: `prev-${prevDay}` },
          { day: selectedDay, key: `current-${selectedDay}` },
          { day: nextDay, key: `next-${nextDay}` },
        ].map(({ day, key }) => (
          <View key={key} style={{ flex: 1, minHeight: 0, width: effectiveWidth }}>
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
        borderColor: colors.border,
        borderRadius: 12,
        borderWidth: 1,
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
              style={{ paddingHorizontal: 4, paddingVertical: 8, width: effectiveWidth }}
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
  archivedCount,
  day,
  logicalDayRolloverHour,
  onDetails,
  onOutcome,
  onToggle,
  saving,
  states,
}: {
  activeHabits: Habit[];
  archivedCount: number;
  day: LogicalDayKey;
  logicalDayRolloverHour: number;
  onDetails: (habitId: string) => void;
  onOutcome: (habitId: string, outcome: HabitDayOutcome | null) => void;
  onToggle: (habitId: string) => void;
  saving: boolean;
  states: HabitDayState[];
}) {
  const { colors } = useAppTheme();
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
                onDetails={() => onDetails(habit.id)}
                onToggle={() => onToggle(habit.id)}
                onOutcome={(outcome) => onOutcome(habit.id, outcome)}
              />
            ))}
          </Column>
        )}
        {archivedCount > 0 ? (
          <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
            {`${archivedCount} archived ${archivedCount === 1 ? 'habit' : 'habits'} remain available from their detail screen.`}
          </Text>
        ) : null}
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
  onToggle,
  onDetails,
  onOutcome,
}: {
  habit: Habit;
  state: HabitDayState | undefined;
  states: HabitDayState[];
  selectedDay: HabitDayState['logicalDay'];
  saving: boolean;
  logicalDayRolloverHour: number;
  onToggle: () => void;
  onDetails: () => void;
  onOutcome: (outcome: HabitDayOutcome | null) => void;
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
  const statusIcon =
    outcome === 'failed' ? 'x' : outcome === 'skipped' ? 'skip-forward' : complete ? 'check' : null;
  const statusBackground =
    outcome === 'failed'
      ? colors.danger.background
      : outcome === 'skipped'
        ? colors.warning.background
        : complete
          ? colors.success.background
          : accent;
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
        accessibilityHint="Toggles this habit for the selected day. Long press for more actions."
        accessibilityLabel={`${habit.name}. ${statusLabel}. ${streak.current} current streak. Signals: ${habitSignalSummary(state ?? null)}.`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: complete, disabled: saving }}
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
          onToggle();
        }}
        style={({ pressed }) => ({
          alignItems: 'center',
          ...getRowSurfaceStyle({
            backgroundColor:
              outcome === 'skipped'
                ? colors.surfaceMuted
                : complete
                  ? colors.success.background
                  : colors.surface,
            borderColor: complete ? colors.success.foreground : colors.border,
          }),
          flexDirection: 'row',
          minHeight: 72,
          opacity: saving ? 0.55 : pressed ? 0.72 : 1,
          paddingHorizontal: 12,
          paddingVertical: 10,
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
        <Row alignment="center" spacing={12} style={{ width: '100%' }}>
          <Pressable
            accessibilityHint="Toggles this habit for the selected day"
            accessibilityLabel={`${habit.name}, ${statusLabel}`}
            accessibilityRole="button"
            accessibilityState={{ disabled: saving }}
            disabled={saving}
            onPress={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            style={({ pressed }) => ({
              alignItems: 'center',
              backgroundColor: statusBackground,
              borderColor: statusBackground,
              borderRadius: 8,
              borderWidth: 1,
              height: 40,
              justifyContent: 'center',
              opacity: saving ? 0.55 : pressed ? 0.72 : 1,
              width: 40,
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
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              textStyle={{ color: colors.text, fontSize: 17, fontWeight: '600' }}
            >
              {habit.name}
            </Text>
            {outcome ? (
              <View style={{ marginTop: 2 }}>
                <Text numberOfLines={1} textStyle={{ color: colors.textMuted, fontSize: 12 }}>
                  {statusLabel}
                </Text>
              </View>
            ) : null}
          </View>
          <Column alignment="end" spacing={0} style={{ width: 82 }}>
            <Text textStyle={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>
              {String(streak.current)}
            </Text>
            <Text textStyle={{ color: colors.textMuted, fontSize: 11 }}>Current Streak</Text>
          </Column>
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
            borderColor: colors.border,
            borderRadius: 12,
            borderWidth: 1,
            elevation: 12,
            left,
            padding: 5,
            position: 'absolute',
            shadowColor: '#000000',
            shadowOffset: { height: 4, width: 0 },
            shadowOpacity: 0.18,
            shadowRadius: 10,
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
