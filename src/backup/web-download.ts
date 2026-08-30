export function backupFilename(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `life-tracker-backup-${year}-${month}-${day}.json`;
}

export function csvFilename(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `life-tracker-intervals-${year}-${month}-${day}.csv`;
}

/** Web-only download transport. Serialization remains usable without a DOM. */
export function downloadText(content: string, filename: string, mimeType: string): boolean {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof Blob === 'undefined'
  ) {
    return false;
  }
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.click();
  URL.revokeObjectURL(url);
  return true;
}

export function downloadBackupJson(content: string, date: Date = new Date()): boolean {
  return downloadText(content, backupFilename(date), 'application/json');
}

export function downloadIntervalsCsv(content: string, date: Date = new Date()): boolean {
  return downloadText(content, csvFilename(date), 'text/csv;charset=utf-8');
}
