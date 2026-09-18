import type { KeyValueDatabase } from '@data';

export const DROPBOX_BACKUP_STORAGE_KEY = 'tulona:dropbox-backup';
const DROPBOX_BACKUP_STORAGE_VERSION = 1;

export interface DropboxPendingAuthorization {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  createdAt: string;
}

export interface DropboxBackupRecord {
  version: typeof DROPBOX_BACKUP_STORAGE_VERSION;
  enabled: boolean;
  refreshToken: string | null;
  accessToken: string | null;
  accessTokenExpiresAt: string | null;
  pendingAuthorization: DropboxPendingAuthorization | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPendingAuthorization(value: unknown): value is DropboxPendingAuthorization | null {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  return (
    typeof value.state === 'string' &&
    value.state.length > 0 &&
    typeof value.codeVerifier === 'string' &&
    value.codeVerifier.length > 0 &&
    typeof value.redirectUri === 'string' &&
    value.redirectUri.length > 0 &&
    typeof value.createdAt === 'string' &&
    !Number.isNaN(Date.parse(value.createdAt))
  );
}

function parseRecord(value: string): DropboxBackupRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error('Dropbox backup settings are not valid JSON', { cause: error });
  }
  if (
    !isRecord(parsed) ||
    parsed.version !== DROPBOX_BACKUP_STORAGE_VERSION ||
    typeof parsed.enabled !== 'boolean' ||
    (parsed.refreshToken !== null && typeof parsed.refreshToken !== 'string') ||
    (parsed.accessToken !== null && typeof parsed.accessToken !== 'string') ||
    (parsed.accessTokenExpiresAt !== null &&
      (typeof parsed.accessTokenExpiresAt !== 'string' ||
        Number.isNaN(Date.parse(parsed.accessTokenExpiresAt)))) ||
    !isPendingAuthorization(parsed.pendingAuthorization)
  ) {
    throw new Error('Dropbox backup settings are invalid or out of date');
  }
  return parsed as unknown as DropboxBackupRecord;
}

export function emptyDropboxBackupRecord(): DropboxBackupRecord {
  return {
    version: DROPBOX_BACKUP_STORAGE_VERSION,
    enabled: false,
    refreshToken: null,
    accessToken: null,
    accessTokenExpiresAt: null,
    pendingAuthorization: null,
  };
}

export class DropboxBackupStorage {
  constructor(private readonly database: KeyValueDatabase) {}

  async read(): Promise<DropboxBackupRecord | null> {
    const value = await this.database.read(DROPBOX_BACKUP_STORAGE_KEY);
    return value === null ? null : parseRecord(value);
  }

  async write(record: DropboxBackupRecord): Promise<void> {
    const value = JSON.stringify(record);
    await this.database.write(DROPBOX_BACKUP_STORAGE_KEY, value);
    await this.database.verify(DROPBOX_BACKUP_STORAGE_KEY, value);
  }

  clear(): Promise<void> {
    return this.database.remove(DROPBOX_BACKUP_STORAGE_KEY);
  }
}
