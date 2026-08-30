import { formatDuration } from '@domain';
import type { ReportTimelineEntry, ReportingServiceApi } from '../reporting/reporting-service';
import type { TrackerRange } from '../tracker/tracker-engine';

export const CSV_INTERVAL_HEADERS = [
  'date',
  'start',
  'end',
  'duration_seconds',
  'duration_formatted',
  'activity',
  'routine',
  'folder',
  'transition_id',
] as const;

export interface CsvIntervalRow {
  date: string;
  start: string;
  end: string;
  durationSeconds: number;
  durationFormatted: string;
  activity: string;
  routine: string;
  folder: string;
  transitionId: string;
}

function csvValue(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function decimalSeconds(durationMs: number): number {
  return Number((durationMs / 1000).toFixed(3));
}

export function intervalToCsvRow(interval: ReportTimelineEntry): CsvIntervalRow {
  const durationMs = Math.max(0, interval.endMs - interval.startMs);
  const isRoutine = interval.kind === 'routine';
  return {
    date: new Date(interval.startMs).toISOString().slice(0, 10),
    start: new Date(interval.startMs).toISOString(),
    end: new Date(interval.endMs).toISOString(),
    durationSeconds: decimalSeconds(durationMs),
    durationFormatted: formatDuration(durationMs),
    activity: isRoutine || interval.kind === 'untracked' ? '' : interval.name,
    routine: isRoutine ? interval.name : '',
    folder: interval.folderName ?? '',
    transitionId: interval.transitionId,
  };
}

export function intervalsToCsv(intervals: readonly ReportTimelineEntry[]): string {
  const lines = [CSV_INTERVAL_HEADERS.map(csvValue).join(',')];
  for (const interval of intervals) {
    const row = intervalToCsvRow(interval);
    lines.push(
      [
        row.date,
        row.start,
        row.end,
        row.durationSeconds,
        row.durationFormatted,
        row.activity,
        row.routine,
        row.folder,
        row.transitionId,
      ]
        .map(csvValue)
        .join(',')
    );
  }
  return `${lines.join('\n')}\n`;
}

export async function derivedIntervalsToCsv(
  reporting: Pick<ReportingServiceApi, 'queryIntervals'>,
  range: TrackerRange,
  nowMs = Date.now()
): Promise<string> {
  return intervalsToCsv(await reporting.queryIntervals(range, nowMs));
}

export const exportIntervalsCsv = derivedIntervalsToCsv;
