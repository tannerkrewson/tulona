import type {
  Goal,
  GoalOverallStatus,
  GoalSettings,
  GoalStatusDefinition,
  LogicalDayKey,
} from './models';
import { weekBounds, type MillisecondRange } from './time';

export interface GoalWeekIdentity extends MillisecondRange {
  weekStart: LogicalDayKey;
  weekEnd: LogicalDayKey;
}

export interface GoalWeekOptions {
  rolloverHour?: number;
  weekStartsOn?: number;
}

export type GoalOverallStatusFilter = GoalOverallStatus | 'all';

export const DEFAULT_GOAL_REVIEW_DAY = 0;
export const DEFAULT_GOAL_HISTORICAL_CIRCLE_COUNT = 8;
export const MIN_GOAL_HISTORICAL_CIRCLE_COUNT = 1;
export const MAX_GOAL_HISTORICAL_CIRCLE_COUNT = 52;

const DEFAULT_STATUS_IDS = {
  goodProgress: '00000000-0000-4000-8000-000000000001',
  partialProgress: '00000000-0000-4000-8000-000000000002',
  noProgress: '00000000-0000-4000-8000-000000000003',
  paused: '00000000-0000-4000-8000-000000000004',
} as const;

/** Fresh datasets start with four global statuses and their fixed semantic colors. */
export const DEFAULT_GOAL_STATUS_DEFINITIONS: readonly GoalStatusDefinition[] = [
  {
    id: DEFAULT_STATUS_IDS.goodProgress,
    name: 'Good progress',
    color: 'green',
    sortOrder: 0,
  },
  {
    id: DEFAULT_STATUS_IDS.partialProgress,
    name: 'Partial progress',
    color: 'yellow',
    sortOrder: 1,
  },
  {
    id: DEFAULT_STATUS_IDS.noProgress,
    name: 'No progress',
    color: 'red',
    sortOrder: 2,
  },
  {
    id: DEFAULT_STATUS_IDS.paused,
    name: 'Paused',
    color: 'light-grey',
    sortOrder: 3,
  },
];

export function defaultGoalSettings(): GoalSettings {
  return {
    reviewDay: DEFAULT_GOAL_REVIEW_DAY,
    historicalCircleCount: DEFAULT_GOAL_HISTORICAL_CIRCLE_COUNT,
    statusDefinitions: DEFAULT_GOAL_STATUS_DEFINITIONS.map((definition) => ({ ...definition })),
  };
}

/** Resolves any date to the canonical week identity used by weekly goal records. */
export function goalWeekIdentity(
  value: Date | number | string,
  options: GoalWeekOptions = {}
): GoalWeekIdentity {
  const bounds = weekBounds(value, options.weekStartsOn ?? 0, {
    rolloverHour: options.rolloverHour ?? 0,
  });
  return {
    weekStart: bounds.start.key,
    weekEnd: bounds.end.key,
    startMs: bounds.start.startMs,
    endMs: bounds.end.endMs,
  };
}

export function goalWeekStart(
  value: Date | number | string,
  options: GoalWeekOptions = {}
): LogicalDayKey {
  return goalWeekIdentity(value, options).weekStart;
}

export function filterGoalsByOverallStatus(
  goals: readonly Goal[],
  status: GoalOverallStatusFilter
): Goal[] {
  return status === 'all' ? [...goals] : goals.filter((goal) => goal.overallStatus === status);
}

export function sortGoalStatusDefinitions(
  definitions: readonly GoalStatusDefinition[]
): GoalStatusDefinition[] {
  return [...definitions]
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id))
    .map((definition, index) => ({ ...definition, sortOrder: index }));
}
