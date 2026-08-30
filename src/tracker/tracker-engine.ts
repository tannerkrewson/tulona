import {
  isUuid,
  materializeIntervals,
  timestampMs,
  type IsoTimestamp,
  type MaterializeOptions,
  type TimeInterval,
  type TimeTransition,
} from '@domain';

export interface TrackerRange {
  startMs: number;
  endMs: number;
}

export interface TrackerQuery {
  range: TrackerRange;
  nowMs: number;
  transitions: TimeTransition[];
  intervals: TimeInterval[];
  activeTransition: TimeTransition | null;
}

function transitionTime(transition: TimeTransition): number | null {
  try {
    const value = timestampMs(transition.timestamp);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function createdTime(transition: TimeTransition): number {
  try {
    return timestampMs(transition.createdAt);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** Deterministic ordering for raw transition records. */
export function compareTransitions(left: TimeTransition, right: TimeTransition): number {
  const leftTime = transitionTime(left);
  const rightTime = transitionTime(right);
  if (leftTime === null) return rightTime === null ? left.id.localeCompare(right.id) : 1;
  if (rightTime === null) return -1;
  return (
    leftTime - rightTime ||
    createdTime(left) - createdTime(right) ||
    left.id.localeCompare(right.id)
  );
}

export function orderTransitions(transitions: readonly TimeTransition[]): TimeTransition[] {
  return [...transitions].sort(compareTransitions);
}

function isValidTransition(transition: TimeTransition, now: number): boolean {
  const timestamp = transitionTime(transition);
  return (
    transition.status === 'recorded' &&
    timestamp !== null &&
    timestamp <= now &&
    isUuid(transition.id) &&
    (transition.activityId === null || isUuid(transition.activityId))
  );
}

export function validTransitions(
  transitions: readonly TimeTransition[],
  nowMs = Date.now()
): TimeTransition[] {
  if (!Number.isFinite(nowMs)) throw new RangeError('Current time must be finite');
  return orderTransitions(transitions).filter((transition) => isValidTransition(transition, nowMs));
}

/** Derives the one active state from the latest recorded transition. */
export function latestValidTransition(
  transitions: readonly TimeTransition[],
  nowMs = Date.now()
): TimeTransition | null {
  return validTransitions(transitions, nowMs).at(-1) ?? null;
}

export const getActiveTransition = latestValidTransition;
export const deriveActiveTransition = latestValidTransition;

export function materializeTransitionIntervals(
  transitions: readonly TimeTransition[],
  options: MaterializeOptions
): TimeInterval[] {
  return materializeIntervals(orderTransitions(transitions), options);
}

export function queryTransitions(
  transitions: readonly TimeTransition[],
  range: TrackerRange,
  nowMs: number
): TrackerQuery {
  if (!Number.isFinite(range.startMs) || !Number.isFinite(range.endMs)) {
    throw new RangeError('Tracker range must be finite');
  }
  if (range.endMs < range.startMs) throw new RangeError('Range end must not precede range start');
  if (!Number.isFinite(nowMs)) throw new RangeError('Current time must be finite');
  const ordered = orderTransitions(transitions);
  return {
    range,
    nowMs,
    transitions: ordered,
    intervals: materializeTransitionIntervals(ordered, { ...range, nowMs }),
    activeTransition: latestValidTransition(ordered, nowMs),
  };
}

export interface TransitionInput {
  id?: string;
  activityId: string | null;
  timestamp: Date | number | IsoTimestamp;
  source?: TimeTransition['source'];
  note?: string | null;
}
