import {
  historyDayPeriod,
  type HistoricalActivitySnapshot,
  type HistorySession,
  type TimeTransition,
} from '@domain';

import { materializeDayTimelineEntries } from '../src/history/history-day-data';
import { dayTimelineConnectorPath } from '../src/history/history-connectors';
import {
  DAY_TIMELINE_HOUR_HEIGHT,
  DAY_TIMELINE_MIN_MARKER_HEIGHT,
  DAY_TIMELINE_ROW_GAP,
  DAY_TIMELINE_ROW_HEIGHT,
  layoutDayTimeline,
} from '../src/history/day-timeline-layout';

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
/* eslint-enable @typescript-eslint/no-require-imports */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function transition(
  id: string,
  timestampMs: number,
  activityId: string | null,
  activitySnapshot?: HistoricalActivitySnapshot
): TimeTransition {
  const timestamp = new Date(timestampMs).toISOString();
  return {
    id,
    activityId,
    timestamp,
    source: 'manual',
    status: 'recorded',
    createdAt: timestamp,
    correctionOfId: null,
    note: null,
    activitySnapshot,
  };
}

function session(
  id: string,
  startMs: number,
  endMs: number,
  activityId = 'activity-a',
  isRunning = false
): HistorySession {
  return { transitionId: id, activityId, startMs, endMs, isRunning };
}

const period = historyDayPeriod('2026-09-14', { rolloverHour: 4 });
const hour = 60 * 60 * 1000;

const gapped = layoutDayTimeline(
  [
    { session: session('long-a', period.startMs + hour, period.startMs + 3 * hour) },
    { session: session('long-b', period.startMs + 8 * hour, period.startMs + 9 * hour) },
    { session: session('long-c', period.startMs + 16 * hour, period.startMs + 22 * hour) },
  ],
  period
);
assert(gapped.railHeight === 24 * DAY_TIMELINE_HOUR_HEIGHT, 'the day rail must cover 24 hours');
assert(gapped.rows.length === 3, 'long sessions should remain separate rows');
assert(gapped.rows[0].trueStartY === DAY_TIMELINE_HOUR_HEIGHT, 'rail anchors must be proportional');
assert(
  gapped.rows.every(
    (row, index) =>
      index === 0 ||
      row.rowTop >= gapped.rows[index - 1].rowTop + DAY_TIMELINE_ROW_HEIGHT + DAY_TIMELINE_ROW_GAP
  ),
  'packed rows must never overlap'
);
assert(
  gapped.rows.every(
    (row) => row.rowCenterY >= row.trueMidpointY || row.rowTop <= row.trueMidpointY
  ),
  'rows must retain a truthful midpoint anchor even when packed'
);

const dense = layoutDayTimeline(
  Array.from({ length: 24 }, (_, index) => ({
    session: session(
      `dense-${index}`,
      period.startMs + 5 * hour + index * 2 * 60 * 1000,
      period.startMs + 5 * hour + index * 2 * 60 * 1000 + 20 * 1000
    ),
  })),
  period
);
assert(dense.contentHeight > dense.railHeight, 'dense days may grow beyond the base rail');
assert(
  dense.rows.every(
    (row, index) =>
      index === 0 ||
      row.rowTop >= dense.rows[index - 1].rowTop + DAY_TIMELINE_ROW_HEIGHT + DAY_TIMELINE_ROW_GAP
  ),
  'dense short-session rows must stay readable and ordered'
);
assert(
  dense.rows.every((row) => row.markerHeight >= DAY_TIMELINE_MIN_MARKER_HEIGHT),
  'sub-minute sessions need a discoverable minimum marker'
);
assert(
  dense.rows.every((row, index) => index === 0 || row.startMs >= dense.rows[index - 1].startMs),
  'rows must remain chronological'
);

const tiny = layoutDayTimeline(
  [
    {
      session: session(
        'tiny',
        period.startMs + 12 * hour + 20 * 1000,
        period.startMs + 12 * hour + 21 * 1000
      ),
    },
  ],
  period
);
assert(
  tiny.rows[0].trueEndY - tiny.rows[0].trueStartY < DAY_TIMELINE_MIN_MARKER_HEIGHT,
  'tiny geometry must remain truthful'
);
assert(
  Math.abs(tiny.rows[0].markerTop + tiny.rows[0].markerHeight / 2 - tiny.rows[0].trueMidpointY) <
    0.001,
  'tiny markers must be centered on the true time'
);

const crossingTransitions = [
  transition('crossing-start', period.startMs - 30 * 60 * 1000, 'activity-a', {
    id: 'activity-a',
    kind: 'activity',
    name: 'Old name',
    color: '#2563EB',
    iconName: 'activity',
    folderId: 'folder-old',
    folderName: 'Old folder',
  }),
  transition('crossing-next', period.startMs + 20 * 60 * 1000, 'activity-b'),
  transition('crossing-stop', period.endMs + 15 * 60 * 1000, null),
];
const crossingEntries = materializeDayTimelineEntries(
  crossingTransitions,
  period,
  period.endMs + hour
);
assert(crossingEntries.length === 2, 'null activity gaps must remain blank');
assert(
  crossingEntries[0].continuesBefore,
  'a session crossing the day start needs a quiet continuation'
);
assert(
  crossingEntries[1].continuesAfter,
  'a session crossing the day end needs a quiet continuation'
);
assert(
  crossingEntries[0].session.startMs === period.startMs,
  'crossing sessions must be clipped at the day start'
);
assert(
  crossingEntries[1].session.endMs === period.endMs,
  'crossing sessions must be clipped at the day end'
);
assert(
  crossingEntries[0].session.activitySnapshot?.name === 'Old name',
  'history must retain snapshots'
);

const runningPeriod = historyDayPeriod('2026-09-14', { rolloverHour: 0 });
const runningNow = runningPeriod.startMs + 90 * 60 * 1000;
const runningEntries = materializeDayTimelineEntries(
  [transition('running', runningPeriod.startMs + 30 * 60 * 1000, 'activity-a')],
  runningPeriod,
  runningNow
);
assert(
  runningEntries.length === 1 && runningEntries[0].session.isRunning,
  'running sessions must appear live'
);
assert(
  runningEntries[0].session.endMs === runningNow,
  'running sessions must extend to the current time'
);

const connector = dayTimelineConnectorPath({
  transitionId: 'connector',
  railX: 59,
  railY: 100,
  rowX: 120,
  rowY: 160,
  routeOffset: -3,
});
assert(connector.startsWith('M 59 100 C '), 'connectors must be SVG paths from the rail');
assert(connector.endsWith('120 160'), 'connectors must terminate at the row center');

const root = path.resolve(process.cwd());
const dayTimelineSource = fs.readFileSync(path.join(root, 'src/history/DayTimeline.tsx'), 'utf8');
const screenSource = fs.readFileSync(path.join(root, 'src/history/HistoryScreen.tsx'), 'utf8');
assert(
  dayTimelineSource.includes('materializeDayTimelineEntries'),
  'Day must use real history sessions'
);
assert(dayTimelineSource.includes('react-native-svg'), 'Day connectors must use react-native-svg');
assert(
  dayTimelineSource.includes('accessibilityLabel={accessibilityLabel}'),
  'session rows need accessible labels'
);
assert(
  dayTimelineSource.includes('history-session-row-'),
  'session rows must expose stable test IDs'
);
assert(
  dayTimelineSource.includes('sameColorAdjacent'),
  'same-color adjacent sessions need separation'
);
assert(
  dayTimelineSource.includes('colors.background'),
  'the rail separation must use theme neutrals'
);
assert(dayTimelineSource.includes('colors.surface'), 'session rows must use theme surfaces');
assert(
  screenSource.includes('setRange({ startMs: period.startMs, endMs: period.endMs })'),
  'Day must query only the selected logical-day range'
);
assert(screenSource.includes('useFocusEffect'), 'Day data must refresh when History regains focus');
assert(
  screenSource.includes('logicalDayKey(Date.now())'),
  'History must retain a current-day fallback before runtime load'
);

console.log(
  'Validated History Day geometry, packing, short sessions, boundaries, running state, SVG connectors, theming, and accessibility.'
);
