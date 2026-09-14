import {
  currentHistoryPeriod,
  historyDayPeriod,
  historyPeriodForDate,
  nextHistoryPeriod,
  shiftHistoryPeriod,
} from '@domain';

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
/* eslint-enable @typescript-eslint/no-require-imports */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const options = { rolloverHour: 4, weekStartsOn: 1 };
const day = historyDayPeriod('2026-09-14', options);
const nextDay = shiftHistoryPeriod(day, 1, options);
assert(nextDay.startLogicalDay === '2026-09-15', 'day navigation must use logical-day boundaries');

const week = historyPeriodForDate('week', '2026-09-16', options);
assert(
  week.startLogicalDay === '2026-09-14',
  'week navigation must honor the configured week start'
);

const current = currentHistoryPeriod('day', day.startMs + 8 * 60 * 60 * 1000, options);
assert(
  nextHistoryPeriod(current, options, day.startMs + 8 * 60 * 60 * 1000) === null,
  'future day navigation must be guarded'
);

const screen = fs.readFileSync(
  path.resolve(process.cwd(), 'src/history/HistoryScreen.tsx'),
  'utf8'
);
const sheet = fs.readFileSync(
  path.resolve(process.cwd(), 'src/history/HistoryDateJumpSheet.tsx'),
  'utf8'
);
assert(
  screen.includes('PanResponder.create'),
  'History content must support horizontal period swipes'
);
assert(
  screen.includes('Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2'),
  'period swipes must require clear horizontal intent'
);
assert(
  sheet.includes('history-date-jump-input') && sheet.includes('history-date-jump-submit'),
  'History must expose an accessible date-jump sheet'
);

console.log('Validated History period gestures, future guards, and date-jump surfaces.');
