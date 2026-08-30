import type { KeyValueDatabase } from './database';
import { PersistenceError } from './errors';

export const RAW_STORAGE_FORMAT = 'tulona-raw-storage' as const;
export const RAW_STORAGE_VERSION = 1 as const;

export interface RawStorageEntry {
  key: string;
  value: string | null;
}

export interface RawStorageExport {
  format: typeof RAW_STORAGE_FORMAT;
  version: typeof RAW_STORAGE_VERSION;
  exportedAt: string;
  entries: RawStorageEntry[];
}

/** Reads storage without parsing or rewriting values so corruption remains recoverable. */
export async function readRawStorage(database: KeyValueDatabase): Promise<RawStorageExport> {
  if (!database.keys) {
    throw new PersistenceError(
      'read',
      'Raw storage export is unavailable because this storage adapter cannot enumerate keys'
    );
  }
  let discoveredKeys: readonly string[];
  try {
    discoveredKeys = await database.keys();
  } catch (error) {
    if (error instanceof PersistenceError) throw error;
    throw new PersistenceError(
      'read',
      `Raw storage export is unavailable because key enumeration failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      undefined,
      error
    );
  }
  const keys = [...new Set(discoveredKeys)].sort();
  const values = await database.multiRead(keys);
  return {
    format: RAW_STORAGE_FORMAT,
    version: RAW_STORAGE_VERSION,
    exportedAt: new Date().toISOString(),
    entries: keys.map((key) => ({ key, value: values.get(key) ?? null })),
  };
}

export function serializeRawStorage(value: RawStorageExport): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function exportRawStorage(database: KeyValueDatabase): Promise<string> {
  return serializeRawStorage(await readRawStorage(database));
}
