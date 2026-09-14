import type { HistoryPeriod, HistorySession } from '@domain';

export const DAY_TIMELINE_HOUR_HEIGHT = 64;
export const DAY_TIMELINE_ROW_HEIGHT = 58;
export const DAY_TIMELINE_ROW_GAP = 10;
export const DAY_TIMELINE_MIN_MARKER_HEIGHT = 4;
export const DAY_TIMELINE_TOP_PADDING = 4;
export const DAY_TIMELINE_BOTTOM_PADDING = 28;

export interface DayTimelineEntry {
  session: HistorySession;
  continuesBefore?: boolean;
  continuesAfter?: boolean;
}

export interface DayTimelineHourTick {
  atMs: number;
  label: string;
  y: number;
}

export interface DayTimelineRowGeometry {
  transitionId: string;
  activityId: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  trueStartY: number;
  trueEndY: number;
  trueMidpointY: number;
  markerTop: number;
  markerHeight: number;
  rowTop: number;
  rowCenterY: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

export interface DayTimelineLayout {
  railHeight: number;
  contentHeight: number;
  rows: DayTimelineRowGeometry[];
  hourTicks: DayTimelineHourTick[];
}

export interface DayTimelineLayoutOptions {
  hourHeight?: number;
  rowHeight?: number;
  rowGap?: number;
  topPadding?: number;
  bottomPadding?: number;
  minMarkerHeight?: number;
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function readableHour(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Returns local wall-clock hour marks without assuming every day is 24 elapsed hours. */
export function dayTimelineHourTicks(
  period: Pick<HistoryPeriod, 'startMs' | 'endMs'>,
  hourHeight = DAY_TIMELINE_HOUR_HEIGHT
): DayTimelineHourTick[] {
  if (!Number.isFinite(period.startMs) || !Number.isFinite(period.endMs)) return [];
  if (period.endMs <= period.startMs) return [];

  const ticks: DayTimelineHourTick[] = [];
  const date = new Date(period.startMs);
  let previousMs = period.startMs - 1;
  while (date.getTime() < period.endMs) {
    const atMs = date.getTime();
    if (!Number.isFinite(atMs) || atMs <= previousMs) break;
    const y =
      ((atMs - period.startMs) / (period.endMs - period.startMs)) *
      (hourHeight * ((period.endMs - period.startMs) / (60 * 60 * 1000)));
    ticks.push({ atMs, label: readableHour(date), y });
    previousMs = atMs;
    date.setHours(date.getHours() + 1, 0, 0, 0);
  }
  return ticks;
}

function rowTopFor(
  midpointY: number,
  previousBottom: number,
  rowHeight: number,
  rowGap: number,
  topPadding: number
): number {
  return Math.max(topPadding, midpointY - rowHeight / 2, previousBottom + rowGap);
}

/**
 * Packs readable rows around their true rail midpoint while preserving time order.
 * The second pass pulls a dense tail upward where doing so does not cause overlap.
 */
export function layoutDayTimeline(
  entries: readonly DayTimelineEntry[],
  period: Pick<HistoryPeriod, 'startMs' | 'endMs'>,
  options: DayTimelineLayoutOptions = {}
): DayTimelineLayout {
  const hourHeight = finite(
    options.hourHeight ?? DAY_TIMELINE_HOUR_HEIGHT,
    DAY_TIMELINE_HOUR_HEIGHT
  );
  const rowHeight = finite(options.rowHeight ?? DAY_TIMELINE_ROW_HEIGHT, DAY_TIMELINE_ROW_HEIGHT);
  const rowGap = finite(options.rowGap ?? DAY_TIMELINE_ROW_GAP, DAY_TIMELINE_ROW_GAP);
  const topPadding = finite(
    options.topPadding ?? DAY_TIMELINE_TOP_PADDING,
    DAY_TIMELINE_TOP_PADDING
  );
  const bottomPadding = finite(
    options.bottomPadding ?? DAY_TIMELINE_BOTTOM_PADDING,
    DAY_TIMELINE_BOTTOM_PADDING
  );
  const minMarkerHeight = finite(
    options.minMarkerHeight ?? DAY_TIMELINE_MIN_MARKER_HEIGHT,
    DAY_TIMELINE_MIN_MARKER_HEIGHT
  );
  const periodDurationMs = period.endMs - period.startMs;
  const railHeight =
    Number.isFinite(periodDurationMs) && periodDurationMs > 0
      ? (periodDurationMs / (60 * 60 * 1000)) * hourHeight
      : 0;

  if (!Number.isFinite(periodDurationMs) || periodDurationMs <= 0) {
    return { railHeight: 0, contentHeight: 0, rows: [], hourTicks: [] };
  }

  const sorted = [...entries]
    .filter(
      ({ session }) =>
        Number.isFinite(session.startMs) &&
        Number.isFinite(session.endMs) &&
        session.endMs > session.startMs
    )
    .sort(
      (left, right) =>
        left.session.startMs - right.session.startMs ||
        left.session.endMs - right.session.endMs ||
        left.session.transitionId.localeCompare(right.session.transitionId)
    );

  const draftRows = sorted.map(({ session, continuesBefore = false, continuesAfter = false }) => {
    const trueStartY = clamp(
      ((session.startMs - period.startMs) / periodDurationMs) * railHeight,
      0,
      railHeight
    );
    const trueEndY = clamp(
      ((session.endMs - period.startMs) / periodDurationMs) * railHeight,
      0,
      railHeight
    );
    const trueMidpointY = (trueStartY + trueEndY) / 2;
    const markerHeight = Math.max(minMarkerHeight, trueEndY - trueStartY);
    return {
      transitionId: session.transitionId,
      activityId: session.activityId,
      startMs: session.startMs,
      endMs: session.endMs,
      durationMs: Math.max(0, session.endMs - session.startMs),
      trueStartY,
      trueEndY,
      trueMidpointY,
      markerTop: clamp(trueMidpointY - markerHeight / 2, 0, Math.max(0, railHeight - markerHeight)),
      markerHeight,
      rowTop: 0,
      rowCenterY: 0,
      continuesBefore,
      continuesAfter,
    } satisfies DayTimelineRowGeometry;
  });

  let previousBottom = topPadding - rowGap;
  for (const row of draftRows) {
    row.rowTop = rowTopFor(row.trueMidpointY, previousBottom, rowHeight, rowGap, topPadding);
    row.rowCenterY = row.rowTop + rowHeight / 2;
    previousBottom = row.rowTop + rowHeight;
  }

  // Pull rows toward their desired location from the bottom without ever crossing
  // the row before them. This keeps dense days readable without wasting space.
  for (let index = draftRows.length - 1; index >= 0; index -= 1) {
    const row = draftRows[index];
    const next = draftRows[index + 1];
    const maxTop = next ? next.rowTop - rowHeight - rowGap : row.rowTop;
    const balancedTop = Math.max(
      topPadding,
      Math.min(row.rowTop, maxTop, row.trueMidpointY - rowHeight / 2)
    );
    if (index === 0 || balancedTop >= draftRows[index - 1].rowTop + rowHeight + rowGap) {
      row.rowTop = balancedTop;
      row.rowCenterY = balancedTop + rowHeight / 2;
    }
  }

  const lastRow = draftRows.at(-1);
  const contentHeight = Math.max(
    railHeight + bottomPadding,
    lastRow ? lastRow.rowTop + rowHeight + bottomPadding : 0
  );
  return {
    railHeight,
    contentHeight,
    rows: draftRows,
    hourTicks: dayTimelineHourTicks(period, hourHeight),
  };
}
