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
const goalReviewNavigation = read('src/goals/goal-review-navigation.ts');
const catalogHeader = read('src/tracker/CatalogHeader.tsx');
const goalRowStart = goals.indexOf('function GoalRow(');
const goalRowEnd = goals.indexOf('export function ReviewPanel', goalRowStart);
const goalRow = goals.slice(goalRowStart, goalRowEnd);
const reviewPanelStart = goals.indexOf('export function ReviewPanel');
const reviewPanelEnd = goals.indexOf('function RuleEditor', reviewPanelStart);
const reviewPanel = goals.slice(reviewPanelStart, reviewPanelEnd);

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
  goalRow.includes('getRowSurfaceStyle') &&
    goalRow.includes('getRowSurfaceBackground') &&
    goalRow.includes('backgroundColor: getRowSurfaceBackground') &&
    !goalRow.includes('borderColor:') &&
    !goalRow.includes('borderWidth:'),
  'goal rows must use the shared borderless row surface without an outline'
);
assert(
  reviewPanel.includes("style={{ width: '100%' }}") &&
    !reviewPanel.includes('borderColor: colors.primary') &&
    !reviewPanel.includes('Record how each manual goal went for') &&
    reviewPanel.includes('formatWeek(currentWeek)') &&
    reviewPanel.includes('height: 72') &&
    reviewPanel.includes("maxWidth: '100%'") &&
    reviewPanel.includes("label={saving ? 'Saving...' : 'Save review'}"),
  'weekly review must be an unboxed, weekday-ranged, flexible-height form'
);
assert(
  goalReview.includes('goal-review-week-navigation') &&
    goalReview.includes('goal-review-previous-week') &&
    goalReview.includes('goal-review-next-week') &&
    goalReview.includes('goal-review-current-week') &&
    goalReview.includes('goal-review-no-previous-weeks') &&
    goalReview.includes('goal-review-retry') &&
    goalReview.includes('goalReviewWeekIndex') &&
    goalReview.includes('moveGoalReviewWeek') &&
    goalReview.includes('goalService.week(nextSnapshot.week.weekStart)') &&
    goalReviewNavigation.includes("weekday: 'short'"),
  'goal reviews must navigate bounded historical weeks with canonical date keys and retry states'
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
  catalogHeader.includes("icon={editMode ? 'check' : 'pencil'}") &&
    catalogHeader.includes("label={editMode ? 'Done' : 'Edit'}") &&
    goals.includes('<CatalogIconButton') &&
    goals.includes("label={editMode ? 'Done' : 'Edit'}") &&
    goals.includes('testID="goal-editor-screen"') &&
    goals.includes('testID="goal-save-retry"') &&
    goals.includes("label={saving ? 'Saving...' : goal ? 'Save goal' : 'Create goal'}") &&
    goals.includes('onPress={save}'),
  'goal editing must reuse the tracker pencil style and expose a reachable busy/error/retry save'
);
assert(
  !goals.includes('goals-current-week') &&
    !goals.includes('Past weeks') &&
    !goals.includes('Update review') &&
    !goals.includes('Manual review'),
  'Goals must omit the removed summary and inline review labels'
);

console.log('Validated routed Goals review/editor flows, ordering controls, and color boundaries.');
