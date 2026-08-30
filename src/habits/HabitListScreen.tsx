import { Button, Column, Row, Text } from '@expo/ui';
import { useIsFocused, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import type { Habit, HabitDayState } from '@domain';
import { AppIcon, normalizeIconName } from '@icons';
import { useAppTheme } from '@theme';
import { EmptyState, Screen } from '@ui';

import { HabitErrorMessage } from './HabitErrorMessage';
import { formatHabitSchedule, habitCompletionLabel, habitSignalSummary } from './habit-format';
import { loadHabitStore } from './habit-runtime';
import { calculateHabitStreak } from './streak';
import type { HabitStore } from './habit-store';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function HabitListScreen() {
  const { colors } = useAppTheme();
  const focused = useIsFocused();
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
      <Screen title="Habits" description="Small actions, kept visible and on your device.">
        <HabitErrorMessage message={loadError} />
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
  const activeHabits = habits
    .filter((habit) => habit.archivedAt === null)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const archivedCount = habits.filter((habit) => habit.archivedAt !== null).length;

  return (
    <Screen title="Habits" description="One tap to mark today. Automatic evidence stays separate.">
      <Column spacing={14} style={{ width: '100%' }}>
        <HabitErrorMessage message={persistenceError?.message ?? null} />
        <Row alignment="center" spacing={10} style={{ width: '100%' }}>
          <Column spacing={3} style={{ width: '65%' }}>
            <Text textStyle={{ color: colors.text, fontSize: 21, fontWeight: '700' }}>Today</Text>
            <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>{today}</Text>
          </Column>
          <Button label="New habit" onPress={() => router.push('/habit/new')} testID="new-habit" />
        </Row>
        {activeHabits.length === 0 ? (
          <EmptyState
            actionLabel="Create your first habit"
            description="Start with something small and repeatable. You can add an automatic trigger later."
            iconName="heart"
            onAction={() => router.push('/habit/new')}
            testID="habits-empty"
            title="No active habits yet"
          />
        ) : (
          activeHabits.map((habit) => (
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
                try {
                  await store.getState().toggleManual(habit.id, today);
                } catch {
                  // The store retains the persistence error for the visible banner.
                }
              }}
            />
          ))
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
  const manualMarked = state?.manual === true;
  const toggleLabel = manualMarked ? 'Clear manual mark' : 'Mark complete manually';

  return (
    <Column
      spacing={12}
      style={{
        backgroundColor: colors.surface,
        borderColor: complete ? accent : colors.border,
        borderRadius: 16,
        borderWidth: complete ? 2 : 1,
        padding: 16,
        width: '100%',
      }}
      testID={`habit-card-${habit.id}`}
    >
      <Row alignment="center" spacing={12} style={{ width: '100%' }}>
        <Column
          alignment="center"
          style={{
            backgroundColor: complete ? colors.success.background : colors.surfaceMuted,
            borderRadius: 14,
            height: 48,
            width: 48,
          }}
        >
          <AppIcon
            color={complete ? colors.success.foreground : accent}
            name={normalizeIconName(habit.iconName, 'heart')}
            size={24}
          />
        </Column>
        <Column spacing={4} style={{ width: '75%' }}>
          <Text textStyle={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>
            {habit.name}
          </Text>
          <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
            {formatHabitSchedule(habit.schedule)}
          </Text>
        </Column>
      </Row>
      <Row alignment="center" spacing={8} style={{ width: '100%' }}>
        <AppIcon
          accessibilityLabel={complete ? 'Completed' : 'Not completed'}
          color={complete ? colors.success.foreground : colors.textMuted}
          name={complete ? 'check-circle-2' : 'circle'}
          size={18}
        />
        <Text
          textStyle={{
            color: complete ? colors.success.foreground : colors.textMuted,
            fontSize: 14,
          }}
        >
          {habitCompletionLabel(state ?? null)}
        </Text>
      </Row>
      <Row alignment="center" spacing={8} style={{ width: '100%' }}>
        <AppIcon color={colors.primary} name="flame" size={17} />
        <Text textStyle={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>
          {`${streak.current} ${streakUnit}${streak.current === 1 ? '' : 's'} current streak`}
        </Text>
        <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>
          {`Signals: ${habitSignalSummary(state ?? null)}`}
        </Text>
      </Row>
      <Column spacing={8} style={{ width: '100%' }}>
        <Button
          disabled={saving}
          label={saving ? 'Saving...' : toggleLabel}
          onPress={() => void onToggle()}
          style={{ height: 48, width: '100%' }}
          testID={`toggle-habit-${habit.id}`}
        />
        <Button
          label="View details"
          onPress={onDetails}
          style={{ height: 46, width: '100%' }}
          testID={`details-habit-${habit.id}`}
          variant="outlined"
        />
      </Column>
    </Column>
  );
}
