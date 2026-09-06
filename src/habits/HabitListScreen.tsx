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

import type { Habit, HabitDayOutcome, HabitDayState, LogicalDayKey } from '@domain';
import { AppIcon } from '@icons';
import { getAccessibleTextColor, useAppTheme } from '@theme';
import { EmptyState, errorText, Screen } from '@ui';

import { HabitErrorMessage } from './HabitErrorMessage';
import { HabitHeader } from './HabitHeader';
import { habitWeekDays, shiftHabitDay, sundayFirstWeekdayLabels } from './date-navigation';
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
  const { colors } = useAppTheme();
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

  const runAction = (action: () => Promise<unknown>) => {
    lastAction.current = action;
    void action().catch(() => undefined);
  };

  return (
    <Screen scrollable={false} testID="habits-screen">
      <Column spacing={14} style={{ width: '100%' }}>
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
        <HabitDayNavigation
          selectedDay={selectedDay}
          today={today}
          rolloverHour={logicalDayRolloverHour}
          onSelectDay={(day) => runAction(() => store.getState().selectDay(day))}
          weekStrip={
            <DateStrip
              selectedDay={selectedDay}
              today={today}
              rolloverHour={logicalDayRolloverHour}
              onSelectDay={(day) => runAction(() => store.getState().selectDay(day))}
            />
          }
        >
          <ScrollView style={{ height: '100%', width: '100%' }}>
            <Column spacing={12} style={{ paddingBottom: 20, width: '100%' }}>
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
                        (candidate) =>
                          candidate.habitId === habit.id && candidate.logicalDay === selectedDay
                      )}
                      states={states.filter((candidate) => candidate.habitId === habit.id)}
                      selectedDay={selectedDay}
                      logicalDayRolloverHour={logicalDayRolloverHour}
                      onDetails={() => router.push(`/habit/${habit.id}`)}
                      onToggle={async () => {
                        await store.getState().toggleManual(habit.id, selectedDay);
                      }}
                      onOutcome={async (outcome) => {
                        await store.getState().setOutcome(habit.id, selectedDay, outcome);
                      }}
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
        </HabitDayNavigation>
      </Column>
    </Screen>
  );
}

const DAY_SWIPE_THRESHOLD = 45;
const DAY_SWIPE_SETTLE_DURATION = 180;
const HABIT_MENU_WIDTH = 220;
const HABIT_MENU_HEIGHT = 190;

interface HabitMenuAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

function HabitDayNavigation({
  selectedDay,
  today,
  rolloverHour,
  onSelectDay,
  weekStrip,
  children,
}: {
  selectedDay: LogicalDayKey;
  today: LogicalDayKey;
  rolloverHour: number;
  onSelectDay: (day: LogicalDayKey) => void;
  weekStrip: ReactNode;
  children: ReactNode;
}) {
  const { colors } = useAppTheme();
  const { width: viewportWidth } = useWindowDimensions();
  const [stripWidth, setStripWidth] = useState(0);
  const [dragX] = useState(() => new Animated.Value(0));
  const useNativeDriver = Platform.OS !== 'web';

  const settle = useCallback(
    (target: number, nextDay?: LogicalDayKey) => {
      dragX.stopAnimation();
      Animated.timing(dragX, {
        duration: DAY_SWIPE_SETTLE_DURATION,
        toValue: target,
        useNativeDriver,
      }).start(({ finished }) => {
        dragX.setValue(0);
        if (finished && nextDay) onSelectDay(nextDay);
      });
    },
    [dragX, onSelectDay, useNativeDriver]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 16 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          Math.abs(gesture.dx) > 16 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: () => {
          dragX.stopAnimation();
          dragX.setValue(0);
        },
        onPanResponderMove: (_, gesture) => {
          dragX.setValue(gesture.dx);
        },
        onPanResponderRelease: (_, gesture) => {
          if (Math.abs(gesture.dx) < DAY_SWIPE_THRESHOLD) {
            settle(0);
            return;
          }

          const amount = gesture.dx < 0 ? 1 : -1;
          const nextDay = shiftHabitDay(selectedDay, amount, rolloverHour);
          if (nextDay > today) {
            settle(0);
            return;
          }

          const distance = Math.max(stripWidth, viewportWidth - 40, 320);
          settle(gesture.dx < 0 ? -distance : distance, nextDay);
        },
        onPanResponderTerminate: () => settle(0),
        onPanResponderTerminationRequest: () => false,
      }),
    [dragX, rolloverHour, selectedDay, settle, stripWidth, today, viewportWidth]
  );

  return (
    <View
      {...panResponder.panHandlers}
      style={{ flex: 1, minHeight: 0, width: '100%' }}
      testID="habit-day-navigation"
    >
      <View
        onLayout={(event) => setStripWidth(event.nativeEvent.layout.width)}
        style={{ backgroundColor: colors.surface, overflow: 'hidden', width: '100%' }}
      >
        <Animated.View
          style={{ transform: [{ translateX: dragX }], width: '100%' }}
          testID="habit-week-strip"
        >
          {weekStrip}
        </Animated.View>
      </View>
      {children}
    </View>
  );
}

function DateStrip({
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
  const days = habitWeekDays(selectedDay, rolloverHour);

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderBottomColor: colors.border,
        borderBottomWidth: 1,
        paddingBottom: 10,
        paddingTop: 2,
        width: '100%',
      }}
    >
      <Row alignment="center" spacing={2} style={{ width: '100%' }}>
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
    </View>
  );
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
  onToggle: () => Promise<void>;
  onDetails: () => void;
  onOutcome: (outcome: HabitDayOutcome | null) => Promise<void>;
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

  return (
    <View
      collapsable={false}
      ref={rowRef}
      style={{ position: 'relative', width: '100%', zIndex: menuOpen ? 2 : 1 }}
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
          void onToggle();
        }}
        style={({ pressed }) => ({
          alignItems: 'center',
          backgroundColor:
            outcome === 'skipped'
              ? colors.surfaceMuted
              : complete
                ? colors.success.background
                : colors.surface,
          borderColor: complete ? colors.success.foreground : colors.border,
          borderRadius: 14,
          borderWidth: 1,
          flexDirection: 'row',
          minHeight: 72,
          opacity: saving ? 0.55 : pressed ? 0.72 : 1,
          paddingHorizontal: 12,
          paddingVertical: 10,
          width: '100%',
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
              void onToggle();
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
              void onOutcome(outcome === 'done' ? null : 'done');
            }}
            testID={`habit-action-done-${habit.id}`}
          />
          <HabitAction
            label={outcome === 'failed' ? 'Clear failed' : 'Mark failed (X)'}
            onPress={() => {
              setMenuAnchor(null);
              void onOutcome(outcome === 'failed' ? null : 'failed');
            }}
            testID={`habit-action-failed-${habit.id}`}
          />
          <HabitAction
            label={outcome === 'skipped' ? 'Clear skipped' : 'Skip day'}
            onPress={() => {
              setMenuAnchor(null);
              void onOutcome(outcome === 'skipped' ? null : 'skipped');
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
