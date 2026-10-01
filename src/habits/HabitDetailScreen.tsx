import { Column, Text } from '@ui/primitives';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Text as NativeText, StyleSheet, View } from 'react-native';

import {
  shiftLogicalDay,
  type CatalogCollection,
  type Habit,
  type HabitDayState,
  type LogicalDayKey,
} from '@domain';
import { getAccessibleTextColor, useAppTheme } from '@theme';
import { goBackInAppStack } from '../navigation/app-back';
import { confirmAction, errorText, Form, FormRow, FormSection, Screen, SYSTEM_RED } from '@ui';

import { HabitErrorMessage } from './HabitErrorMessage';
import { HabitHeader } from './HabitHeader';
import { formatHabitSchedule, formatThreshold, habitCompletionLabel } from './habit-format';
import { loadHabitStore } from './habit-runtime';
import { calculateHabitStreak, habitCompleted } from './streak';
import type { HabitStore } from './habit-store';
import { isHabitScheduledDay } from './schedule';

function triggerSummary(habit: Habit, catalog: CatalogCollection | null): string | null {
  if (!habit.trigger) return null;
  const id =
    habit.trigger.kind === 'tracked-time'
      ? habit.trigger.activityId
      : habit.trigger.kind === 'folder-time'
        ? habit.trigger.folderId
        : habit.trigger.routineId;
  const source =
    habit.trigger.kind === 'tracked-time'
      ? [...(catalog?.activities ?? []), ...(catalog?.routines ?? [])].find(
          (item) => item.id === id
        )?.name
      : habit.trigger.kind === 'folder-time'
        ? catalog?.folders.find((folder) => folder.id === id)?.name
        : catalog?.routines.find((routine) => routine.id === id)?.name;
  const seconds = Math.round(
    habit.trigger.minimumSeconds ?? (habit.trigger.minimumMs ?? 1000) / 1000
  );
  if (habit.trigger.kind === 'routine-completion' && seconds <= 1) {
    return `Finishing ${source ?? 'a routine'}`;
  }
  const comparison = habit.trigger.comparison === 'at-most' ? 'or less' : 'or more';
  return `${source ?? 'Unavailable'} · ${formatThreshold(seconds)} ${comparison}`;
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
      <Screen testID="habit-detail-screen">
        <Column spacing={16} style={{ width: '100%' }}>
          <HabitHeader
            onBack={() => goBackInAppStack(router, '/(tabs)/habits')}
            title="Habit details"
            testID="habit-header"
          />
          <HabitErrorMessage
            message={loadError}
            onBack={() => goBackInAppStack(router, '/(tabs)/habits')}
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
        </Column>
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
  const [editMenuOpen, setEditMenuOpen] = useState(false);

  if (!habit) {
    return (
      <Screen testID="habit-detail-screen">
        <Column spacing={16} style={{ width: '100%' }}>
          <HabitHeader
            onBack={() => goBackInAppStack(router, '/(tabs)/habits')}
            title="Habit details"
            testID="habit-header"
          />
          <HabitErrorMessage
            message="Habit not found"
            onBack={() => goBackInAppStack(router, '/(tabs)/habits')}
          />
        </Column>
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
  const accent = habit.color ?? colors.primary;
  const archived = habit.archivedAt !== null;

  const changeArchiveState = async (): Promise<boolean> => {
    const action = async () => {
      if (archived) await store.getState().restoreHabit(habit.id);
      else await store.getState().archiveHabit(habit.id);
    };
    lastAction.current = action;
    try {
      await action();
      return true;
    } catch {
      // The store retains the persistence error for the visible banner.
      return false;
    }
  };

  const confirmArchive = () =>
    void confirmAction({
      confirmLabel: 'Archive',
      message:
        'It’s hidden from your habit list, and its history is kept. You can restore it later.',
      title: `Archive ${habit.name}?`,
    }).then((confirmed) => {
      if (confirmed) void changeArchiveState();
    });
  const done = currentState?.manual === true || currentState?.automatic === true;
  const trigger = triggerSummary(habit, catalog);

  return (
    <Screen testID="habit-detail-screen">
      <Column spacing={16} style={{ width: '100%' }}>
        <HabitHeader
          editActions={[
            {
              label: 'Edit habit',
              onPress: () => router.push(`/habit/${habit.id}?edit=1`),
              systemImage: 'pencil',
              testID: 'edit-habit-menu',
            },
            {
              disabled: busy,
              label: archived ? 'Restore habit' : 'Archive habit',
              onPress: () => {
                if (archived) void changeArchiveState();
                else confirmArchive();
              },
              systemImage: archived ? 'arrow.uturn.backward' : 'archivebox',
              testID: archived ? 'restore-habit' : 'archive-habit',
            },
          ]}
          editOpen={editMenuOpen}
          onBack={() => goBackInAppStack(router, '/(tabs)/habits')}
          onToggleEdit={() => setEditMenuOpen((open) => !open)}
          title={habit.name}
          testID="habit-header"
        />
        <HabitErrorMessage
          message={persistenceError ? errorText(persistenceError) : null}
          onBack={() => goBackInAppStack(router, '/(tabs)/habits')}
          onRetry={() => {
            const action = lastAction.current;
            void (action ? action() : store.getState().refresh()).catch(() => undefined);
          }}
        />
        <Form>
          <FormSection
            footer={
              archived ? 'Archived habits are hidden from your list until restored.' : undefined
            }
          >
            <FormRow
              icon={done ? 'check-circle-2' : 'circle'}
              iconColor={done ? accent : colors.textMuted}
              label="Today"
              subtitle={
                currentState?.outcome == null && currentState?.automatic === true
                  ? 'Completed automatically'
                  : undefined
              }
              value={
                currentState?.outcome == null && done
                  ? 'Done'
                  : habitCompletionLabel(currentState).replace('Not completed', 'Not done')
              }
            />
            <FormRow label="Repeats" value={formatHabitSchedule(habit.schedule)} />
            {trigger ? <FormRow label="Auto-complete" subtitle={trigger} /> : null}
            {archived ? <FormRow label="Status" muted value="Archived" /> : null}
          </FormSection>
          <FormSection>
            <View style={styles.stats}>
              <Stat label="Current streak" unit={unit} value={streak.current} />
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <Stat label="Best streak" unit={unit} value={streak.longest} />
            </View>
          </FormSection>
          <HistoryCalendar
            accent={accent}
            habit={habit}
            logicalDayRolloverHour={logicalDayRolloverHour}
            states={habitStates}
            today={today}
            weekStartsOn={weekStartsOn}
          />
        </Form>
      </Column>
    </Screen>
  );
}

function Stat({ label, unit, value }: { label: string; unit: string; value: number }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.stat}>
      <NativeText style={{ color: colors.text, fontSize: 28, fontWeight: '700' }}>
        {value}
        <NativeText style={{ color: colors.textMuted, fontSize: 15, fontWeight: '500' }}>
          {` ${unit}${value === 1 ? '' : 's'}`}
        </NativeText>
      </NativeText>
      <NativeText style={{ color: colors.textMuted, fontSize: 13 }}>{label}</NativeText>
    </View>
  );
}

const CALENDAR_WEEKS = 5;
const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

function weekdayOf(day: LogicalDayKey): number {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1).getDay();
}

function HistoryCalendar({
  accent,
  habit,
  states,
  today,
  logicalDayRolloverHour,
  weekStartsOn,
}: {
  accent: string;
  habit: Habit;
  states: readonly HabitDayState[];
  today: LogicalDayKey;
  logicalDayRolloverHour: number;
  weekStartsOn: number;
}) {
  const { colorScheme, colors } = useAppTheme();
  const red = SYSTEM_RED[colorScheme];
  const onAccent = getAccessibleTextColor(accent);
  const options = { rolloverHour: logicalDayRolloverHour };
  const daysIntoWeek = (weekdayOf(today) - weekStartsOn + 7) % 7;
  const firstDay = shiftLogicalDay(today, -daysIntoWeek - (CALENDAR_WEEKS - 1) * 7, options);
  const days = Array.from({ length: CALENDAR_WEEKS * 7 }, (_, index) =>
    shiftLogicalDay(firstDay, index, options)
  );
  const stateForDay = (day: LogicalDayKey) =>
    states.find((state) => state.logicalDay === day) ?? null;
  const initials = Array.from(
    { length: 7 },
    (_, index) => WEEKDAY_INITIALS[(weekStartsOn + index) % 7] ?? ''
  );

  return (
    <FormSection testID="habit-history" title="History">
      <View style={styles.calendar}>
        <View style={styles.calendarRow}>
          {initials.map((initial, index) => (
            <NativeText
              key={`${initial}-${index}`}
              style={[styles.calendarHeading, { color: colors.textMuted }]}
            >
              {initial}
            </NativeText>
          ))}
        </View>
        {Array.from({ length: CALENDAR_WEEKS }, (_, week) => (
          <View key={`week-${week}`} style={styles.calendarRow}>
            {days.slice(week * 7, week * 7 + 7).map((day) => {
              const future = day > today;
              const state = future ? null : stateForDay(day);
              const complete = habitCompleted(state);
              const failed = state?.outcome === 'failed';
              const skipped = state?.outcome === 'skipped';
              const scheduled = isHabitScheduledDay(habit.schedule, day, options);
              const label = complete
                ? 'Done'
                : failed
                  ? 'Failed'
                  : skipped
                    ? 'Skipped'
                    : future
                      ? 'Upcoming'
                      : scheduled
                        ? 'Not logged'
                        : 'Not scheduled';
              return (
                <View
                  accessibilityLabel={`${day}: ${label}`}
                  accessible
                  key={day}
                  style={styles.calendarCell}
                  testID={`habit-history-day-${day}`}
                >
                  <View
                    style={[
                      styles.calendarDay,
                      complete && { backgroundColor: accent },
                      failed && { borderColor: red, borderWidth: 1.5 },
                      skipped && {
                        borderColor: colors.textMuted,
                        borderStyle: 'dashed',
                        borderWidth: 1.5,
                      },
                      day === today && !complete && !failed && !skipped
                        ? { borderColor: colors.text, borderWidth: 1.5 }
                        : null,
                    ]}
                  >
                    <NativeText
                      style={{
                        color: complete ? onAccent : failed ? red : colors.text,
                        fontSize: 15,
                        fontVariant: ['tabular-nums'],
                        fontWeight: complete || day === today ? '700' : '500',
                        opacity: future ? 0.25 : !scheduled && !complete && !failed ? 0.4 : 1,
                      }}
                    >
                      {Number(day.slice(8))}
                    </NativeText>
                  </View>
                </View>
              );
            })}
          </View>
        ))}
        <View style={styles.legend}>
          <LegendItem label="Done">
            <View style={[styles.legendDot, { backgroundColor: accent }]} />
          </LegendItem>
          <LegendItem label="Failed">
            <View style={[styles.legendDot, { borderColor: red, borderWidth: 1.5 }]} />
          </LegendItem>
          <LegendItem label="Skipped">
            <View
              style={[
                styles.legendDot,
                { borderColor: colors.textMuted, borderStyle: 'dashed', borderWidth: 1.5 },
              ]}
            />
          </LegendItem>
        </View>
      </View>
    </FormSection>
  );
}

function LegendItem({ label, children }: { label: string; children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.legendItem}>
      {children}
      <NativeText style={{ color: colors.textMuted, fontSize: 13 }}>{label}</NativeText>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', paddingVertical: 14, width: '100%' },
  stat: { alignItems: 'center', flex: 1, gap: 2 },
  statDivider: { width: StyleSheet.hairlineWidth },
  calendar: { gap: 6, paddingHorizontal: 12, paddingVertical: 14, width: '100%' },
  calendarRow: { flexDirection: 'row', width: '100%' },
  calendarHeading: { flex: 1, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  calendarCell: { alignItems: 'center', flex: 1, paddingVertical: 2 },
  calendarDay: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  legend: { flexDirection: 'row', gap: 18, justifyContent: 'center', paddingTop: 8 },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  legendDot: { borderRadius: 6, height: 12, width: 12 },
});
