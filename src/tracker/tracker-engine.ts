import {
  compareText,
  isUuid,
  materializeIntervals,
  timestampMs,
  type IsoTimestamp,
  type HistoricalActivitySnapshot,
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

/**
 * Transition records are immutable and shared between history snapshots, so
 * parsed times and ID checks are memoized per record rather than redone for
 * the whole history after every write.
 */
const parsedTimes = new WeakMap<TimeTransition, { timestamp: string; ms: number | null }>();
const validRecords = new WeakMap<TimeTransition, boolean>();

function transitionTime(transition: TimeTransition): number | null {
  const cached = parsedTimes.get(transition);
  if (cached && cached.timestamp === transition.timestamp) return cached.ms;
  let ms: number | null;
  try {
    const value = timestampMs(transition.timestamp);
    ms = Number.isFinite(value) ? value : null;
  } catch {
    ms = null;
  }
  parsedTimes.set(transition, { timestamp: transition.timestamp, ms });
  return ms;
}

/** Milliseconds for a stored transition, or null when its timestamp is invalid. */
export const transitionTimeMs = transitionTime;

function hasValidIds(transition: TimeTransition): boolean {
  let valid = validRecords.get(transition);
  if (valid === undefined) {
    valid =
      isUuid(transition.id) && (transition.activityId === null || isUuid(transition.activityId));
    validRecords.set(transition, valid);
  }
  return valid;
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
  if (leftTime === null) return rightTime === null ? compareText(left.id, right.id) : 1;
  if (rightTime === null) return -1;
  return (
    leftTime - rightTime || createdTime(left) - createdTime(right) || compareText(left.id, right.id)
  );
}

interface TimelineIndex {
  ordered: TimeTransition[];
  /** Recorded transitions with valid IDs and timestamps, in order. */
  valid: TimeTransition[];
  validTimes: number[];
}

/**
 * Indexes are memoized per array, so the repository's cached history is
 * ordered and validated once instead of on every lookup. Indexed arrays must
 * never be mutated.
 */
const timelineIndexes = new WeakMap<readonly TimeTransition[], TimelineIndex>();

function timelineIndex(transitions: readonly TimeTransition[]): TimelineIndex {
  const cached = timelineIndexes.get(transitions);
  if (cached) return cached;
  let ordered = transitions as TimeTransition[];
  for (let index = 1; index < transitions.length; index += 1) {
    if (compareTransitions(transitions[index - 1], transitions[index]) > 0) {
      ordered = [...transitions].sort(compareTransitions);
      break;
    }
  }
  const valid: TimeTransition[] = [];
  const validTimes: number[] = [];
  for (const transition of ordered) {
    const time = transitionTime(transition);
    if (transition.status === 'recorded' && time !== null && hasValidIds(transition)) {
      valid.push(transition);
      validTimes.push(time);
    }
  }
  const index = { ordered, valid, validTimes };
  timelineIndexes.set(transitions, index);
  if (ordered !== transitions) timelineIndexes.set(ordered, index);
  return index;
}

/** Number of valid transitions at or before `nowMs`. */
function validCountAt(index: TimelineIndex, nowMs: number): number {
  let low = 0;
  let high = index.validTimes.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (index.validTimes[middle] <= nowMs) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function orderTransitions(transitions: readonly TimeTransition[]): TimeTransition[] {
  return timelineIndex(transitions).ordered;
}

export function validTransitions(
  transitions: readonly TimeTransition[],
  nowMs = Date.now()
): TimeTransition[] {
  if (!Number.isFinite(nowMs)) throw new RangeError('Current time must be finite');
  const index = timelineIndex(transitions);
  const count = validCountAt(index, nowMs);
  return count === index.valid.length ? index.valid : index.valid.slice(0, count);
}

/** Derives the one active state from the latest recorded transition. */
export function latestValidTransition(
  transitions: readonly TimeTransition[],
  nowMs = Date.now()
): TimeTransition | null {
  if (!Number.isFinite(nowMs)) throw new RangeError('Current time must be finite');
  const index = timelineIndex(transitions);
  return index.valid[validCountAt(index, nowMs) - 1] ?? null;
}

/** Returns the most recent recorded activity transition, ignoring stop markers. */
export function latestValidActivityTransition(
  transitions: readonly TimeTransition[],
  nowMs = Date.now()
): TimeTransition | null {
  if (!Number.isFinite(nowMs)) throw new RangeError('Current time must be finite');
  const index = timelineIndex(transitions);
  for (let position = validCountAt(index, nowMs) - 1; position >= 0; position -= 1) {
    if (index.valid[position].activityId !== null) return index.valid[position];
  }
  return null;
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
  /** Optional direct snapshot for imports or callers with an already-resolved catalog item. */
  activitySnapshot?: HistoricalActivitySnapshot | null;
}
