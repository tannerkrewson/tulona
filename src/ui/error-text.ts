import { isPersistenceError } from '@data';

const labels: Record<string, string> = {
  read: 'Storage read error',
  write: 'Storage write error',
  remove: 'Storage remove error',
  'multi-read': 'Storage read error',
  'multi-write': 'Storage write error',
  verification: 'Storage verification error',
  serialization: 'Serialization error',
  validation: 'Validation error',
  corruption: 'Corruption error',
  metadata: 'Metadata error',
  migration: 'Migration error',
  journal: 'Journal recovery error',
  'routine-recovery': 'Routine recovery error',
  conflict: 'Conflict error',
};

const importLabels: Record<string, string> = {
  'invalid-json': 'Import JSON error',
  'invalid-document': 'Import document error',
  'unsupported-format': 'Import format error',
  'unsupported-version': 'Import version error',
  'migration-failed': 'Import migration error',
  schema: 'Import schema error',
  semantic: 'Import reference error',
};

/** Keeps categorized failures visible at the UI boundary without changing domain messages. */
export function errorText(error: unknown): string {
  if (isPersistenceError(error)) {
    return `${labels[error.category] ?? error.category}: ${error.message}`;
  }
  if (error instanceof Error && 'code' in error) {
    const code = String((error as Error & { code?: unknown }).code);
    return `${importLabels[code] ?? 'Import error'}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
