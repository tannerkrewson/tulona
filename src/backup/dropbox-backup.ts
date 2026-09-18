import { Dropbox, DropboxAuth } from 'dropbox';

import { createId } from '@domain';
import type { KeyValueDatabase } from '@data';

import { basePath } from '../pwa/basePath';
import type { BackupService } from './backup-service';
import {
  DropboxBackupStorage,
  emptyDropboxBackupRecord,
  type DropboxBackupRecord,
} from './dropbox-backup-storage';

export const DROPBOX_BACKUP_PATH = '/Tulona/tulona-backup.json';
export const DROPBOX_BACKUP_SCOPES = ['files.content.write'] as const;
export const DROPBOX_AUTH_PENDING_MAX_AGE_MS = 10 * 60 * 1000;
export const DROPBOX_BACKUP_DEFAULT_DEBOUNCE_MS = 1500;

interface DropboxAuthConfig {
  clientId: string;
  accessToken?: string;
  accessTokenExpiresAt?: Date;
  refreshToken?: string;
}

interface DropboxUploadArguments {
  path: string;
  contents: string;
  mode: { '.tag': 'overwrite' };
  autorename: false;
  mute: true;
}

export interface DropboxBackupStatus {
  appKeyConfigured: boolean;
  connected: boolean;
  enabled: boolean;
  lastBackupAt: string | null;
  lastError: string | null;
}

export interface DropboxAuthorizationStart {
  url: string;
  redirectUri: string;
}

export interface DropboxBackupServiceOptions {
  appKey?: string;
  redirectUri?: string;
  now?: () => number;
  debounceMs?: number;
  storage?: DropboxBackupStorage;
  authFactory?: (options: DropboxAuthConfig) => DropboxAuth;
  clientFactory?: (auth: DropboxAuth) => Dropbox;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Dropbox authorization did not return a ${label}`);
  }
  return value;
}

function numberValue(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Dropbox authorization did not return a valid ${label}`);
  }
  return value;
}

function defaultRedirectUri(): string {
  if (typeof window !== 'undefined' && window.location) {
    return `${window.location.origin}${basePath}/dropbox-auth`;
  }
  return 'tulona://dropbox-auth';
}

function defaultAppKey(): string {
  return process.env.EXPO_PUBLIC_DROPBOX_APP_KEY?.trim() ?? '';
}

function copyRecord(record: DropboxBackupRecord): DropboxBackupRecord {
  return {
    ...record,
    pendingAuthorization: record.pendingAuthorization ? { ...record.pendingAuthorization } : null,
  };
}

function authorizationState(record: DropboxBackupRecord | null): DropboxBackupRecord {
  return record ? copyRecord(record) : emptyDropboxBackupRecord();
}

function isPendingAuthorizationFresh(createdAt: string, nowMs: number): boolean {
  const createdAtMs = Date.parse(createdAt);
  return (
    Number.isFinite(createdAtMs) && Math.abs(nowMs - createdAtMs) <= DROPBOX_AUTH_PENDING_MAX_AGE_MS
  );
}

function accessTokenExpiresAt(result: Record<string, unknown>, nowMs: number): string | null {
  if (result.expires_in === undefined) return null;
  const expiresIn = numberValue(result.expires_in, 'access-token lifetime');
  return new Date(nowMs + expiresIn * 1000).toISOString();
}

/**
 * Uploads the canonical full dataset to Dropbox without making Dropbox part of
 * the local persistence transaction. Local data always remains authoritative.
 */
export class DropboxBackupService {
  private readonly storage: DropboxBackupStorage;
  private readonly appKey: string;
  private readonly redirectUri: string;
  private readonly now: () => number;
  private readonly debounceMs: number;
  private readonly authFactory: (options: DropboxAuthConfig) => DropboxAuth;
  private readonly clientFactory: (auth: DropboxAuth) => Dropbox;
  private automaticUnsubscribe: (() => void) | null = null;
  private automaticTimer: ReturnType<typeof setTimeout> | null = null;
  private automaticDirty = false;
  private backupQueue: Promise<void> = Promise.resolve();
  private uploadGeneration = 0;
  private uploadAbortController: AbortController | null = null;
  private lastBackupAt: string | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly backupService: Pick<BackupService, 'exportJson'>,
    private readonly database: KeyValueDatabase,
    options: DropboxBackupServiceOptions = {}
  ) {
    this.storage = options.storage ?? new DropboxBackupStorage(database);
    this.appKey = options.appKey ?? defaultAppKey();
    this.redirectUri = options.redirectUri ?? defaultRedirectUri();
    this.now = options.now ?? (() => Date.now());
    this.debounceMs = Math.max(0, options.debounceMs ?? DROPBOX_BACKUP_DEFAULT_DEBOUNCE_MS);
    this.authFactory = options.authFactory ?? ((authOptions) => new DropboxAuth(authOptions));
    this.clientFactory = options.clientFactory ?? ((auth) => new Dropbox({ auth }));
  }

  async getStatus(): Promise<DropboxBackupStatus> {
    const record = await this.storage.read();
    return {
      appKeyConfigured: this.appKey.length > 0,
      connected: Boolean(record?.refreshToken),
      enabled: Boolean(record?.refreshToken && record.enabled),
      lastBackupAt: this.lastBackupAt,
      lastError: this.lastError,
    };
  }

  async beginAuthorization(): Promise<DropboxAuthorizationStart> {
    this.requireAppKey();
    const state = createId();
    const auth = this.authFactory({ clientId: this.appKey });
    const url = await auth.getAuthenticationUrl(
      this.redirectUri,
      state,
      'code',
      'offline',
      [...DROPBOX_BACKUP_SCOPES],
      'none',
      true
    );
    const codeVerifier = auth.getCodeVerifier();
    if (!codeVerifier) throw new Error('Dropbox PKCE initialization did not return a verifier');

    const record = authorizationState(await this.storage.read());
    record.pendingAuthorization = {
      state,
      codeVerifier,
      redirectUri: this.redirectUri,
      createdAt: new Date(this.now()).toISOString(),
    };
    await this.storage.write(record);
    return { url, redirectUri: this.redirectUri };
  }

  async completeAuthorization(code: string, state: string): Promise<void> {
    this.requireAppKey();
    const record = await this.storage.read();
    const pending = record?.pendingAuthorization;
    if (!pending) throw new Error('No Dropbox authorization is waiting to be completed');
    if (pending.state !== state) throw new Error('Dropbox authorization state did not match');
    if (!isPendingAuthorizationFresh(pending.createdAt, this.now())) {
      throw new Error('Dropbox authorization expired; please connect again');
    }
    if (!code.trim()) throw new Error('Dropbox authorization did not return a code');

    const auth = this.authFactory({ clientId: this.appKey });
    auth.setCodeVerifier(pending.codeVerifier);
    const response = await auth.getAccessTokenFromCode(pending.redirectUri, code);
    const result = response.result as Record<string, unknown>;
    const refreshToken = stringValue(result.refresh_token, 'refresh token');
    const accessToken = stringValue(result.access_token, 'access token');
    const next: DropboxBackupRecord = {
      version: 1,
      enabled: true,
      refreshToken,
      accessToken,
      accessTokenExpiresAt: accessTokenExpiresAt(result, this.now()),
      pendingAuthorization: null,
    };
    await this.storage.write(next);
    this.lastError = null;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    const record = await this.storage.read();
    if (enabled && !record?.refreshToken) {
      throw new Error('Connect Dropbox before enabling automatic backups');
    }
    const next = authorizationState(record);
    next.enabled = enabled;
    await this.storage.write(next);
    if (!enabled) this.cancelAutomaticTimer();
    else this.scheduleAutomaticBackup();
  }

  async disconnect(): Promise<void> {
    this.cancelAutomaticTimer();
    this.automaticDirty = false;
    this.invalidateUploads();
    await this.storage.clear();
    this.lastBackupAt = null;
    this.lastError = null;
  }

  /** Upload exactly one complete snapshot; callers may use this for retry/manual backup. */
  backupNow(): Promise<void> {
    this.cancelAutomaticTimer();
    this.automaticDirty = false;
    const task = this.backupQueue.then(() => this.uploadSnapshot());
    this.backupQueue = task.catch(() => undefined);
    return task;
  }

  /** Subscribe to successful local writes and return the lifecycle cleanup function. */
  startAutomaticBackups(): () => void {
    if (this.automaticUnsubscribe) return () => this.stopAutomaticBackups();
    this.automaticUnsubscribe = this.database.subscribeToWrites
      ? this.database.subscribeToWrites(() => this.scheduleAutomaticBackup())
      : null;
    void this.getStatus()
      .then((status) => {
        if (status.connected && status.enabled) this.scheduleAutomaticBackup();
      })
      .catch((error: unknown) => {
        this.lastError = errorMessage(error);
      });
    return () => this.stopAutomaticBackups();
  }

  private stopAutomaticBackups(): void {
    this.automaticUnsubscribe?.();
    this.automaticUnsubscribe = null;
    this.cancelAutomaticTimer();
    this.automaticDirty = false;
    this.invalidateUploads();
  }

  private scheduleAutomaticBackup(): void {
    this.automaticDirty = true;
    if (this.automaticTimer) return;
    this.automaticTimer = setTimeout(() => {
      this.automaticTimer = null;
      void this.flushAutomaticBackup();
    }, this.debounceMs);
  }

  private async flushAutomaticBackup(): Promise<void> {
    if (!this.automaticDirty) return;
    this.automaticDirty = false;
    let status: DropboxBackupStatus;
    try {
      status = await this.getStatus();
    } catch (error) {
      this.lastError = errorMessage(error);
      return;
    }
    if (!status.connected || !status.enabled) return;
    try {
      await this.backupNow();
    } catch {
      // The failure is retained in status; the next local write or startup retries.
    } finally {
      if (this.automaticDirty && !this.automaticTimer) this.scheduleAutomaticBackup();
    }
  }

  private cancelAutomaticTimer(): void {
    if (!this.automaticTimer) return;
    clearTimeout(this.automaticTimer);
    this.automaticTimer = null;
  }

  private async uploadSnapshot(): Promise<void> {
    const generation = this.uploadGeneration;
    try {
      const record = await this.storage.read();
      if (!record?.refreshToken) throw new Error('Connect Dropbox before backing up data');
      this.requireAppKey();
      const content = await this.backupService.exportJson();
      if (generation !== this.uploadGeneration) return;
      const auth = this.authFactory({
        clientId: this.appKey,
        accessToken: record.accessToken ?? undefined,
        accessTokenExpiresAt: record.accessTokenExpiresAt
          ? new Date(record.accessTokenExpiresAt)
          : undefined,
        refreshToken: record.refreshToken,
      });
      const client = this.clientFactory(auth);
      const upload: DropboxUploadArguments = {
        path: DROPBOX_BACKUP_PATH,
        contents: content,
        mode: { '.tag': 'overwrite' },
        autorename: false,
        mute: true,
      };
      const controller = typeof AbortController === 'undefined' ? null : new AbortController();
      this.uploadAbortController = controller;
      await client.filesUpload(upload, controller ? { signal: controller.signal } : undefined);
      if (generation !== this.uploadGeneration) return;
      this.lastBackupAt = new Date(this.now()).toISOString();
      this.lastError = null;
    } catch (error) {
      this.lastError = errorMessage(error);
      throw error;
    } finally {
      this.uploadAbortController = null;
    }
  }

  private invalidateUploads(): void {
    this.uploadGeneration += 1;
    this.uploadAbortController?.abort();
    this.uploadAbortController = null;
  }

  private requireAppKey(): void {
    if (!this.appKey) {
      throw new Error('Dropbox is not configured; set EXPO_PUBLIC_DROPBOX_APP_KEY');
    }
  }
}
