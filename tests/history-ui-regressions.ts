/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
/* eslint-enable @typescript-eslint/no-require-imports */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = path.resolve(process.cwd());
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const tabs = read('src/navigation/AppTabsJavaScript.tsx');
const nativeTabs = read('src/navigation/AppTabs.native.tsx');
const rootLayout = read('app/_layout.tsx');
const historyRoute = read('app/history.tsx');
const goalsRoute = read('app/(tabs)/goals.tsx');
const goalsScreen = read('src/goals/GoalsScreen.tsx');
const goalReviewScreen = read('src/goals/GoalReviewScreen.tsx');
const goalEditorScreen = read('src/goals/GoalEditorScreen.tsx');
const history = read('src/history/HistoryScreen.tsx');
const tracker = read('src/tracker/ActivitiesScreen.tsx');
const catalogHeader = read('src/tracker/CatalogHeader.tsx');
const dayTimeline = read('src/history/DayTimeline.tsx');
const pageHeader = read('src/ui/PageHeader.tsx');
const filterMenu = read('src/ui/PageFilterMenu.tsx');
const iconButton = read('src/ui/IconButton.tsx');
const habitHeader = read('src/habits/HabitHeader.tsx');

assert(
  tabs.includes('name="goals"') &&
    tabs.includes("title: 'Goals'") &&
    tabs.includes("tabBarAccessibilityLabel: 'Goals tab'") &&
    tabs.includes('name="award"') &&
    !tabs.includes('name="history"'),
  'the third tab slot must present Goals and no longer expose History'
);
assert(
  nativeTabs.includes('<NativeTabs') &&
    nativeTabs.includes('name="goals"') &&
    nativeTabs.includes('Goals</NativeTabs.Trigger.Label>') &&
    !nativeTabs.includes('shouldUseExperimentalNativeTabs'),
  'native platforms must use the system tab bar for every OS version'
);
assert(
  historyRoute.includes('../src/history/HistoryScreen') &&
    historyRoute.includes('<HistoryScreen />') &&
    rootLayout.includes('<Stack.Screen name="history" />') &&
    !historyRoute.includes('reporting'),
  'the root History route must render the History shell outside the tab navigator'
);
assert(
  goalsRoute.includes('../src/goals/GoalsScreen') &&
    goalsRoute.includes('<GoalsScreen />') &&
    !goalsRoute.includes('coming soon'),
  'the Goals tab must render the replacement weekly-goals screen rather than a placeholder'
);
assert(
  goalsScreen.includes('goal-view-menu') &&
    goalsScreen.includes('goal-list') &&
    goalsScreen.includes('goal-history-circle') &&
    goalsScreen.includes('historicalCircleCount'),
  'Goals must expose overall filtering, weekly rows, historical status circles, and configured history length'
);
assert(
  goalsScreen.includes('evaluateGoal') &&
    goalsScreen.includes('trackerService.query') &&
    goalsScreen.includes('goal-rule-add') &&
    goalsScreen.includes('activity-duration') &&
    goalsScreen.includes('every-day'),
  'Goals must expose automatic habit and activity checks backed by live tracker data'
);
assert(
  goalsScreen.includes('router.push(`/goal-review/${goal.id}` as Href)') &&
    goalsScreen.includes('goal-edit-mode') &&
    goalsScreen.includes('reorderGoals') &&
    goalReviewScreen.includes('ReviewPanel') &&
    goalEditorScreen.includes('GoalEditor') &&
    goalsScreen.includes('setWeeklyStatus') &&
    goalsScreen.includes('goal-review-note') &&
    !goalsScreen.includes('goal-review-prompt'),
  'Goals must route review and editing to dedicated pages while persisting manual weekly statuses'
);
assert(
  tracker.includes("onHistory={() => router.push('/history')}") &&
    catalogHeader.includes('onHistory?: () => void') &&
    catalogHeader.includes('testID="tracker-history"') &&
    catalogHeader.includes('icon="clock"'),
  'Tracker must expose History through a top-right header action'
);
assert(
  history.includes('title="History"') &&
    history.includes('scrollable') &&
    history.includes("useState<HistoryRange>('day')") &&
    history.includes('logicalDayKey(Date.now())'),
  'History must default to a phone-friendly scrollable Day view for the current logical day'
);
assert(
  history.includes("'Day'") &&
    history.includes("'Week'") &&
    history.includes("'Month'") &&
    history.includes("'Year'") &&
    history.includes('history-range-selector'),
  'History must expose all four compact range choices'
);
assert(
  history.includes('history-previous') &&
    history.includes('history-period-label') &&
    history.includes('history-next') &&
    history.includes('history-today') &&
    history.includes('nextDisabled') &&
    history.includes('headerRight=') &&
    history.includes('isCurrentPeriod') &&
    history.includes('onPress={() => setSelectedAnchor(null)}') &&
    history.includes('const goBack = useCallback') &&
    history.includes("goBackInAppStack(router, '/')") &&
    !history.includes('todayButtonWrap'),
  'History must place Today beside the header while retaining its current-period hide guard'
);
assert(
  dayTimeline.includes("tick.kind === 'hour' ? 14 : 7") &&
    dayTimeline.includes('numberOfLines={1}') &&
    dayTimeline.includes('tick.y - 8') &&
    dayTimeline.includes('styles.hourMark'),
  'day timeline must align single-line hour labels with full and half-hour marks'
);
assert(
  pageHeader.includes('height: 42') &&
    pageHeader.includes('gap: 8') &&
    read('src/ui/AppScreen.tsx').includes('<PageHeader') &&
    catalogHeader.includes('<PageHeader') &&
    habitHeader.includes('<PageHeader'),
  'Goals, tracker, and habits must share one title row to stay aligned'
);
assert(
  !filterMenu.includes('width: 42') &&
    !iconButton.includes('marginHorizontal') &&
    !habitHeader.includes('iconSize={editOpen') &&
    iconButton.includes('const size = primary ? 46 : 42') &&
    catalogHeader.includes('<PopoverSurface') &&
    catalogHeader.includes('<NativeMenuButton') &&
    read('src/ui/PopoverSurface.tsx').includes('borderRadius: 16') &&
    read('src/ui/PopoverSurface.tsx').includes("overflow: 'hidden'"),
  'header actions must share one gap and one icon size, and the create menu must clip to its rounded surface'
);
assert(
  history.includes('accessibilityRole="tab"') &&
    history.includes('accessibilityLabel="History range"') &&
    history.includes('accessibilityHint="Shows the previous history period"') &&
    history.includes('accessibilityHint={') &&
    history.includes('testID="history-error"'),
  'History navigation and loading/error states must provide accessible identifiers and labels'
);
assert(
  history.includes('contentState?: HistoryContentState') &&
    history.includes('contentState: HistoryContentState') &&
    history.includes('testID="history-loading"') &&
    history.includes('testID="history-empty"') &&
    history.includes('testID="history-error"') &&
    history.includes('testID="history-retry"'),
  'History must keep theme-aware loading, empty, and retryable error surfaces ready for data views'
);
assert(
  history.includes('shiftLogicalDay') &&
    history.includes('weekBounds') &&
    history.includes('dateForLogicalDay') &&
    !history.includes("from '@reporting") &&
    !history.includes("from '../reporting"),
  'the shell must use existing date helpers and remain disconnected from the retired reporting layer'
);

console.log('Validated History tab shell, period navigation, accessibility, and state surfaces.');
