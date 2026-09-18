import { goalWeekIdentity } from '../src/domain';
import {
  formatGoalWeek,
  goalReviewWeekIndex,
  moveGoalReviewWeek,
} from '../src/goals/goal-review-navigation';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const previousWeek = goalWeekIdentity(new Date(2026, 8, 9, 12), { weekStartsOn: 1 });
const currentWeek = goalWeekIdentity(new Date(2026, 8, 16, 12), { weekStartsOn: 1 });
const weeks = [previousWeek, currentWeek];

assert(
  formatGoalWeek(currentWeek, 'en-US') === 'Mon, Sep 14 – Sun, Sep 20',
  'goal review ranges must include both weekday names and month/day values'
);
assert(goalReviewWeekIndex(weeks, null) === 1, 'a reload must select the current week by default');
assert(
  goalReviewWeekIndex(weeks, previousWeek.weekStart) === 0,
  'a selected logical week must survive a reload when it is still available'
);
assert(
  goalReviewWeekIndex(weeks, '2026-08-31' as typeof previousWeek.weekStart) === 1,
  'a missing selected week must fall back to the current week'
);
assert(
  goalReviewWeekIndex([], null) === -1,
  'empty review history must expose the no-week boundary'
);
assert(
  moveGoalReviewWeek(1, 'previous', weeks.length) === 0 &&
    moveGoalReviewWeek(0, 'previous', weeks.length) === null &&
    moveGoalReviewWeek(0, 'next', weeks.length) === 1 &&
    moveGoalReviewWeek(1, 'next', weeks.length) === null,
  'review navigation must stop at the oldest and current week boundaries'
);
assert(
  moveGoalReviewWeek(-1, 'previous', weeks.length) === null &&
    moveGoalReviewWeek(0, 'next', 0) === null,
  'review navigation must reject unavailable or invalid week ranges'
);

console.log(
  'Validated goal review weekday ranges, selection persistence, boundaries, and empty history.'
);
