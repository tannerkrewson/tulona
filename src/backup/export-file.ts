import { File, Paths } from 'expo-file-system';
import { Share } from 'react-native';

import { backupFilename, csvFilename, rawDataFilename } from './web-download';

export type ExportOutcome = 'exported' | 'cancelled';

/** Writes the export to the cache and hands the file to the system share sheet. */
export async function exportTextFile(content: string, filename: string): Promise<ExportOutcome> {
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(content);
  const result = await Share.share({ title: filename, url: file.uri });
  return result.action === Share.dismissedAction ? 'cancelled' : 'exported';
}

export function exportBackupJson(content: string, date: Date = new Date()) {
  return exportTextFile(content, backupFilename(date));
}

export function exportIntervalsCsv(content: string, date: Date = new Date()) {
  return exportTextFile(content, csvFilename(date));
}

export function exportRawDataJson(content: string, date: Date = new Date()) {
  return exportTextFile(content, rawDataFilename(date));
}
