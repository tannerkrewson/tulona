/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
/* eslint-enable @typescript-eslint/no-require-imports */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = path.resolve(process.cwd());
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const appScreen = read('src/ui/AppScreen.tsx');
const habitList = read('src/habits/HabitListScreen.tsx');
const habitStore = read('src/habits/habit-store.ts');
const habitItemStart = habitList.indexOf('function HabitListItem(');
const habitItemEnd = habitList.indexOf('function HabitAction(', habitItemStart);
const habitItem = habitList.slice(habitItemStart, habitItemEnd);
const weekPagerStart = habitList.indexOf('function HabitWeekStrip(');
const weekDaysStart = habitList.indexOf('function WeekDaysRow(');
const weekPager = habitList.slice(weekPagerStart, weekDaysStart);

assert(
  habitStore.includes('cycleOutcome') && habitStore.includes('nextHabitOutcome(existing?.outcome)'),
  'habit taps must use one store-level persisted outcome cycle'
);
assert(
  habitList.includes('onCycle={(habitId) => runAction(() => store.getState().cycleOutcome') &&
    habitList.includes('Cycles this habit through not done, done, failed, and skipped'),
  'habit card and status-button taps must expose the full outcome cycle accessibly'
);
assert(
  /\{statusLabel\}\s*<\/Text>/.test(habitList) &&
    !habitList.includes('{outcome ? (') &&
    habitList.includes("fontSize: 17, fontWeight: '600', lineHeight: 22") &&
    habitList.includes('fontSize: 12, lineHeight: 16'),
  'not-done subtitles must be stable and title/streak text must share line metrics'
);
assert(
  habitItem.includes('getRowSurfaceStyle') &&
    habitItem.includes('backgroundColor: colors.surface') &&
    !habitItem.includes('borderColor:') &&
    !habitItem.includes('borderWidth:') &&
    !habitItem.includes('colors.success.background') &&
    !habitItem.includes('colors.warning.background') &&
    !habitItem.includes('colors.danger.background'),
  'habit cards must use the shared borderless surface without state background colors'
);
assert(
  habitItem.includes('flexShrink: 0') &&
    habitItem.includes("marginLeft: 'auto'") &&
    habitItem.includes('minWidth: HABIT_ROW_STREAK_WIDTH') &&
    habitItem.includes('width: HABIT_ROW_STREAK_WIDTH') &&
    habitItem.includes('numberOfLines={1}') &&
    habitItem.includes('Current Streak'),
  'habit current-streak metrics must stay aligned in a fixed single-line right column'
);
assert(
  habitList.includes('habit-past-midnight-warning') &&
    habitList.includes('formatHabitRolloverHour(logicalDayRolloverHour)') &&
    habitList.includes('Dismisses this reminder without changing habit data') &&
    habitList.includes('testID="habit-past-midnight-keep"'),
  'past-midnight warning must explain the configured rollover and provide a safe dismissal'
);
assert(
  weekPager.includes('onPanResponderMove: (_, gesture) =>') &&
    !weekPager.includes('Animated.event([null, { dx: dragX }], { useNativeDriver })'),
  'week-strip optimization is reverted pending device-level profiling'
);
assert(
  habitList.includes('const pageGap = 12') &&
    habitList.includes('marginRight: pageGap') &&
    habitList.includes('flexShrink: 0') &&
    habitList.includes('marginLeft: -horizontalInsets.left') &&
    habitList.includes('paddingLeft: horizontalInsets.left') &&
    habitList.includes("overflow: 'hidden'") &&
    !habitList.includes(
      "borderColor: colors.border,\n        borderRadius: 12,\n        borderWidth: 1,\n        overflow: 'hidden'"
    ),
  'habit day pages must use a full-bleed clipped viewport with explicit per-page insets'
);
assert(
  appScreen.includes('const screenBackground = backgroundColor ?? colors.background'),
  'app screens must use the theme background so habit surfaces remain visibly distinct'
);

console.log('Validated habit outcome, warning, typography, border, and pager regressions.');
