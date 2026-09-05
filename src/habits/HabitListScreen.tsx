import { Column, Text } from '@expo/ui';
import { useIsFocused, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import type { Habit, HabitDayState } from '@domain';
import { AppIcon, normalizeIconName } from '@icons';
import { useAppTheme } from '@theme';
import { EmptyState, errorText, Screen } from '@ui';

import { HabitErrorMessage } from './HabitErrorMessage';
import { HabitHeader } from './HabitHeader';
import { formatHabitSchedule, habitCompletionLabel, habitSignalSummary } from './habit-format';
import { loadHabitStore } from './habit-runtime';
import { calculateHabitStreak } from './streak';
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
  const logicalDayRolloverHour = store((state) => state.logicalDayRolloverHour);
  const weekStartsOn = store((state) => state.weekStartsOn);
  const saving = store((state) => state.saving);
  const persistenceError = store((state) => state.persistenceError);
  const lastAction = useRef<(() => Promise<unknown>) | null>(null);
  const activeHabits = habits
    .filter((habit) => habit.archivedAt === null)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const archivedCount = habits.filter((habit) => habit.archivedAt !== null).length;

  return (
    <Screen testID="habits-screen">
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
            void (action ? action() : store.getState().refresh()).catch(() => undefined);
          }}
        />
        <Column spacing={3}>
          <Text textStyle={{ color: colors.text, fontSize: 21, fontWeight: '700' }}>Today</Text>
          <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>{today}</Text>
        </Column>
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
                  (candidate) => candidate.habitId === habit.id && candidate.logicalDay === today
                )}
                states={states.filter((candidate) => candidate.habitId === habit.id)}
                today={today}
                logicalDayRolloverHour={logicalDayRolloverHour}
                weekStartsOn={weekStartsOn}
                onDetails={() => router.push(`/habit/${habit.id}`)}
                onToggle={async () => {
                  const action = () => store.getState().toggleManual(habit.id, today);
                  lastAction.current = action;
                  try {
                    await action();
                  } catch {
                    // The store retains the persistence error for the visible banner.
                  }
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
    </Screen>
  );
}

function HabitListItem({
  habit,
  state,
  states,
  today,
  saving,
  logicalDayRolloverHour,
  weekStartsOn,
  onToggle,
  onDetails,
}: {
  habit: Habit;
  state: HabitDayState | undefined;
  states: HabitDayState[];
  today: HabitDayState['logicalDay'];
  saving: boolean;
  logicalDayRolloverHour: number;
  weekStartsOn: number;
  onToggle: () => Promise<void>;
  onDetails: () => void;
}) {
  const { colors } = useAppTheme();
  const complete = state?.manual === true || state?.automatic === true;
  const accent = habit.color ?? colors.primary;
  const streak = calculateHabitStreak(habit, states, {
    now: today,
    rolloverHour: logicalDayRolloverHour,
    weekStartsOn,
  });
  const streakUnit = habit.schedule.kind === 'weekly-count' ? 'week' : 'day';

  return (
    <View
      style={{ alignItems: 'center', flexDirection: 'row', gap: 6, width: '100%' }}
      testID={`habit-card-${habit.id}`}
    >
      <Pressable
        accessibilityHint="Toggles today’s manual completion"
        accessibilityLabel={`${habit.name}. ${habitCompletionLabel(state ?? null)}. ${formatHabitSchedule(habit.schedule)}. ${streak.current} ${streakUnit}${streak.current === 1 ? '' : 's'} current streak. Signals: ${habitSignalSummary(state ?? null)}.`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: complete, disabled: saving }}
        disabled={saving}
        onPress={() => void onToggle()}
        style={{
          alignItems: 'center',
          backgroundColor: complete ? colors.success.background : colors.surface,
          borderColor: complete ? accent : colors.border,
          borderRadius: 12,
          borderWidth: 1,
          flex: 1,
          height: 56,
          justifyContent: 'center',
          paddingHorizontal: 12,
        }}
        testID={`toggle-habit-${habit.id}`}
      >
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 9, width: '100%' }}>
          <AppIcon
            accessibilityLabel={complete ? 'Completed' : 'Not completed'}
            color={complete ? colors.success.foreground : colors.textMuted}
            name={complete ? 'check-circle-2' : 'circle'}
            size={22}
          />
          <AppIcon
            accessibilityLabel={`${habit.name} icon`}
            color={complete ? colors.success.foreground : accent}
            name={normalizeIconName(habit.iconName, 'heart')}
            size={20}
          />
          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={1}
              textStyle={{ color: colors.text, fontSize: 16, fontWeight: '700' }}
            >
              {habit.name}
            </Text>
          </View>
          <View style={{ width: '28%' }}>
            <Text
              numberOfLines={1}
              textStyle={{ color: colors.textMuted, fontSize: 12, textAlign: 'right' }}
            >
              {formatHabitSchedule(habit.schedule)}
            </Text>
          </View>
        </View>
      </Pressable>
      <Pressable
        accessibilityHint="Opens habit details"
        accessibilityLabel={`View details for ${habit.name}`}
        accessibilityRole="button"
        onPress={onDetails}
        style={{ alignItems: 'center', height: 56, justifyContent: 'center', width: 42 }}
        testID={`details-habit-${habit.id}`}
      >
        <AppIcon color={colors.textMuted} name="chevron-right" size={20} />
      </Pressable>
    </View>
  );
}
