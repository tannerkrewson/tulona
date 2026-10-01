import { downloadBackupJson, downloadIntervalsCsv, downloadRawDataJson } from './web-download';

export type ExportOutcome = 'exported' | 'cancelled';

function outcome(downloaded: boolean): ExportOutcome {
  if (!downloaded) throw new Error('Downloads are unavailable in this browser');
  return 'exported';
}

export async function exportBackupJson(content: string, date: Date = new Date()) {
  return outcome(downloadBackupJson(content, date));
}

export async function exportIntervalsCsv(content: string, date: Date = new Date()) {
  return outcome(downloadIntervalsCsv(content, date));
}

export async function exportRawDataJson(content: string, date: Date = new Date()) {
  return outcome(downloadRawDataJson(content, date));
}
