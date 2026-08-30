import {
  clipInterval,
  formatCountdown,
  formatDuration,
  logicalDayBounds,
  logicalDayKey,
  materializeIntervals,
  reorder,
  sortByOrder,
  createId,
  isUuid,
  timestampMs,
} from '../src/domain';
import type { Transition } from '../src/domain';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected)
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

function transition(id: string, timestamp: string, activityId: string | null): Transition {
  return {
    id,
    activityId,
    timestamp,
    source: 'manual',
    status: 'recorded',
    createdAt: timestamp,
    correctionOfId: null,
    note: null,
  };
}

const id = createId();
assert(isUuid(id), 'createId must return a UUID');

// Build instants from local clock fields so the same local-time contract runs under UTC and EDT.
function localTimestamp(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): string {
  return new Date(year, month - 1, day, hour, minute, second).toISOString();
}

const beforeRollover = localTimestamp(2026, 8, 29, 2, 59, 59);
const atRollover = localTimestamp(2026, 8, 29, 3, 0, 0);
const afterRollover = localTimestamp(2026, 8, 29, 3, 0, 1);
const atMidnight = localTimestamp(2026, 8, 29, 0, 0, 0);
assertEqual(logicalDayKey(atMidnight), '2026-08-29', 'midnight rollover boundary');
assertEqual(
  logicalDayKey(beforeRollover, { rolloverHour: 3 }),
  '2026-08-28',
  'custom rollover before boundary'
);
assertEqual(
  logicalDayKey(atRollover, { rolloverHour: 3 }),
  '2026-08-29',
  'custom rollover at boundary'
);
assertEqual(
  logicalDayKey(afterRollover, { rolloverHour: 3 }),
  '2026-08-29',
  'custom rollover after boundary'
);
const bounds = logicalDayBounds(atRollover, { rolloverHour: 3 });
assertEqual(bounds.key, '2026-08-29', 'custom rollover bounds key');
assertEqual(new Date(bounds.startMs).getHours(), 3, 'custom rollover bounds start hour');
assertEqual(new Date(bounds.endMs).getHours(), 3, 'custom rollover bounds end hour');
assertEqual(bounds.endMs - bounds.startMs, 24 * 60 * 60 * 1000, 'logical day length');

assertEqual(formatDuration(3_723_000), '1h 02m', 'duration formatting');
assertEqual(formatCountdown(3_723_000), '1:02:03', 'countdown formatting');
assertEqual(formatCountdown(-2_000), '-0:02', 'negative countdown formatting');

const clipped = clipInterval({ startMs: 10, endMs: 30 }, { startMs: 20, endMs: 40 });
assert(clipped !== null, 'overlapping interval should clip');
assertEqual(clipped.startMs, 20, 'interval start clipping');
assertEqual(clipped.endMs, 30, 'interval end clipping');

const intervals = materializeIntervals(
  [
    transition('before', '1970-01-01T00:00:00.000Z', 'a'),
    transition('inside', '1970-01-01T00:00:05.000Z', 'b'),
    transition('future', '1970-01-01T00:00:09.000Z', 'c'),
  ],
  { startMs: 0, endMs: 10_000, nowMs: 8_000 }
);
assertEqual(intervals.length, 2, 'future transitions must not create intervals');
assertEqual(intervals[0].startMs, 0, 'prior transition must establish range state');
assertEqual(intervals[0].endMs, 5_000, 'first interval ends at next transition');
assertEqual(intervals[1].endMs, 8_000, 'last interval ends at now');

const crossingMidnight = materializeIntervals(
  [
    transition('before-midnight', localTimestamp(2026, 8, 29, 23, 30, 0), 'a'),
    transition('after-midnight', localTimestamp(2026, 8, 30, 0, 30, 0), 'b'),
  ],
  {
    startMs: timestampMs(localTimestamp(2026, 8, 29, 23, 45, 0)),
    endMs: timestampMs(localTimestamp(2026, 8, 30, 0, 45, 0)),
    nowMs: timestampMs(localTimestamp(2026, 8, 30, 1, 0, 0)),
  }
);
assertEqual(crossingMidnight.length, 2, 'midnight clipping keeps both derived intervals');
assertEqual(
  crossingMidnight[0].startMs,
  timestampMs(localTimestamp(2026, 8, 29, 23, 45, 0)),
  'midnight clipping uses the requested range start'
);
assertEqual(
  crossingMidnight[0].endMs,
  timestampMs(localTimestamp(2026, 8, 30, 0, 30, 0)),
  'midnight clipping ends at the next transition'
);
assertEqual(
  crossingMidnight[1].endMs,
  timestampMs(localTimestamp(2026, 8, 30, 0, 45, 0)),
  'midnight clipping uses the requested range end'
);

const ordered = sortByOrder([
  { sortOrder: 1, id: 'b' },
  { sortOrder: 1, id: 'c' },
  { sortOrder: 0, id: 'a' },
]);
assertEqual(ordered.map((item) => item.id).join(','), 'a,b,c', 'sort must be stable');
const reordered = reorder(
  [
    { sortOrder: 9, id: 'a' },
    { sortOrder: 9, id: 'b' },
    { sortOrder: 9, id: 'c' },
  ],
  2,
  0
);
assertEqual(
  reordered.map((item) => item.id).join(','),
  'c,a,b',
  'reorder preserves requested order'
);
assertEqual(
  new Set(reordered.map((item) => item.sortOrder)).size,
  3,
  'reorder normalizes unique order values'
);
