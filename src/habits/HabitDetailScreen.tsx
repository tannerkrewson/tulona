import { Column, Row, Text } from '@expo/ui';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import {
  shiftLogicalDay,
  type CatalogCollection,
  type Habit,
  type HabitDayState,
  type LogicalDayKey,
} from '@domain';
import { AppIcon, normalizeIconName } from '@icons';
import { useAppTheme } from '@theme';
import { AppButton, errorText, Screen } from '@ui';

import { HabitErrorMessage } from './HabitErrorMessage';
import { formatHabitSchedule, habitCompletionLabel, habitSignalSummary } from './habit-format';
import { loadHabitStore } from './habit-runtime';
import { calculateHabitStreak } from './streak';
import type { HabitStore } from './habit-store';
import { isHabitScheduledDay } from './schedule';

function recentDays(end: LogicalDayKey, count: number, rolloverHour: number): LogicalDayKey[] {
  return Array.from({ length: count }, (_, index) =>
    shiftLogicalDay(end, index - count + 1, { rolloverHour })
  );
}

function triggerName(habit: Habit, catalog: CatalogCollection | null): string | null {
  if (!habit.trigger) return null;
  const id =
    habit.trigger.kind === 'tracked-time'
      ? habit.trigger.activityId
      : habit.trigger.kind === 'folder-time'
        ? habit.trigger.folderId
        : habit.trigger.routineId;
  const source =
    habit.trigger.kind === 'tracked-time'
      ? catalog?.activities.find((activity) => activity.id === id)?.name
      : habit.trigger.kind === 'folder-time'
        ? catalog?.folders.find((folder) => folder.id === id)?.name
        : catalog?.routines.find((routine) => routine.id === id)?.name;
  const kind =
    habit.trigger.kind === 'tracked-time'
      ? 'Activity time'
      : habit.trigger.kind === 'folder-time'
        ? 'Folder time'
        : 'Routine time';
  const seconds = habit.trigger.minimumSeconds ?? (habit.trigger.minimumMs ?? 1000) / 1000;
  return `${kind}: ${source ?? 'Unavailable source'} · ${seconds} second${seconds === 1 ? '' : 's'} minimum`;
}

export interface HabitDetailScreenProps {
  id: string;
}

export function HabitDetailScreen({ id }: HabitDetailScreenProps) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const [store, setStore] = useState<HabitStore | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void loadHabitStore()
      .then((nextStore) => {
        if (!nextStore.getState().habits.some((habit) => habit.id === id)) {
          throw new Error('Habit not found');
        }
        if (!cancelled) setStore(() => nextStore);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(errorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, [id, version]);

  if (!store) {
    return (
      <Screen title="Habit details">
        <HabitErrorMessage
          message={loadError}
          onBack={() => router.back()}
          onRetry={() => {
            setLoadError(null);
            setVersion((current) => current + 1);
          }}
        />
        <Text
          textStyle={{
            color: loadError ? colors.danger.foreground : colors.textMuted,
            fontSize: 15,
          }}
        >
          {loadError ?? 'Loading habit details...'}
        </Text>
      </Screen>
    );
  }

  return <HabitDetailContent id={id} store={store} />;
}

function HabitDetailContent({ id, store }: { id: string; store: HabitStore }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const habit = store((state) => state.habits.find((candidate) => candidate.id === id));
  const states = store((state) => state.states);
  const today = store((state) => state.today);
  const logicalDayRolloverHour = store((state) => state.logicalDayRolloverHour);
  const weekStartsOn = store((state) => state.weekStartsOn);
  const catalog = store((state) => state.catalog);
  const busy = store((state) => state.saving);
  const persistenceError = store((state) => state.persistenceError);
  const lastAction = useRef<(() => Promise<unknown>) | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  if (!habit) {
    return (
      <Screen title="Habit details">
        <HabitErrorMessage message="Habit not found" onBack={() => router.back()} />
      </Screen>
    );
  }

  const habitStates = states.filter((state) => state.habitId === habit.id);
  const currentState = habitStates.find((state) => state.logicalDay === today) ?? null;
  const streak = calculateHabitStreak(habit, habitStates, {
    now: today,
    rolloverHour: logicalDayRolloverHour,
    weekStartsOn,
  });
  const unit = habit.schedule.kind === 'weekly-count' ? 'week' : 'day';
  const archived = habit.archivedAt !== null;

  const changeArchiveState = async () => {
    const action = async () => {
      if (archived) await store.getState().restoreHabit(habit.id);
      else await store.getState().archiveHabit(habit.id);
    };
    lastAction.current = action;
    try {
      await action();
    } catch {
      // The store retains the persistence error for the visible banner.
    }
  };

  return (
    <Screen title={habit.name} description={formatHabitSchedule(habit.schedule)}>
      <Column spacing={16} style={{ width: '100%' }}>
        <HabitErrorMessage
          message={persistenceError ? errorText(persistenceError) : null}
          onBack={() => router.back()}
          onRetry={() => {
            const action = lastAction.current;
            void (action ? action() : store.getState().refresh()).catch(() => undefined);
          }}
        />
        <Column spacing={8} style={{ width: '100%' }}>
          <AppButton
            label="Back to habits"
            onPress={() => router.back()}
            style={{ height: 48, width: '100%' }}
            testID="back-to-habits"
            variant="outlined"
          />
          <AppButton
            label="Edit"
            onPress={() => router.push(`/habit/${habit.id}?edit=1`)}
            style={{ height: 50, width: '100%' }}
            testID="edit-habit"
          />
        </Column>
        {archived ? (
          <Column
            spacing={4}
            style={{
              backgroundColor: colors.warning.background,
              borderColor: colors.warning.foreground,
              borderRadius: 12,
              borderWidth: 1,
              padding: 14,
              width: '100%',
            }}
          >
            <Text textStyle={{ color: colors.warning.foreground, fontSize: 15, fontWeight: '700' }}>
              Archived habit
            </Text>
            <Text textStyle={{ color: colors.warning.foreground, fontSize: 14 }}>
              It is hidden from the active list until restored.
            </Text>
          </Column>
        ) : null}
        <Column
          spacing={12}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 18,
            borderWidth: 1,
            padding: 18,
            width: '100%',
          }}
        >
          <Row alignment="center" spacing={12}>
            <Column
              alignment="center"
              style={{
                backgroundColor: colors.surfaceMuted,
                borderRadius: 16,
                height: 56,
                width: 56,
              }}
            >
              <AppIcon
                color={habit.color ?? colors.primary}
                name={normalizeIconName(habit.iconName, 'heart')}
                size={28}
              />
            </Column>
            <Column spacing={4}>
              <Text
                numberOfLines={2}
                textStyle={{ color: colors.text, fontSize: 22, fontWeight: '700' }}
              >
                {habit.name}
              </Text>
              <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
                {habit.description ?? 'No description added.'}
              </Text>
            </Column>
          </Row>
          <Row alignment="center" spacing={8} style={{ width: '100%' }}>
            <AppIcon
              color={
                currentState?.manual === true || currentState?.automatic === true
                  ? colors.success.foreground
                  : colors.textMuted
              }
              name={
                currentState?.manual === true || currentState?.automatic === true
                  ? 'check-circle-2'
                  : 'circle'
              }
              size={19}
            />
            <Text textStyle={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
              {`Today: ${habitCompletionLabel(currentState)}`}
            </Text>
          </Row>
          <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
            {`Signals: ${habitSignalSummary(currentState)}`}
          </Text>
          {habit.trigger ? (
            <Text textStyle={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
              {triggerName(habit, catalog) ?? 'Configured trigger source is unavailable.'}
            </Text>
          ) : (
            <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
              No automatic trigger configured.
            </Text>
          )}
        </Column>

        <Row alignment="center" spacing={10} style={{ width: '100%' }}>
          <StatCard label={`Current streak (${unit}s)`} value={String(streak.current)} />
          <StatCard label={`Longest streak (${unit}s)`} value={String(streak.longest)} />
        </Row>

        <HistoryGrid
          habit={habit}
          logicalDayRolloverHour={logicalDayRolloverHour}
          states={habitStates}
          today={today}
        />

        {!archived && confirmingArchive ? (
          <ArchiveHabitConfirmation
            busy={busy}
            onCancel={() => setConfirmingArchive(false)}
            onConfirm={() => {
              void changeArchiveState().then(() => setConfirmingArchive(false));
            }}
          />
        ) : null}
        <AppButton
          disabled={busy}
          label={busy ? 'Saving...' : archived ? 'Restore habit' : 'Archive habit'}
          onPress={() => {
            if (archived) void changeArchiveState();
            else setConfirmingArchive(true);
          }}
          style={{ height: 48, width: '100%' }}
          testID={archived ? 'restore-habit' : 'archive-habit'}
          variant={archived ? 'outlined' : 'text'}
        />
      </Column>
    </Screen>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <Column
      spacing={5}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 14,
        borderWidth: 1,
        width: '48%',
        padding: 14,
      }}
    >
      <Text textStyle={{ color: colors.primary, fontSize: 26, fontWeight: '700' }}>{value}</Text>
      <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
    </Column>
  );
}

function ArchiveHabitConfirmation({
  busy,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Column
      spacing={8}
      style={{
        backgroundColor: colors.warning.background,
        borderColor: colors.warning.foreground,
        borderRadius: 14,
        borderWidth: 1,
        padding: 14,
        width: '100%',
      }}
      testID="archive-habit-confirmation"
    >
      <Text textStyle={{ color: colors.warning.foreground, fontSize: 15, fontWeight: '700' }}>
        Archive this habit?
      </Text>
      <Text textStyle={{ color: colors.warning.foreground, fontSize: 14, lineHeight: 20 }}>
        It will be hidden from the active list while its history is retained. You can restore it
        later.
      </Text>
      <Column spacing={8} style={{ width: '100%' }}>
        <AppButton
          disabled={busy}
          label="Yes, archive habit"
          onPress={onConfirm}
          style={{ height: 48, width: '100%' }}
          testID="confirm-archive-habit"
        />
        <AppButton
          disabled={busy}
          label="Keep habit"
          onPress={onCancel}
          style={{ height: 48, width: '100%' }}
          variant="outlined"
        />
      </Column>
    </Column>
  );
}

function HistoryGrid({
  habit,
  states,
  today,
  logicalDayRolloverHour,
}: {
  habit: Habit;
  states: readonly HabitDayState[];
  today: LogicalDayKey;
  logicalDayRolloverHour: number;
}) {
  const { colors } = useAppTheme();
  const days = recentDays(today, 28, logicalDayRolloverHour);
  const stateForDay = (day: LogicalDayKey) =>
    states.find((state) => state.logicalDay === day) ?? null;

  return (
    <Column
      spacing={12}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 18,
        borderWidth: 1,
        padding: 18,
        width: '100%',
      }}
      testID="habit-history"
    >
      <Column spacing={3}>
        <Text textStyle={{ color: colors.text, fontSize: 19, fontWeight: '700' }}>
          Recent history
        </Text>
        <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
          Last 28 days, newest at the bottom.
        </Text>
      </Column>
      {[0, 1, 2, 3].map((week) => (
        <Row alignment="center" key={`history-week-${week}`} spacing={5} style={{ width: '100%' }}>
          {days.slice(week * 7, week * 7 + 7).map((day) => {
            const state = stateForDay(day);
            const complete = state?.manual === true || state?.automatic === true;
            const scheduled = isHabitScheduledDay(habit.schedule, day, {
              rolloverHour: logicalDayRolloverHour,
            });
            return (
              <Column
                alignment="center"
                key={day}
                spacing={3}
                style={{ width: 32 }}
                testID={`habit-history-day-${day}`}
              >
                <Text textStyle={{ color: colors.textMuted, fontSize: 11 }}>{day.slice(8)}</Text>
                <Column
                  alignment="center"
                  style={{
                    backgroundColor: complete
                      ? colors.success.background
                      : !scheduled
                        ? colors.surfaceMuted
                        : colors.inactive.background,
                    borderColor: complete
                      ? colors.success.foreground
                      : !scheduled
                        ? colors.border
                        : colors.border,
                    borderRadius: 9,
                    borderWidth: 1,
                    height: 30,
                    width: 30,
                  }}
                >
                  <AppIcon
                    accessibilityLabel={`${day}: ${complete ? 'Completed' : scheduled ? 'Not completed' : 'Not scheduled'}`}
                    color={complete ? colors.success.foreground : colors.textMuted}
                    name={complete ? 'check' : 'circle'}
                    size={14}
                  />
                </Column>
              </Column>
            );
          })}
        </Row>
      ))}
      <Column spacing={8} style={{ width: '100%' }}>
        <Row alignment="center" spacing={4}>
          <AppIcon color={colors.success.foreground} name="check" size={14} />
          <Text textStyle={{ color: colors.textMuted, fontSize: 12 }}>Completed</Text>
        </Row>
        <Row alignment="center" spacing={4}>
          <AppIcon color={colors.textMuted} name="circle" size={14} />
          <Text textStyle={{ color: colors.textMuted, fontSize: 12 }}>Not completed</Text>
        </Row>
        <Row alignment="center" spacing={4}>
          <AppIcon color={colors.textMuted} name="circle" size={14} />
          <Text textStyle={{ color: colors.textMuted, fontSize: 12 }}>Not scheduled</Text>
        </Row>
      </Column>
    </Column>
  );
}
