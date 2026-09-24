import { Column, Row, Text } from '@expo/ui';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { logicalDayKey, type HabitDayOutcome, type LogicalDayKey } from '@domain';
import { useAppTheme } from '@theme';
import { AppButton, errorText, Screen } from '@ui';

import { formatHabitDay } from './date-navigation';
import { habitCompletionLabel } from './habit-format';
import {
  habitDayHasStatus,
  habitsActiveOnDay,
  habitsNeedingReview,
} from './habit-review';
import { loadHabitStore } from './habit-runtime';
import type { HabitStore } from './habit-store';

const OUTCOMES: readonly { value: HabitDayOutcome; label: string }[] = [
  { value: 'done', label: 'Done' },
  { value: 'failed', label: 'Failed' },
  { value: 'skipped', label: 'Skipped' },
];

function shuffle<T>(values: readonly T[]): T[] {
  const shuffled = values.slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other] as T, shuffled[index] as T];
  }
  return shuffled;
}

function requestedDay(
  value: string | string[] | undefined,
  today: LogicalDayKey,
  rolloverHour: number
): LogicalDayKey {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) return today;
  try {
    const day = logicalDayKey(candidate, { rolloverHour });
    return day <= today ? day : today;
  } catch {
    return today;
  }
}

function ReviewLoading({
  onBack,
  onRetry,
  message,
}: {
  onBack: () => void;
  onRetry?: () => void;
  message: string;
}) {
  const { colors } = useAppTheme();
  return (
    <Screen onBack={onBack} title="Habit review">
      <Column spacing={12} style={{ width: '100%' }}>
        <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>{message}</Text>
        {onRetry ? (
          <AppButton label="Try again" onPress={onRetry} testID="habit-review-retry" />
        ) : null}
      </Column>
    </Screen>
  );
}

export default function HabitReviewScreen({ day: dayParam }: { day?: string | string[] }) {
  const router = useRouter();
  const [store, setStore] = useState<HabitStore | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    void loadHabitStore()
      .then(async (nextStore) => {
        await nextStore.getState().refresh();
        setStore(() => nextStore);
      })
      .catch((error: unknown) => setLoadError(errorText(error)));
  }, []);

  useEffect(() => load(), [load]);

  if (!store) {
    return (
      <ReviewLoading
        onBack={() => router.back()}
        message={loadError ?? 'Loading your habits...'}
        onRetry={
          loadError
            ? () => {
                setLoadError(null);
                load();
              }
            : undefined
        }
      />
    );
  }

  return (
    <HabitReviewContent
      dayParam={dayParam}
      key={Array.isArray(dayParam) ? dayParam[0] : (dayParam ?? 'today')}
      store={store}
    />
  );
}

function HabitReviewContent({
  dayParam,
  store,
}: {
  dayParam?: string | string[];
  store: HabitStore;
}) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const states = store((state) => state.states);
  const today = store((state) => state.today);
  const rolloverHour = store((state) => state.logicalDayRolloverHour);
  const saving = store((state) => state.saving);
  const day = requestedDay(dayParam, today, rolloverHour);
  const [index, setIndex] = useState(0);
  const [outcome, setOutcome] = useState<HabitDayOutcome | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const queue = useMemo(() => {
    const snapshot = store.getState();
    const candidates =
      day < snapshot.today
        ? habitsNeedingReview(snapshot.habits, snapshot.states, day, snapshot.logicalDayRolloverHour)
        : habitsActiveOnDay(snapshot.habits, day, snapshot.logicalDayRolloverHour);
    return shuffle(candidates);
  }, [day, store]);
  const habit = queue?.[index];
  const currentState = habit
    ? states.find((state) => state.habitId === habit.id && state.logicalDay === day)
    : undefined;

  const saveAndContinue = async () => {
    if (!habit || !queue || outcome === null || saving) return;
    setActionError(null);
    try {
      await store.getState().setOutcome(habit.id, day, outcome);
      if (index + 1 === queue.length) {
        router.back();
        return;
      }
      setIndex((current) => current + 1);
      setOutcome(null);
    } catch (error) {
      setActionError(errorText(error));
    }
  };

  return (
    <Screen onBack={() => router.back()} title="Habit review" testID="habit-review-screen">
      <Column spacing={14} style={{ width: '100%' }}>
        {habit ? (
          <Column
            spacing={16}
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: 16,
              borderWidth: 1,
              padding: 18,
              width: '100%',
            }}
            testID="habit-review-card"
          >
            <Text textStyle={{ color: colors.textMuted, fontSize: 14, fontWeight: '600' }}>
              {`${formatHabitDay(day)} · Habit ${index + 1} of ${queue.length}`}
            </Text>
            <Text textStyle={{ color: colors.text, fontSize: 26, fontWeight: '700' }}>
              {habit.name}
            </Text>
            <Text textStyle={{ color: colors.textMuted, fontSize: 15, lineHeight: 21 }}>
              Take a moment to recall this day, then choose the status that fits.
            </Text>
            {habitDayHasStatus(currentState) ? (
              <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
                {`Currently marked: ${habitCompletionLabel(currentState ?? null)}. You can change it here.`}
              </Text>
            ) : null}
            <Column spacing={8} style={{ width: '100%' }}>
              <Text textStyle={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
                How did it go?
              </Text>
              <Row alignment="center" spacing={8} style={{ width: '100%' }}>
                {OUTCOMES.map((option) => (
                  <AppButton
                    disabled={saving}
                    key={option.value}
                    label={option.label}
                    onPress={() => {
                      setOutcome(option.value);
                      setActionError(null);
                    }}
                    style={{ height: 52, paddingHorizontal: 4, width: '30%' }}
                    testID={`habit-review-outcome-${option.value}`}
                    variant={outcome === option.value ? 'filled' : 'outlined'}
                  />
                ))}
              </Row>
            </Column>
            <AppButton
              disabled={saving || outcome === null}
              label={index + 1 === queue.length ? 'Finish review' : 'Next habit'}
              onPress={() => void saveAndContinue()}
              style={{ height: 56, width: '100%' }}
              testID="habit-review-next"
            />
            {actionError ? (
              <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>
                {actionError}
              </Text>
            ) : null}
          </Column>
        ) : (
          <Column
            spacing={12}
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: 16,
              borderWidth: 1,
              padding: 18,
              width: '100%',
            }}
            testID="habit-review-complete"
          >
            <Text textStyle={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>
              {day < today ? 'You’re all caught up for this day.' : 'No habits to review today.'}
            </Text>
            <AppButton
              label="Close review"
              onPress={() => router.back()}
              style={{ height: 52, width: '100%' }}
              testID="close-habit-review"
            />
          </Column>
        )}
      </Column>
    </Screen>
  );
}
