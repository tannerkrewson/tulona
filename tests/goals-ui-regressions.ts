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
const goalEditor = read('src/goals/GoalEditorScreen.tsx');
const goalReview = read('src/goals/GoalReviewScreen.tsx');

assert(
  goals.includes('function GoalEditor') &&
    goals.includes('Create goal') &&
    goals.includes('Save goal') &&
    goals.includes('Delete goal'),
  'Goals must provide create, edit, save, and delete controls'
);
assert(
  goals.includes('goal-review-panel') &&
    goals.includes('goal-review-save') &&
    goalReview.includes('ReviewPanel') &&
    goalReview.includes('goal-automatic-review'),
  'Goals must provide routed manual and automatic weekly status workflows'
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
assert(
  goals.includes('goal-edit-mode') &&
    goals.includes('onReview={() => router.push(`/goal-review/${goal.id}` as Href)}') &&
    goals.includes("router.push('/goal-edit/new' as Href)") &&
    goalEditor.includes('GoalEditor'),
  'Goals must use a top-level edit mode and dedicated goal editor pages'
);
assert(
  !goals.includes('goals-current-week') &&
    !goals.includes('Past weeks') &&
    !goals.includes('Update review') &&
    !goals.includes('Manual review'),
  'Goals must omit the removed summary and inline review labels'
);

console.log('Validated routed Goals review/editor flows, ordering controls, and color boundaries.');
