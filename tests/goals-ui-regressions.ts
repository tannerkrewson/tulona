/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
/* eslint-enable @typescript-eslint/no-require-imports */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = path.resolve(process.cwd());
const read = (relativePath: string): string =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');
const goals = read('src/goals/GoalsScreen.tsx');

assert(
  goals.includes('function GoalEditor') &&
    goals.includes('Create goal') &&
    goals.includes('Save goal') &&
    goals.includes('Delete goal'),
  'Goals must provide create, edit, save, and delete controls'
);
assert(
  goals.includes('Manual review') &&
    goals.includes('Automatic checks') &&
    goals.includes('goal-review-panel') &&
    goals.includes('goal-review-save'),
  'Goals must provide both manual and automatic weekly status workflows'
);
assert(
  goals.includes('At least this much time') &&
    goals.includes('At most this much time') &&
    goals.includes('baselineMinutes') &&
    goals.includes('No skipped days'),
  'automatic goals must support activity limits, reduction baselines, and habit completion rules'
);
assert(
  !goals.includes('ColorPicker') &&
    !goals.includes('color: string') &&
    !goals.includes('goal color'),
  'Goals must not reintroduce custom goal colors'
);

console.log('Validated Goals page, editor, automatic checks, manual review, and color boundaries.');
