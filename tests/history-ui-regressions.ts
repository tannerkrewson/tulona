/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
/* eslint-enable @typescript-eslint/no-require-imports */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = path.resolve(process.cwd());
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const tabs = read('app/(tabs)/_layout.tsx');
const route = read('app/(tabs)/history.tsx');
const history = read('src/history/HistoryScreen.tsx');

assert(
  tabs.includes('name="history"') &&
    tabs.includes("title: 'History'") &&
    tabs.includes("tabBarAccessibilityLabel: 'History tab'") &&
    tabs.includes('name="clock"'),
  'the transitional third tab must present History with the neutral clock icon'
);
assert(
  route.includes('../../src/history/HistoryScreen') &&
    route.includes('<HistoryScreen />') &&
    !route.includes('reporting'),
  'the visible third tab route must render the new History shell instead of retired reporting UI'
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
    history.includes('nextDisabled'),
  'History must expose period navigation, a current-period label, Today, and a future guard'
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
