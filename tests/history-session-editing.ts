/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
/* eslint-enable @typescript-eslint/no-require-imports */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = path.resolve(process.cwd());
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const screen = read('src/tracker/ActivitySessionScreen.tsx');
const editor = read('src/tracker/HistoricalSessionEditor.tsx');
const service = read('src/tracker/tracker-service.ts');

assert(
  screen.includes('HistoricalSessionEditor') &&
    screen.includes('transition.activitySnapshot?.name') &&
    screen.includes('editTransition(following.id, { timestamp: nextTimestamp })'),
  'the session detail page must render historical editing and prefer immutable snapshot names'
);
assert(
  editor.includes('activity-session-start') &&
    editor.includes('activity-session-end') &&
    editor.includes('activity-session-save-start') &&
    editor.includes('activity-session-save-end') &&
    editor.includes('Start must remain before the session end.') &&
    editor.includes('End must remain after the session start.'),
  'historical session editing must expose start/end controls with local validation'
);
assert(
  service.includes('this.assertEditOrder') &&
    service.includes('Edited transition must remain before the following transition'),
  'tracker service must remain the final overlap/order validator'
);

console.log(
  'Validated historical session editing, snapshot labels, and overlap validation wiring.'
);
