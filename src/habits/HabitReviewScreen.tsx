/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 */
import { Column, Host, Text } from '@expo/ui';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text as NativeText, View } from 'react-native';

import { logicalDayKey, type HabitDayOutcome, type LogicalDayKey } from '@domain';
import { AppIcon } from '@icons';
import { getAccessibleTextColor, useAppTheme } from '@theme';
import { AppButton, errorText, Screen } from '@ui';

import { goBackInAppStack } from '../navigation/app-back';
import { formatHabitDay } from './date-navigation';
import { habitCompletionLabel } from './habit-format';
import { habitDayHasStatus, habitsActiveOnDay, habitsNeedingReview } from './habit-review';
import { loadHabitStore } from './habit-runtime';
import type { HabitStore } from './habit-store';

const OUTCOMES: readonly { value: HabitDayOutcome; label: string; icon: string }[] = [
  { value: 'done', label: 'Done', icon: 'check' },
  { value: 'failed', label: 'Failed', icon: 'x' },
  { value: 'skipped', label: 'Skipped', icon: 'skip-forward' },
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
  const goBack = useCallback(() => goBackInAppStack(router, '/(tabs)/habits'), [router]);
  const [store, setStore] = useState<HabitStore | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    void loadHabitStore()
      .then((nextStore) => {
        setStore(() => nextStore);
        setLoadError(null);
      })
      .catch((error: unknown) => setLoadError(errorText(error)));
  }, []);

  useEffect(() => load(), [load]);

  if (!store) {
    return (
      <ReviewLoading
        onBack={goBack}
        message={loadError ?? 'Loading your habits...'}
        onRetry={loadError ? load : undefined}
      />
    );
  }

  return (
    <HabitReviewContent
      dayParam={dayParam}
      goBack={goBack}
      key={Array.isArray(dayParam) ? dayParam[0] : (dayParam ?? 'today')}
      store={store}
    />
  );
}

function HabitReviewContent({
  dayParam,
  goBack,
  store,
}: {
  dayParam?: string | string[];
  goBack: () => void;
  store: HabitStore;
}) {
  const { colors } = useAppTheme();
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
        ? habitsNeedingReview(
            snapshot.habits,
            snapshot.states,
            day,
            snapshot.logicalDayRolloverHour
          )
        : habitsActiveOnDay(snapshot.habits, day, snapshot.logicalDayRolloverHour);
    return shuffle(candidates);
  }, [day, store]);
  const habit = queue[index];
  const currentState = habit
    ? states.find((state) => state.habitId === habit.id && state.logicalDay === day)
    : undefined;
  const accent = habit?.color ?? colors.primary;

  const saveAndContinue = async () => {
    if (!habit || outcome === null || saving) return;
    setActionError(null);
    try {
      await store.getState().setOutcome(habit.id, day, outcome);
      if (index + 1 === queue.length) {
        goBack();
        return;
      }
      setIndex((current) => current + 1);
      setOutcome(null);
    } catch (error) {
      setActionError(errorText(error));
    }
  };

  return (
    <Screen onBack={goBack} scrollable={false} title="Habit review" testID="habit-review-screen">
      <View
        style={{
          flex: 1,
          justifyContent: 'space-between',
          minHeight: 0,
          paddingBottom: 18,
          paddingTop: 8,
          width: '100%',
        }}
        testID="habit-review-stage"
      >
        {habit ? (
          <View style={{ flexGrow: 1, minHeight: 0, width: '100%' }}>
            <View style={{ alignItems: 'center', flexDirection: 'row', gap: 10, width: '100%' }}>
              <NativeText style={{ color: colors.textMuted, fontSize: 14, fontWeight: '600' }}>
                {formatHabitDay(day)}
              </NativeText>
              <View style={{ flex: 1 }} />
              <NativeText
                style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}
                testID="habit-review-progress-label"
              >
                {`${index + 1} of ${queue.length}`}
              </NativeText>
            </View>
            <View style={{ flexDirection: 'row', gap: 4, marginTop: 12, width: '100%' }}>
              {queue.map((candidate, position) => (
                <View
                  key={candidate.id}
                  style={{
                    backgroundColor: position <= index ? accent : colors.border,
                    borderRadius: 2,
                    flex: 1,
                    height: 4,
                  }}
                />
              ))}
            </View>

            <View style={{ marginTop: 30, width: '100%' }}>
              <NativeText style={{ color: colors.textMuted, fontSize: 17, fontWeight: '600' }}>
                How did it go?
              </NativeText>
              <View style={{ marginTop: 10, width: '100%' }}>
                <View
                  style={{ alignItems: 'center', flexDirection: 'row', gap: 12, width: '100%' }}
                >
                  <View
                    style={{ backgroundColor: accent, borderRadius: 3, height: 42, width: 6 }}
                    testID="habit-review-accent"
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <NativeText
                      numberOfLines={2}
                      style={{
                        color: colors.text,
                        fontSize: 29,
                        fontWeight: '700',
                        lineHeight: 35,
                      }}
                      testID="habit-review-name"
                    >
                      {habit.name}
                    </NativeText>
                  </View>
                </View>
              </View>
              {habitDayHasStatus(currentState) ? (
                <View style={{ marginTop: 8 }}>
                  <NativeText
                    style={{ color: colors.textMuted, fontSize: 14 }}
                    testID="habit-review-current-status"
                  >
                    {`Saved as ${habitCompletionLabel(currentState ?? null)} · choose a new status to change it`}
                  </NativeText>
                </View>
              ) : null}
            </View>

            <View style={{ marginTop: 28, width: '100%' }}>
              <View style={{ gap: 8, width: '100%' }}>
                {OUTCOMES.map((option) => {
                  const selected = outcome === option.value;
                  return (
                    <Pressable
                      accessibilityLabel={option.label}
                      accessibilityRole="radio"
                      accessibilityState={{ disabled: saving, selected }}
                      disabled={saving}
                      key={option.value}
                      onPress={() => {
                        setOutcome(option.value);
                        setActionError(null);
                      }}
                      style={({ pressed }) => ({
                        alignItems: 'center',
                        backgroundColor: selected ? colors.surfaceMuted : 'transparent',
                        borderColor: selected ? accent : colors.border,
                        borderRadius: 14,
                        borderWidth: selected ? 2 : 1,
                        flexDirection: 'row',
                        gap: 12,
                        minHeight: 58,
                        opacity: saving ? 0.5 : pressed ? 0.82 : 1,
                        paddingHorizontal: 14,
                        width: '100%',
                      })}
                      testID={`habit-review-outcome-${option.value}`}
                    >
                      <View
                        style={{
                          alignItems: 'center',
                          backgroundColor: accent,
                          borderRadius: 8,
                          height: 36,
                          justifyContent: 'center',
                          width: 36,
                        }}
                      >
                        <AppIcon
                          color={getAccessibleTextColor(accent)}
                          name={option.icon}
                          size={20}
                          strokeWidth={2.5}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <NativeText
                          style={{
                            color: colors.text,
                            fontSize: 17,
                            fontWeight: selected ? '700' : '600',
                          }}
                        >
                          {option.label}
                        </NativeText>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', width: '100%' }}>
            <AppIcon color={colors.success.foreground} name="check-circle-2" size={34} />
            <View style={{ marginTop: 16 }}>
              <NativeText
                style={{ color: colors.text, fontSize: 26, fontWeight: '700', lineHeight: 32 }}
                testID="habit-review-complete"
              >
                {day < today ? 'This day is all caught up.' : 'That’s every habit for today.'}
              </NativeText>
            </View>
          </View>
        )}

        <View style={{ width: '100%' }}>
          {actionError ? (
            <View style={{ marginBottom: 10 }}>
              <NativeText style={{ color: colors.danger.foreground, fontSize: 14 }}>
                {actionError}
              </NativeText>
            </View>
          ) : null}
          {habit ? (
            <Host style={{ height: 54, width: '100%' }}>
              <AppButton
                disabled={saving || outcome === null}
                label={index + 1 === queue.length ? 'Finish review' : 'Next habit'}
                onPress={() => void saveAndContinue()}
                style={{ height: 54, width: '100%' }}
                testID="habit-review-next"
              />
            </Host>
          ) : (
            <Host style={{ height: 54, width: '100%' }}>
              <AppButton
                label="Back to habits"
                onPress={goBack}
                style={{ height: 54, width: '100%' }}
                testID="close-habit-review"
                variant="outlined"
              />
            </Host>
          )}
        </View>
      </View>
    </Screen>
  );
}
