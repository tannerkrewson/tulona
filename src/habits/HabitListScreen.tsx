import { Column, Row, ScrollView, Text } from '@expo/ui';
import { useIsFocused, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, View } from 'react-native';

import type { Habit, HabitDayOutcome, HabitDayState, LogicalDayKey } from '@domain';
import { AppIcon, normalizeIconName } from '@icons';
import { getAccessibleTextColor, useAppTheme } from '@theme';
import { EmptyState, errorText, Screen } from '@ui';

import { HabitErrorMessage } from './HabitErrorMessage';
import { HabitHeader } from './HabitHeader';
import {
  habitWeekDays,
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
        <DateStrip
          selectedDay={selectedDay}
          today={today}
          rolloverHour={logicalDayRolloverHour}
          onSelectDay={(day) => runAction(() => store.getState().selectDay(day))}
          onSwipe={(amount) => {
            const nextDay = shiftHabitWeek(selectedDay, amount, logicalDayRolloverHour);
            if (nextDay <= today) {
              runAction(() => store.getState().selectDay(nextDay));
            }
          }}
        />
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
      </Column>
    </Screen>
  );
}

function DateStrip({
  selectedDay,
  today,
  rolloverHour,
  onSelectDay,
  onSwipe,
}: {
  selectedDay: LogicalDayKey;
  today: LogicalDayKey;
  rolloverHour: number;
  onSelectDay: (day: LogicalDayKey) => void;
  onSwipe: (amount: -1 | 1) => void;
}) {
  const { colors } = useAppTheme();
  const days = habitWeekDays(selectedDay, rolloverHour);
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 16 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderRelease: (_, gesture) => {
          if (Math.abs(gesture.dx) >= 45) onSwipe(gesture.dx < 0 ? 1 : -1);
        },
      }),
    [onSwipe]
  );

  return (
    <View
      {...panResponder.panHandlers}
      style={{
        backgroundColor: colors.surface,
        borderBottomColor: colors.border,
        borderBottomWidth: 1,
        paddingBottom: 10,
        paddingTop: 2,
        width: '100%',
      }}
      testID="habit-week-strip"
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
  const [menuOpen, setMenuOpen] = useState(false);
  const longPressed = useRef(false);
  const complete = habitCompleted(state ?? null);
  const outcome = state?.outcome ?? null;
  const accent = habit.color ?? colors.primary;
  const accentForeground = getAccessibleTextColor(accent);
  const streak = calculateHabitStreak(habit, states, {
    now: selectedDay,
    rolloverHour: logicalDayRolloverHour,
    weekStartsOn: 0,
  });
  const statusIcon =
    outcome === 'failed'
      ? 'x'
      : outcome === 'skipped'
        ? 'skip-forward'
        : complete
          ? 'check'
          : null;
  const statusColor =
    outcome === 'failed'
      ? colors.danger.foreground
      : outcome === 'skipped'
        ? colors.textMuted
        : complete
          ? colors.success.foreground
          : colors.textMuted;
  const statusLabel = habitOutcomeLabel(outcome) ?? habitCompletionLabel(state ?? null);

  return (
    <View
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
          setMenuOpen(true);
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
          <View
            style={{
              alignItems: 'center',
              backgroundColor: complete ? colors.success.background : 'transparent',
              borderColor: statusColor,
              borderRadius: 8,
              borderWidth: 2,
              height: 40,
              justifyContent: 'center',
              width: 40,
            }}
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
          </View>
          <View
            style={{
              alignItems: 'center',
              backgroundColor: accent,
              borderRadius: 10,
              height: 40,
              justifyContent: 'center',
              width: 40,
            }}
          >
            <AppIcon
              accessibilityLabel={`${habit.name} icon`}
              color={accentForeground}
              name={normalizeIconName(habit.iconName, 'heart')}
              size={20}
            />
          </View>
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
      {menuOpen ? (
        <View
          style={{
            position: 'absolute',
            right: 0,
            top: 76,
            width: 220,
            zIndex: 10,
          }}
        >
          <Column
            spacing={2}
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: 12,
              borderWidth: 1,
              padding: 5,
              width: '100%',
            }}
            testID={`habit-actions-${habit.id}`}
          >
            <HabitAction
              label={outcome === 'done' ? 'Clear done' : 'Mark done'}
              onPress={() => {
                setMenuOpen(false);
                void onOutcome(outcome === 'done' ? null : 'done');
              }}
              testID={`habit-action-done-${habit.id}`}
            />
            <HabitAction
              label={outcome === 'failed' ? 'Clear failed' : 'Mark failed (X)'}
              onPress={() => {
                setMenuOpen(false);
                void onOutcome(outcome === 'failed' ? null : 'failed');
              }}
              testID={`habit-action-failed-${habit.id}`}
            />
            <HabitAction
              label={outcome === 'skipped' ? 'Clear skipped' : 'Skip day'}
              onPress={() => {
                setMenuOpen(false);
                void onOutcome(outcome === 'skipped' ? null : 'skipped');
              }}
              testID={`habit-action-skipped-${habit.id}`}
            />
            <HabitAction
              label="View details"
              onPress={onDetails}
              testID={`habit-action-details-${habit.id}`}
            />
          </Column>
        </View>
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
      <Text textStyle={{ color: colors.text, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}
