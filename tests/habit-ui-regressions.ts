import { ROW_SURFACE_RADIUS } from '../src/ui/row-surface';
import { DEFAULT_HABIT_CATEGORY, HABIT_CATEGORY_OPTIONS } from '../src/habits';

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
const metricTargetStart = habitItem.indexOf('testID={`toggle-habit-metric-${habit.id}`}');
const metricTarget = habitItem.slice(
  habitItem.lastIndexOf('<Pressable', metricTargetStart),
  habitItem.indexOf('</Pressable>', metricTargetStart) + '</Pressable>'.length
);

assert(
  DEFAULT_HABIT_CATEGORY === 'active' &&
    HABIT_CATEGORY_OPTIONS.map((option) => option.value).join(',') === 'active,future,archived',
  'habit categories must expose Active as the default in active, future, archived order'
);
assert(
  habitList.includes(
    'const [selectedCategory, setSelectedCategory] = useState<HabitCategory>(DEFAULT_HABIT_CATEGORY);'
  ) &&
    habitList.includes('testID="habit-category-switcher"') &&
    habitList.includes('accessibilityRole="tab"') &&
    habitList.includes('testID={`habit-category-${option.value}`}') &&
    habitList.includes("selectedCategory === 'active'"),
  'habit list must expose an accessible category switcher with Active selected by default'
);
assert(
  habitList.includes('function HabitCategoryList(') &&
    habitList.includes('habit-category-item-${category}-${habit.id}') &&
    habitList.includes('Opens habit details, where it can be edited or restored'),
  'future and archived category rows must retain the existing detail and editing flow'
);

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
  weekPager.includes('borderRadius: ROW_SURFACE_RADIUS') &&
    weekPager.includes("overflow: 'hidden'") &&
    ROW_SURFACE_RADIUS === 14,
  'the week scroller must clip with the same corner radius as habit rows'
);
assert(
  habitList.includes("const [metricMode, setMetricMode] = useState<HabitMetricMode>('streak');") &&
    habitList.includes('toggleHabitMetricMode(mode)') &&
    habitList.includes('onToggleMetricDisplay={toggleMetricDisplay}') &&
    habitList.includes('metricMode={metricMode}') &&
    habitItem.includes('const totalDays = habitCompletionCount(states);') &&
    habitItem.includes("metricMode === 'total-days' ? totalDays : streak.current") &&
    habitItem.includes("metricMode === 'total-days' ? 'Total Days' : 'Current Streak'"),
  'one shared habit metric mode must render current streak or completed total days'
);
assert(
  metricTarget.includes('event.stopPropagation();') &&
    metricTarget.includes('onToggleMetricDisplay();') &&
    metricTarget.includes("alignSelf: 'stretch'") &&
    metricTarget.includes("marginLeft: 'auto'") &&
    metricTarget.includes('minWidth: HABIT_ROW_STREAK_WIDTH') &&
    metricTarget.includes('width: HABIT_ROW_STREAK_WIDTH') &&
    habitItem.includes("style={{ height: HABIT_ROW_MIN_HEIGHT, width: '100%' }}"),
  'the streak metric target must span its full row-height column without bubbling to the row'
);
assert(
  habitItem.includes('testID={`toggle-habit-${habit.id}`}') &&
    habitItem.includes('onPress={() => {') &&
    habitItem.includes('onCycle();') &&
    habitItem.includes('testID={`status-habit-${habit.id}`}') &&
    habitItem.includes('event.stopPropagation();'),
  'the row and status control must retain their existing outcome-cycle taps'
);
assert(
  habitList.includes('<ConfirmationModal') &&
    habitList.includes('habit-past-midnight-warning') &&
    habitList.includes('formatHabitRolloverHour(logicalDayRolloverHour)') &&
    habitList.includes('Dismisses this reminder without changing habit data') &&
    habitList.includes('confirmTestID="habit-past-midnight-keep"') &&
    habitList.includes('cancelTestID="habit-past-midnight-dismiss"'),
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

console.log(
  'Validated habit metric toggling/counts, hit-target boundaries, outcome cycling, warning, typography, border, and pager regressions.'
);
