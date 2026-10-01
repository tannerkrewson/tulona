import { Column, ScrollView, Text } from '@ui/primitives';
import { useIsFocused, useRouter, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text as NativeText,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ViewStyle } from 'react-native';

import {
  shiftLogicalDay,
  type Habit,
  type HabitDayOutcome,
  type HabitDayState,
  type LogicalDayKey,
} from '@domain';
import { AppIcon, type IconName } from '@icons';
import { getAccessibleTextColor, useAppTheme } from '@theme';
import {
  EmptyState,
  errorText,
  getRowSurfaceBackground,
  getRowSurfaceStyle,
  ROW_SURFACE_CONTENT_GAP,
  ROW_SURFACE_ICON_SIZE,
  ROW_SURFACE_PADDING_HORIZONTAL,
  ROW_SURFACE_RADIUS,
  PageFilterMenu,
  PageFilterMenuSelection,
  Screen,
} from '@ui';
import { SwipePager } from '@ui/SwipePager';

import { HabitContextMenu } from './HabitContextMenu';
import { HabitErrorMessage } from './HabitErrorMessage';
import { HabitHeader } from './HabitHeader';
import { findLatestIncompleteHabitDay } from './habit-review';
import {
  DEFAULT_HABIT_CATEGORY,
  groupHabitsByCategory,
  habitStartDay,
  type HabitCategory,
} from './categories';
import {
  formatHabitDay,
  formatHabitDayShort,
  formatHabitRolloverHour,
  habitDayOffset,
  habitDaySwipeTarget,
  habitWeekDays,
  habitWeekOffset,
  habitWeekSwipeTarget,
  isPastMidnightHabitDay,
  shiftHabitDay,
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
    const load = loadHabitStore();
    void load
      .then((nextStore) => {
        if (!cancelled) {
          setStore(() => nextStore);
          setLoadError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(errorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, [focused]);

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
            onBack={() => router.replace('/')}
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
  const [metricMode, setMetricMode] = useState<HabitMetricMode>('streak');
  const [selectedCategory, setSelectedCategory] = useState<HabitCategory>(DEFAULT_HABIT_CATEGORY);
  const habitViewOptions = [
    { value: 'active', label: 'Active habits', icon: 'heart' },
    { value: 'future', label: 'Future habits', icon: 'calendar-days' },
    { value: 'archived', label: 'Archived habits', icon: 'archive' },
  ] as const;
  const [editMode, setEditMode] = useState(false);
  const [dismissedPastMidnightDay, setDismissedPastMidnightDay] = useState<LogicalDayKey | null>(
    null
  );
  const lastAction = useRef<(() => Promise<unknown>) | null>(null);
  const habitsByCategory = useMemo(
    () => groupHabitsByCategory(habits, today, { rolloverHour: logicalDayRolloverHour }),
    [habits, logicalDayRolloverHour, today]
  );
  const reviewGap = useMemo(
    () => findLatestIncompleteHabitDay(habits, states, today, logicalDayRolloverHour),
    [habits, logicalDayRolloverHour, states, today]
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

  const renderDay = (day: LogicalDayKey, horizontalInsets: { left: number; right: number }) => (
    <HabitDayList
      activeHabits={habitsByCategory.active}
      day={day}
      horizontalInsets={horizontalInsets}
      editMode={editMode}
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
      <View style={{ flex: 1, gap: 14, minHeight: 0, position: 'relative', width: '100%' }}>
        <HabitHeader
          onAdd={() => router.push('/habit/new')}
          editLabel="Edit habits"
          editOpen={editMode}
          editOpenLabel="Done editing habits"
          editTestID="habit-edit-mode"
          filterMenu={
            <PageFilterMenu
              accessibilityLabel="Choose habit view"
              onChange={setSelectedCategory}
              options={habitViewOptions}
              testID="habit-view-menu"
              value={selectedCategory}
            />
          }
          onToggleEdit={() => setEditMode((open) => !open)}
          title="Habits"
          testID="habits-header"
        />
        <HabitErrorMessage
          message={persistenceError ? errorText(persistenceError) : null}
          onBack={() => router.replace('/')}
          onRetry={() => {
            const action = lastAction.current;
            runAction(action ?? (() => store.getState().refresh()));
          }}
        />
        <PageFilterMenuSelection
          defaultValue={DEFAULT_HABIT_CATEGORY}
          onChange={setSelectedCategory}
          options={habitViewOptions}
          testID="habit-view-menu"
          value={selectedCategory}
        />
        <View style={{ flex: 1, minHeight: 0, paddingBottom: 68, width: '100%' }}>
          {selectedCategory === 'active' ? (
            <>
              {pastMidnightWarningVisible ? (
                <HabitNoticeRow
                  accessibilityLabel={`Still logging ${formatHabitDayShort(selectedDay)}. Your day rolls over at ${formatHabitRolloverHour(logicalDayRolloverHour)}.`}
                  icon="moon"
                  subtitle={`Your day rolls over at ${formatHabitRolloverHour(logicalDayRolloverHour)}`}
                  testID="habit-past-midnight-warning"
                  title={`Still logging ${formatHabitDayShort(selectedDay)}`}
                  trailing={
                    <Pressable
                      accessibilityHint="Dismisses this reminder without changing habit data"
                      accessibilityLabel="Dismiss"
                      accessibilityRole="button"
                      hitSlop={10}
                      onPress={() => setDismissedPastMidnightDay(selectedDay)}
                      style={styles.noticeDismiss}
                      testID="habit-past-midnight-dismiss"
                    >
                      <AppIcon color={colors.textMuted} name="x" size={18} />
                    </Pressable>
                  }
                />
              ) : null}
              {reviewGap ? (
                <HabitNoticeRow
                  accessibilityHint="Opens a review of that day's unlogged habits"
                  accessibilityLabel={`${reviewGap.count} ${reviewGap.count === 1 ? 'habit' : 'habits'} not logged on ${formatHabitDayShort(reviewGap.day)}`}
                  icon="calendar-days"
                  onPress={() => router.push(`/habit-review?day=${reviewGap.day}` as Href)}
                  subtitle={formatHabitDayShort(reviewGap.day)}
                  testID="incomplete-habit-day-reminder"
                  title={`${reviewGap.count} ${reviewGap.count === 1 ? 'habit' : 'habits'} not logged`}
                  trailing={
                    <>
                      <NativeText
                        selectable={false}
                        style={{ color: colors.primary, fontSize: 15, fontWeight: '600' }}
                        testID="review-incomplete-habit-day"
                      >
                        Review
                      </NativeText>
                      <AppIcon color={colors.textMuted} name="chevron-right" size={18} />
                    </>
                  }
                />
              ) : null}
              <HabitWeekStrip
                onSelectDay={selectDay}
                rolloverHour={logicalDayRolloverHour}
                selectedDay={selectedDay}
                today={today}
              />
              <HabitDayPager
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
              editMode={editMode}
              onDetails={(habitId) => router.push(`/habit/${habitId}`)}
              rolloverHour={logicalDayRolloverHour}
            />
          )}
        </View>
        <Pressable
          accessibilityHint={
            habitsByCategory.active.length === 0
              ? 'Add an active habit to start a mindful review'
              : 'Review today’s active habits one at a time'
          }
          accessibilityLabel="Start mindful review"
          accessibilityRole="button"
          accessibilityState={{ disabled: habitsByCategory.active.length === 0 }}
          disabled={habitsByCategory.active.length === 0}
          onPress={() => router.push('/habit-review' as Href)}
          style={({ pressed }) => ({
            alignItems: 'center',
            backgroundColor: colors.surfaceMuted,
            borderColor: colors.border,
            borderRadius: 16,
            borderWidth: 1,
            bottom: 0,
            flexDirection: 'row',
            gap: 10,
            height: 58,
            justifyContent: 'center',
            left: 0,
            opacity: habitsByCategory.active.length === 0 ? 0.42 : pressed ? 0.78 : 1,
            position: 'absolute',
            right: 0,
            width: '100%',
          })}
          testID="start-habit-review"
        >
          <AppIcon color={colors.primary} name="sparkles" size={20} />
          <NativeText style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>
            Start mindful review
          </NativeText>
        </Pressable>
      </View>
    </Screen>
  );
}

function HabitCategoryList({
  category,
  habits,
  editMode,
  onDetails,
  rolloverHour,
}: {
  category: Exclude<HabitCategory, 'active'>;
  habits: readonly Habit[];
  editMode: boolean;
  onDetails: (habitId: string) => void;
  rolloverHour: number;
}) {
  const { colors } = useAppTheme();
  const future = category === 'future';

  return (
    <View style={{ flex: 1, minHeight: 0, width: '100%' }}>
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
                  key={habit.id}
                  category={category}
                  editMode={editMode}
                  habit={habit}
                  onDetails={() => onDetails(habit.id)}
                  rolloverHour={rolloverHour}
                />
              ))}
            </Column>
          )}
        </Column>
      </ScrollView>
    </View>
  );
}

function HabitCategoryListItem({
  category,
  editMode,
  habit,
  onDetails,
  rolloverHour,
}: {
  category: Exclude<HabitCategory, 'active'>;
  editMode: boolean;
  habit: Habit;
  onDetails: () => void;
  rolloverHour: number;
}) {
  const { colorScheme, colors } = useAppTheme();
  const future = category === 'future';
  const subtitle = future
    ? `Starts ${formatHabitDay(habitStartDay(habit, { rolloverHour }))}`
    : 'Archived habit · Open details to restore';
  const accent = habit.color ?? colors.primary;
  const rowSurface = getRowSurfaceBackground({
    colorScheme,
    surface: colors.surface,
    surfaceMuted: colors.surfaceMuted,
  });

  return (
    <Pressable
      accessibilityHint={
        editMode
          ? 'Opens the habit editor'
          : 'Opens habit details, where it can be edited or restored'
      }
      accessibilityLabel={`${habit.name}. ${subtitle}${editMode ? '. Edit habit' : ''}`}
      accessibilityRole="button"
      onPress={onDetails}
      style={({ pressed }) => [
        getRowSurfaceStyle({ backgroundColor: rowSurface }),
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

function HabitNoticeRow({
  accessibilityHint,
  accessibilityLabel,
  icon,
  onPress,
  subtitle,
  testID,
  title,
  trailing,
}: {
  accessibilityHint?: string;
  accessibilityLabel: string;
  icon: IconName;
  onPress?: () => void;
  subtitle: string;
  testID: string;
  title: string;
  trailing: ReactNode;
}) {
  const { colorScheme, colors } = useAppTheme();
  const rowSurface = getRowSurfaceBackground({
    colorScheme,
    surface: colors.surface,
    surfaceMuted: colors.surfaceMuted,
  });

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={onPress ? 'button' : 'summary'}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        getRowSurfaceStyle({ backgroundColor: rowSurface }),
        styles.noticeRow,
        pressed ? styles.categoryPressed : null,
      ]}
      testID={testID}
    >
      <AppIcon color={colors.textMuted} name={icon} size={20} />
      <View style={styles.categoryListText}>
        <NativeText
          numberOfLines={1}
          selectable={false}
          style={{ color: colors.text, fontSize: 15, fontWeight: '600', lineHeight: 20 }}
        >
          {title}
        </NativeText>
        <NativeText
          numberOfLines={1}
          selectable={false}
          style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}
        >
          {subtitle}
        </NativeText>
      </View>
      {trailing}
    </Pressable>
  );
}

const WEEK_STRIP_HEIGHT = 70;
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
  categoryPressed: {
    opacity: 0.72,
  },
  noticeDismiss: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  noticeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    marginBottom: 12,
    minHeight: 56,
    paddingHorizontal: ROW_SURFACE_PADDING_HORIZONTAL,
    paddingVertical: 8,
    width: '100%',
  },
});

function HabitDayPager({
  horizontalInsets,
  selectedDay,
  today,
  rolloverHour,
  onSelectDay,
  renderDay,
}: {
  horizontalInsets: { left: number; right: number };
  selectedDay: LogicalDayKey;
  today: LogicalDayKey;
  rolloverHour: number;
  onSelectDay: (day: LogicalDayKey) => void;
  renderDay: (day: LogicalDayKey, insets: { left: number; right: number }) => ReactNode;
}) {
  return (
    <SwipePager
      canGoNext={habitDaySwipeTarget(selectedDay, 1, today, rolloverHour) !== null}
      index={habitDayOffset(selectedDay, today)}
      onChange={(delta) => onSelectDay(shiftHabitDay(selectedDay, delta, rolloverHour))}
      renderPage={(page) =>
        renderDay(shiftLogicalDay(today, page, { rolloverHour }), horizontalInsets)
      }
      // Pages span the full screen so rows slide off its edges instead of a clipped inset.
      style={{
        flex: 1,
        marginLeft: -horizontalInsets.left,
        marginRight: -horizontalInsets.right,
        minHeight: 0,
      }}
      testID="habit-day-navigation"
    />
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
  const { colorScheme, colors } = useAppTheme();
  const rowSurface = getRowSurfaceBackground({
    colorScheme,
    surface: colors.surface,
    surfaceMuted: colors.surfaceMuted,
  });
  const index = habitWeekOffset(selectedDay, today, rolloverHour);
  const nextWeekTarget = habitWeekSwipeTarget(selectedDay, 1, today, rolloverHour);

  return (
    <SwipePager
      canGoNext={nextWeekTarget !== null}
      index={index}
      onChange={(delta) =>
        onSelectDay(
          delta === 1 && nextWeekTarget
            ? nextWeekTarget
            : shiftHabitWeek(selectedDay, -1, rolloverHour)
        )
      }
      renderPage={(page) => (
        <View style={{ paddingHorizontal: 4, paddingVertical: 8, width: '100%' }}>
          <WeekDaysRow
            days={habitWeekDays(
              shiftLogicalDay(selectedDay, (page - index) * 7, { rolloverHour }),
              rolloverHour
            )}
            onSelectDay={onSelectDay}
            selectedDay={selectedDay}
            today={today}
          />
        </View>
      )}
      style={{
        backgroundColor: rowSurface,
        borderRadius: ROW_SURFACE_RADIUS,
        height: WEEK_STRIP_HEIGHT,
        width: '100%',
      }}
      testID="habit-week-strip"
    />
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
    <View style={{ alignItems: 'center', flexDirection: 'row', gap: 4, width: '100%' }}>
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
            <NativeText
              style={{
                color: selected ? colors.onPrimary : colors.textMuted,
                fontSize: 11,
                fontWeight: '600',
              }}
            >
              {sundayFirstWeekdayLabels[index]}
            </NativeText>
            <NativeText
              style={{
                color: selected ? colors.onPrimary : colors.text,
                fontSize: 18,
                fontWeight: selected ? '700' : '600',
              }}
            >
              {day.slice(8)}
            </NativeText>
          </Pressable>
        );
      })}
    </View>
  );
}

function HabitDayList({
  activeHabits,
  day,
  horizontalInsets,
  editMode,
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
  horizontalInsets: { left: number; right: number };
  editMode: boolean;
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
    <View style={{ flex: 1, minHeight: 0, width: '100%' }}>
      <ScrollView
        contentContainerStyle={{
          paddingLeft: horizontalInsets.left,
          paddingRight: horizontalInsets.right,
        }}
        style={{ height: '100%', width: '100%' }}
      >
        <Column spacing={12} style={{ paddingBottom: 20, paddingTop: 12, width: '100%' }}>
          {activeHabits.length === 0 ? (
            <EmptyState iconName="heart" testID="habits-empty" title="No active habits yet" />
          ) : (
            <Column spacing={8} style={{ width: '100%' }}>
              {activeHabits.map((habit) => (
                <HabitListItem
                  key={habit.id}
                  editMode={editMode}
                  habit={habit}
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
    </View>
  );
}

interface HabitMenuAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

function HabitListItem({
  editMode,
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
  editMode: boolean;
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
  const { colorScheme, colors } = useAppTheme();
  const [menuAnchor, setMenuAnchor] = useState<HabitMenuAnchor | null>(null);
  const longPressed = useRef(false);
  const rowRef = useRef<View>(null);
  const [rowPressProgress] = useState(() => new Animated.Value(0));
  const rowPressOpacity = rowPressProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.78],
  });
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
  const statusIcon = editMode
    ? 'pencil'
    : outcome === 'failed'
      ? 'x'
      : outcome === 'skipped'
        ? 'skip-forward'
        : complete
          ? 'check'
          : null;
  const statusBackground = accent;
  const statusColor = editMode ? colors.textMuted : getAccessibleTextColor(statusBackground);
  const statusLabel = habitOutcomeLabel(outcome) ?? habitCompletionLabel(state ?? null);
  const rowSurface = getRowSurfaceBackground({
    colorScheme,
    surface: colors.surface,
    surfaceMuted: colors.surfaceMuted,
  });
  const menuOpen = menuAnchor !== null;
  const nativeContextMenu = HabitContextMenu.supported && !editMode;
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
      <Animated.View style={{ opacity: saving ? 0.55 : rowPressOpacity, width: '100%' }}>
        <HabitContextMenu
          enabled={nativeContextMenu}
          height={HABIT_ROW_MIN_HEIGHT}
          onDetails={onDetails}
          onOutcome={onOutcome}
          outcome={outcome}
        >
          <Pressable
            accessibilityHint={
              editMode
                ? 'Opens the habit editor'
                : 'Cycles this habit through not done, done, failed, and skipped. Long press for more actions.'
            }
            accessibilityLabel={
              editMode
                ? `Edit ${habit.name}`
                : `${habit.name}. ${statusLabel}. ${metricValue} ${metricLabel.toLowerCase()}. Signals: ${habitSignalSummary(state ?? null)}.`
            }
            accessibilityRole={editMode ? 'button' : 'checkbox'}
            accessibilityState={
              editMode ? { disabled: saving } : { checked: complete, disabled: saving }
            }
            accessibilityValue={{ text: statusLabel }}
            delayLongPress={500}
            disabled={saving}
            onPressIn={() => {
              Animated.timing(rowPressProgress, {
                duration: 100,
                toValue: 1,
                useNativeDriver: true,
              }).start();
            }}
            onPressOut={() => {
              Animated.timing(rowPressProgress, {
                duration: 140,
                toValue: 0,
                useNativeDriver: true,
              }).start();
            }}
            onLongPress={
              editMode || nativeContextMenu
                ? undefined
                : () => {
                    longPressed.current = true;
                    rowRef.current?.measureInWindow((x, y, width, height) => {
                      setMenuAnchor({ height, width, x, y });
                    });
                  }
            }
            onPress={() => {
              if (editMode) {
                onDetails();
                return;
              }
              if (longPressed.current) {
                longPressed.current = false;
                return;
              }
              onCycle();
            }}
            style={{
              alignItems: 'center',
              ...getRowSurfaceStyle({
                backgroundColor: rowSurface,
              }),
              flexDirection: 'row',
              minHeight: HABIT_ROW_MIN_HEIGHT,
              opacity: 1,
              paddingHorizontal: ROW_SURFACE_PADDING_HORIZONTAL,
              paddingVertical: 0,
              width: '100%',
              ...(Platform.OS === 'web'
                ? ({
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    WebkitTouchCallout: 'none',
                  } as unknown as ViewStyle)
                : null),
            }}
            testID={`toggle-habit-${habit.id}`}
          >
            <View
              style={{
                alignItems: 'center',
                flexDirection: 'row',
                gap: ROW_SURFACE_CONTENT_GAP,
                height: HABIT_ROW_MIN_HEIGHT,
                width: '100%',
              }}
            >
              <Pressable
                accessibilityHint={
                  editMode
                    ? 'Opens the habit editor'
                    : 'Cycles this habit through not done, done, failed, and skipped'
                }
                accessibilityLabel={
                  editMode ? `Edit ${habit.name}` : `${habit.name}, ${statusLabel}`
                }
                accessibilityValue={{ text: statusLabel }}
                accessibilityRole="button"
                accessibilityState={{ disabled: saving }}
                disabled={saving}
                onPress={(event) => {
                  event.stopPropagation();
                  if (editMode) onDetails();
                  else onCycle();
                }}
                style={({ pressed }) => ({
                  alignItems: 'center',
                  backgroundColor: editMode ? colors.surfaceMuted : statusBackground,
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
                <NativeText
                  numberOfLines={1}
                  style={{ color: colors.text, fontSize: 17, fontWeight: '600', lineHeight: 22 }}
                >
                  {habit.name}
                </NativeText>
                <NativeText
                  numberOfLines={1}
                  style={{ color: colors.textMuted, fontSize: 12, lineHeight: 16 }}
                >
                  {statusLabel}
                </NativeText>
              </View>
              <Pressable
                accessibilityHint="Toggles all visible habits between current streak and total days"
                accessibilityLabel={`${metricLabel}: ${metricValue}`}
                accessibilityRole="button"
                accessibilityState={{ disabled: saving || editMode }}
                accessibilityValue={{ text: String(metricValue) }}
                disabled={saving || editMode}
                onPress={(event) => {
                  event.stopPropagation();
                  if (!editMode) onToggleMetricDisplay();
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
                <NativeText
                  numberOfLines={1}
                  style={{ color: colors.text, fontSize: 17, fontWeight: '600', lineHeight: 22 }}
                >
                  {String(metricValue)}
                </NativeText>
                <NativeText
                  numberOfLines={1}
                  style={{ color: colors.textMuted, fontSize: 12, lineHeight: 16 }}
                >
                  {metricLabel}
                </NativeText>
              </Pressable>
            </View>
          </Pressable>
        </HabitContextMenu>
      </Animated.View>
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
