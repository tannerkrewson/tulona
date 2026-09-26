import { Dropbox, DropboxAuth } from 'dropbox';

import { createId } from '@domain';
import type { KeyValueDatabase } from '@data';

import { basePath } from '../pwa/basePath';
import type { BackupService } from './backup-service';
import type { LifeTrackerBackup } from './backup-schema';
import { serializeBackup } from './backup-export';
import {
  createSyncDocument,
  documentHeads,
  loadSyncDocument,
  mergeSyncDocuments,
  projectSyncDocument,
  randomActorId,
  saveSyncDocument,
  updateSyncDocumentFromBackup,
  type SyncConflict,
  type SyncDocument,
} from './dropbox-sync-document';
import {
  DropboxBackupStorage,
  emptyDropboxBackupRecord,
  type DropboxBackupRecord,
} from './dropbox-backup-storage';

export const DROPBOX_BACKUP_PATH = '/tulona-backup.json';
export const DROPBOX_SYNC_PATH = '/tulona-sync.am';
export const DROPBOX_SYNC_STORAGE_KEY = 'tulona:dropbox-sync-state:';
export const DROPBOX_BACKUP_SCOPES = [
  'files.content.read',
  'files.content.write',
  'files.metadata.read',
] as const;
export const DROPBOX_AUTH_PENDING_MAX_AGE_MS = 10 * 60 * 1000;
export const DROPBOX_BACKUP_DEFAULT_DEBOUNCE_MS = 1500;
export const DROPBOX_SYNC_MAX_RETRIES = 6;

const SYNC_FILE_HEADER = 'TULONA_AUTOMERGE_SYNC_V1\n';
const SYNC_STATE_VERSION = 1 as const;
const SYNC_LOCK_NAME = 'tulona-dropbox-sync';

interface DropboxAuthConfig {
  clientId: string;
  accessToken?: string;
  accessTokenExpiresAt?: Date;
  refreshToken?: string;
}

interface DropboxUploadArguments {
  path: string;
  contents: string;
  mode: { '.tag': 'add' } | { '.tag': 'update'; update: string };
  autorename: false;
  strict_conflict: true;
  mute: true;
}

interface DropboxRemoteFile {
  rev: string;
  contents: string;
}

interface DropboxSyncStateRecord {
  version: typeof SYNC_STATE_VERSION;
  document: string;
  projection: LifeTrackerBackup;
  datasetId: string;
  updatedAt: string;
}

export type DropboxSyncPhase =
  'idle' | 'syncing' | 'synced' | 'offline' | 'error' | 'authentication-required' | 'conflict';

export interface DropboxBackupStatus {
  appKeyConfigured: boolean;
  connected: boolean;
  enabled: boolean;
  lastBackupAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  syncPhase: DropboxSyncPhase;
  unresolvedConflictCount: number;
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
  onExternalSync?: () => void | Promise<void>;
  maxRetries?: number;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function errorStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('status' in error)) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : null;
}

function isDropboxConflict(error: unknown): boolean {
  return errorStatus(error) === 409;
}

function isDropboxNotFound(error: unknown): boolean {
  if (errorStatus(error) !== 409) return false;
  try {
    return JSON.stringify(error).toLowerCase().includes('not_found');
  } catch {
    return errorMessage(error).toLowerCase().includes('not_found');
  }
}

function isAuthenticationError(error: unknown): boolean {
  const status = errorStatus(error);
  const message = errorMessage(error).toLowerCase();
  return (
    status === 401 ||
    status === 403 ||
    message.includes('invalid_access_token') ||
    message.includes('missing_scope') ||
    message.includes('insufficient_scope')
  );
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
  const expiresIn = result.expires_in;
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error('Dropbox authorization did not return a valid access-token lifetime');
  }
  return new Date(nowMs + expiresIn * 1000).toISOString();
}

function parseSyncState(value: string | null): DropboxSyncStateRecord | null {
  if (value === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error('Local Dropbox synchronization history is invalid JSON', { cause: error });
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as Record<string, unknown>).version !== SYNC_STATE_VERSION ||
    typeof (parsed as Record<string, unknown>).document !== 'string' ||
    typeof (parsed as Record<string, unknown>).datasetId !== 'string' ||
    typeof (parsed as Record<string, unknown>).updatedAt !== 'string' ||
    typeof (parsed as Record<string, unknown>).projection !== 'object'
  ) {
    throw new Error('Local Dropbox synchronization history is invalid or unsupported');
  }
  return parsed as DropboxSyncStateRecord;
}

function serializeSyncState(
  document: SyncDocument,
  projection: LifeTrackerBackup,
  datasetId: string,
  now: () => number
): string {
  const value: DropboxSyncStateRecord = {
    version: SYNC_STATE_VERSION,
    document: encodeBase64(saveSyncDocument(document)),
    projection,
    datasetId,
    updatedAt: new Date(now()).toISOString(),
  };
  return JSON.stringify(value);
}

export function dropboxSyncStorageKey(datasetId: string): string {
  return `${DROPBOX_SYNC_STORAGE_KEY}${datasetId}`;
}

function encodeRemoteDocument(document: SyncDocument): string {
  return `${SYNC_FILE_HEADER}${encodeBase64(saveSyncDocument(document))}\n`;
}

function decodeRemoteDocument(value: string, actorId: string): SyncDocument {
  if (!value.startsWith(SYNC_FILE_HEADER)) {
    throw new Error('Dropbox synchronization file has an invalid header');
  }
  const encoded = value.slice(SYNC_FILE_HEADER.length).trim();
  if (!encoded) throw new Error('Dropbox synchronization file is empty');
  return loadSyncDocument(decodeBase64(encoded), actorId);
}

function encodeBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]!;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const bits = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    output += alphabet[(bits >> 18) & 63];
    output += alphabet[(bits >> 12) & 63];
    output += second === undefined ? '=' : alphabet[(bits >> 6) & 63];
    output += third === undefined ? '=' : alphabet[bits & 63];
  }
  return output;
}

function decodeBase64(value: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const normalized = value.replace(/\s/g, '');
  if (!normalized || normalized.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(normalized)) {
    throw new Error('Dropbox synchronization file contains invalid encoded data');
  }
  const bytes: number[] = [];
  for (let index = 0; index < normalized.length; index += 4) {
    const a = alphabet.indexOf(normalized[index]!);
    const b = alphabet.indexOf(normalized[index + 1]!);
    const c = normalized[index + 2] === '=' ? 0 : alphabet.indexOf(normalized[index + 2]!);
    const d = normalized[index + 3] === '=' ? 0 : alphabet.indexOf(normalized[index + 3]!);
    if (a < 0 || b < 0 || c < 0 || d < 0) throw new Error('Dropbox sync file encoding is invalid');
    const bits = (a << 18) | (b << 12) | (c << 6) | d;
    bytes.push((bits >> 16) & 255);
    if (normalized[index + 2] !== '=') bytes.push((bits >> 8) & 255);
    if (normalized[index + 3] !== '=') bytes.push(bits & 255);
  }
  return new Uint8Array(bytes);
}

function sameDataset(left: LifeTrackerBackup, right: LifeTrackerBackup): boolean {
  const stripMetadata = (value: LifeTrackerBackup) => {
    const { exportedAt: _exportedAt, appVersion: _appVersion, ...dataset } = value;
    return dataset;
  };
  return JSON.stringify(stripMetadata(left)) === JSON.stringify(stripMetadata(right));
}

function sameHeads(left: SyncDocument, right: SyncDocument): boolean {
  const a = [...documentHeads(left)].sort();
  const b = [...documentHeads(right)].sort();
  return a.length === b.length && a.every((head, index) => head === b[index]);
}

function conflictStatusCount(conflicts: readonly SyncConflict[]): number {
  return new Set(conflicts.map((conflict) => conflict.id)).size;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryDelay(attempt: number): number {
  return Math.min(2500, 150 * 2 ** attempt) + Math.floor(Math.random() * 120);
}

async function responseText(
  result: Dropbox['filesDownload'] extends (...args: never[]) => Promise<infer T> ? T : never
): Promise<string> {
  const value = result.result as unknown as {
    fileBinary?: Uint8Array;
    fileBlob?: { text(): Promise<string> };
  };
  if (value.fileBlob) return value.fileBlob.text();
  if (value.fileBinary) return new TextDecoder().decode(value.fileBinary);
  throw new Error('Dropbox download did not include file content');
}

/** Persistent Automerge sync with Dropbox revision-based compare-and-swap. */
export class DropboxBackupService {
  private readonly storage: DropboxBackupStorage;
  private readonly appKey: string;
  private readonly redirectUri: string;
  private readonly now: () => number;
  private readonly debounceMs: number;
  private readonly maxRetries: number;
  private readonly authFactory: (options: DropboxAuthConfig) => DropboxAuth;
  private readonly clientFactory: (auth: DropboxAuth) => Dropbox;
  private automaticUnsubscribe: (() => void) | null = null;
  private automaticExternalUnsubscribe: (() => void) | null = null;
  private automaticTimer: ReturnType<typeof setTimeout> | null = null;
  private automaticDirty = false;
  private syncQueue: Promise<void> = Promise.resolve();
  private uploadGeneration = 0;
  private uploadAbortController: AbortController | null = null;
  private lastBackupAt: string | null = null;
  private lastSyncAt: string | null = null;
  private lastError: string | null = null;
  private syncPhase: DropboxSyncPhase = 'idle';
  private unresolvedConflictCount = 0;
  private readonly statusListeners = new Set<(status: DropboxBackupStatus) => void>();
  private readonly actorId = randomActorId();

  constructor(
    private readonly backupService: Pick<
      BackupService,
      'exportSynchronizationSnapshot' | 'inspectImport' | 'applySynchronizationProjection'
    >,
    private readonly database: KeyValueDatabase,
    options: DropboxBackupServiceOptions = {}
  ) {
    this.storage = options.storage ?? new DropboxBackupStorage(database);
    this.appKey = options.appKey ?? defaultAppKey();
    this.redirectUri = options.redirectUri ?? defaultRedirectUri();
    this.now = options.now ?? (() => Date.now());
    this.debounceMs = Math.max(0, options.debounceMs ?? DROPBOX_BACKUP_DEFAULT_DEBOUNCE_MS);
    this.maxRetries = Math.max(1, options.maxRetries ?? DROPBOX_SYNC_MAX_RETRIES);
    this.authFactory = options.authFactory ?? ((authOptions) => new DropboxAuth(authOptions));
    this.clientFactory = options.clientFactory ?? ((auth) => new Dropbox({ auth }));
    this.onExternalSync = options.onExternalSync;
  }

  private readonly onExternalSync?: () => void | Promise<void>;

  async getStatus(): Promise<DropboxBackupStatus> {
    const record = await this.storage.read();
    return {
      appKeyConfigured: this.appKey.length > 0,
      connected: Boolean(record?.refreshToken),
      enabled: Boolean(record?.refreshToken && record.enabled),
      lastBackupAt: this.lastBackupAt,
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError,
      syncPhase: this.syncPhase,
      unresolvedConflictCount: this.unresolvedConflictCount,
    };
  }

  subscribeStatus(listener: (status: DropboxBackupStatus) => void): () => void {
    this.statusListeners.add(listener);
    void this.publishStatus();
    return () => this.statusListeners.delete(listener);
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
    if (typeof result.refresh_token !== 'string' || !result.refresh_token) {
      throw new Error('Dropbox authorization did not return a refresh token');
    }
    if (typeof result.access_token !== 'string' || !result.access_token) {
      throw new Error('Dropbox authorization did not return an access token');
    }
    const next: DropboxBackupRecord = {
      version: 1,
      enabled: true,
      refreshToken: result.refresh_token,
      accessToken: result.access_token,
      accessTokenExpiresAt: accessTokenExpiresAt(result, this.now()),
      pendingAuthorization: null,
    };
    await this.storage.write(next);
    this.lastError = null;
    this.syncPhase = 'idle';
    void this.publishStatus();
  }

  async setEnabled(enabled: boolean): Promise<void> {
    const record = await this.storage.read();
    if (enabled && !record?.refreshToken) {
      throw new Error('Connect Dropbox before enabling automatic synchronization');
    }
    const next = authorizationState(record);
    next.enabled = enabled;
    await this.storage.write(next);
    if (!enabled) this.cancelAutomaticTimer();
    else this.scheduleAutomaticSync();
    void this.publishStatus();
  }

  async disconnect(): Promise<void> {
    this.cancelAutomaticTimer();
    this.automaticDirty = false;
    this.invalidateUploads();
    await this.storage.clear();
    this.lastBackupAt = null;
    this.lastSyncAt = null;
    this.lastError = null;
    this.syncPhase = 'idle';
    this.unresolvedConflictCount = 0;
    void this.publishStatus();
  }

  /** Kept as a compatibility alias for the existing backup button and callers. */
  backupNow(): Promise<void> {
    return this.syncNow();
  }

  /** Merge local and remote state, then conditionally publish the Automerge document. */
  syncNow(): Promise<void> {
    this.cancelAutomaticTimer();
    this.automaticDirty = false;
    const task = this.syncQueue.then(() => this.withCrossTabLock(() => this.synchronize()));
    this.syncQueue = task.catch(() => undefined);
    return task;
  }

  /** Existing lifecycle entry point retained for boot-coordinator compatibility. */
  startAutomaticBackups(): () => void {
    return this.startAutomaticSynchronization();
  }

  startAutomaticSynchronization(): () => void {
    if (this.automaticUnsubscribe) return () => this.stopAutomaticSynchronization();
    this.automaticUnsubscribe =
      this.database.subscribeToWrites?.((keys, source) => {
        if (source === 'sync') return;
        if (keys.some((key) => key.startsWith('ds:'))) this.scheduleAutomaticSync();
      }) ?? null;
    this.automaticExternalUnsubscribe =
      this.database.subscribeToExternalWrites?.((keys, source) => {
        if (source === 'sync') {
          void this.notifyViewsAfterSync().catch(() => undefined);
          return;
        }
        if (keys.some((key) => key.startsWith('ds:'))) {
          void this.notifyViewsAfterSync().catch(() => undefined);
          this.scheduleAutomaticSync();
        }
      }) ?? null;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
    if (typeof window !== 'undefined') window.addEventListener('online', this.onOnline);
    void this.getStatus()
      .then((status) => {
        if (status.connected) void this.syncNow().catch(() => undefined);
      })
      .catch((error: unknown) => this.setFailure(error));
    return () => this.stopAutomaticSynchronization();
  }

  private readonly onVisibilityChange = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      this.scheduleAutomaticSync();
    }
  };

  private readonly onOnline = (): void => {
    this.scheduleAutomaticSync();
  };

  private stopAutomaticSynchronization(): void {
    this.automaticUnsubscribe?.();
    this.automaticUnsubscribe = null;
    this.automaticExternalUnsubscribe?.();
    this.automaticExternalUnsubscribe = null;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    if (typeof window !== 'undefined') window.removeEventListener('online', this.onOnline);
    this.cancelAutomaticTimer();
    this.automaticDirty = false;
    this.invalidateUploads();
  }

  private scheduleAutomaticSync(): void {
    this.automaticDirty = true;
    if (this.automaticTimer) return;
    this.automaticTimer = setTimeout(() => {
      this.automaticTimer = null;
      void this.flushAutomaticSync();
    }, this.debounceMs);
  }

  private async flushAutomaticSync(): Promise<void> {
    if (!this.automaticDirty) return;
    this.automaticDirty = false;
    try {
      const status = await this.getStatus();
      if (!status.connected || !status.enabled) return;
      await this.syncNow();
    } catch {
      // Keep local data and CRDT history; the next local write, focus, or manual action retries.
    } finally {
      if (this.automaticDirty && !this.automaticTimer) this.scheduleAutomaticSync();
    }
  }

  private cancelAutomaticTimer(): void {
    if (!this.automaticTimer) return;
    clearTimeout(this.automaticTimer);
    this.automaticTimer = null;
  }

  private async withCrossTabLock(operation: () => Promise<void>): Promise<void> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (!locks) return operation();
    await locks.request(SYNC_LOCK_NAME, { mode: 'exclusive' }, operation);
  }

  private async synchronize(): Promise<void> {
    this.syncPhase = 'syncing';
    this.lastError = null;
    void this.publishStatus();
    const generation = this.uploadGeneration;
    try {
      const authRecord = await this.storage.read();
      if (!authRecord?.refreshToken) throw new Error('Connect Dropbox before synchronizing data');
      this.requireAppKey();
      const client = this.clientFactory(
        this.authFactory({
          clientId: this.appKey,
          accessToken: authRecord.accessToken ?? undefined,
          accessTokenExpiresAt: authRecord.accessTokenExpiresAt
            ? new Date(authRecord.accessTokenExpiresAt)
            : undefined,
          refreshToken: authRecord.refreshToken,
        })
      );

      for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
        if (generation !== this.uploadGeneration) return;
        const local = await this.backupService.exportSynchronizationSnapshot();
        const syncStateKey = dropboxSyncStorageKey(local.datasetId);
        const localStateRaw = local.entries.get(syncStateKey) ?? null;
        const localState = parseSyncState(localStateRaw);
        if (localState && localState.datasetId !== local.datasetId) {
          throw new Error(
            'Local Dropbox synchronization history belongs to a different Tulona dataset'
          );
        }
        let localDocument = localState
          ? loadSyncDocument(decodeBase64(localState.document), this.actorId)
          : createSyncDocument(local.backup, this.actorId, local.datasetId);
        if (localState && !sameDataset(localState.projection, local.backup)) {
          localDocument = updateSyncDocumentFromBackup(
            localDocument,
            localState.projection,
            local.backup
          );
        }

        const remoteFile = await this.downloadFile(client, DROPBOX_SYNC_PATH);
        let remoteDocument: SyncDocument | null = null;
        let legacyBackup: LifeTrackerBackup | null = null;
        if (remoteFile) {
          remoteDocument = decodeRemoteDocument(remoteFile.contents, this.actorId);
        } else {
          const legacyFile = await this.downloadFile(client, DROPBOX_BACKUP_PATH);
          if (legacyFile)
            legacyBackup = this.backupService.inspectImport(legacyFile.contents).backup;
        }
        if (generation !== this.uploadGeneration) return;

        let merged = localDocument;
        if (remoteDocument) {
          merged = mergeSyncDocuments(localDocument, remoteDocument, localState?.projection);
        } else if (legacyBackup) {
          merged = mergeSyncDocuments(
            localDocument,
            createSyncDocument(legacyBackup, randomActorId(), local.datasetId),
            localState?.projection
          );
        }

        let latestLocal = await this.backupService.exportSynchronizationSnapshot();
        if (latestLocal.datasetId !== local.datasetId) {
          throw new Error(
            'The active Tulona dataset changed during synchronization; synchronize again for the active dataset.'
          );
        }
        if (!sameDataset(local.backup, latestLocal.backup)) {
          merged = updateSyncDocumentFromBackup(merged, local.backup, latestLocal.backup);
        }
        let projection = projectSyncDocument(merged, {
          exportedAt: new Date(this.now()).toISOString(),
        });
        const validated = this.backupService.inspectImport(projection.backup).backup;
        projection = { ...projection, backup: validated };

        const stateValue = serializeSyncState(
          merged,
          projection.backup,
          latestLocal.datasetId,
          this.now
        );
        const expectedPrefix = new Map(
          [...latestLocal.entries].filter(([key]) => key.startsWith(`ds:${latestLocal.datasetId}:`))
        );
        const expectedSyncState = latestLocal.entries.get(syncStateKey) ?? null;
        const applied = await this.backupService.applySynchronizationProjection(
          projection.backup,
          latestLocal.datasetId,
          expectedPrefix,
          syncStateKey,
          expectedSyncState,
          stateValue
        );
        if (!applied) {
          await delay(retryDelay(attempt));
          continue;
        }

        await this.notifyViewsAfterSync();

        this.unresolvedConflictCount = conflictStatusCount(projection.conflicts);
        if (remoteDocument && sameHeads(merged, remoteDocument)) {
          await this.uploadHumanReadableBackup(client, projection.backup, generation);
          if (generation !== this.uploadGeneration) return;
          this.markSynchronized();
          return;
        }

        const upload: DropboxUploadArguments = {
          path: DROPBOX_SYNC_PATH,
          contents: encodeRemoteDocument(merged),
          mode: remoteFile ? { '.tag': 'update', update: remoteFile.rev } : { '.tag': 'add' },
          autorename: false,
          strict_conflict: true,
          mute: true,
        };
        this.uploadAbortController =
          typeof AbortController === 'undefined' ? null : new AbortController();
        try {
          await client.filesUpload(
            upload,
            this.uploadAbortController ? { signal: this.uploadAbortController.signal } : undefined
          );
        } catch (error) {
          if (!isDropboxConflict(error)) throw error;
          if (attempt + 1 === this.maxRetries) {
            this.syncPhase = 'conflict';
            throw new Error(
              `Dropbox kept changing during synchronization after ${this.maxRetries} attempts.`
            );
          }
          await delay(retryDelay(attempt));
          continue;
        } finally {
          this.uploadAbortController = null;
        }
        if (generation !== this.uploadGeneration) return;
        await this.uploadHumanReadableBackup(client, projection.backup, generation);
        if (generation !== this.uploadGeneration) return;
        this.markSynchronized();
        return;
      }
      this.syncPhase = 'conflict';
      throw new Error(`Synchronization did not converge after ${this.maxRetries} attempts.`);
    } catch (error) {
      if (generation !== this.uploadGeneration) return;
      this.setFailure(error);
      throw error;
    }
  }

  private async downloadFile(client: Dropbox, path: string): Promise<DropboxRemoteFile | null> {
    const controller = typeof AbortController === 'undefined' ? null : new AbortController();
    this.uploadAbortController = controller;
    try {
      const response = await client.filesDownload(
        { path },
        controller ? { signal: controller.signal } : undefined
      );
      const metadata = response.result as unknown as { rev?: unknown };
      if (typeof metadata.rev !== 'string' || metadata.rev.length === 0) {
        throw new Error(`Dropbox did not return a file revision for ${path}`);
      }
      return { rev: metadata.rev, contents: await responseText(response) };
    } catch (error) {
      if (isDropboxNotFound(error)) return null;
      throw error;
    } finally {
      this.uploadAbortController = null;
    }
  }

  private async uploadHumanReadableBackup(
    client: Dropbox,
    backup: LifeTrackerBackup,
    generation: number
  ): Promise<void> {
    const contents = serializeBackup(backup);
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      if (generation !== this.uploadGeneration) return;
      const current = await this.downloadFile(client, DROPBOX_BACKUP_PATH);
      if (generation !== this.uploadGeneration) return;
      try {
        this.uploadAbortController =
          typeof AbortController === 'undefined' ? null : new AbortController();
        await client.filesUpload(
          {
            path: DROPBOX_BACKUP_PATH,
            contents,
            mode: current ? { '.tag': 'update', update: current.rev } : { '.tag': 'add' },
            autorename: false,
            strict_conflict: true,
            mute: true,
          },
          this.uploadAbortController ? { signal: this.uploadAbortController.signal } : undefined
        );
        this.lastBackupAt = new Date(this.now()).toISOString();
        return;
      } catch (error) {
        if (!isDropboxConflict(error)) throw error;
        if (attempt + 1 === this.maxRetries) {
          throw new Error(
            `The human-readable Dropbox backup kept changing after ${this.maxRetries} attempts.`
          );
        }
        await delay(retryDelay(attempt));
      } finally {
        this.uploadAbortController = null;
      }
    }
  }

  private markSynchronized(): void {
    this.lastSyncAt = new Date(this.now()).toISOString();
    this.lastError = null;
    this.syncPhase = this.unresolvedConflictCount > 0 ? 'conflict' : 'synced';
    void this.publishStatus();
  }

  private setFailure(error: unknown): void {
    this.lastError = isAuthenticationError(error)
      ? 'Dropbox access needs attention. Reconnect and approve the requested content read/write and metadata read scopes.'
      : errorMessage(error);
    this.syncPhase = isAuthenticationError(error)
      ? 'authentication-required'
      : errorMessage(error).includes('active Tulona dataset')
        ? 'conflict'
        : errorStatus(error) === null
          ? 'offline'
          : 'error';
    void this.publishStatus();
  }

  private async notifyViewsAfterSync(): Promise<void> {
    try {
      await this.onExternalSync?.();
    } catch {
      // Refreshing in-memory views must not block persistence or the Dropbox upload.
    }
    if (typeof window !== 'undefined' && typeof Event !== 'undefined') {
      window.dispatchEvent(new Event('tulona:dropbox-sync'));
    }
  }

  private async publishStatus(): Promise<void> {
    if (this.statusListeners.size === 0) return;
    try {
      const status = await this.getStatus();
      for (const listener of this.statusListeners) {
        try {
          listener(status);
        } catch {
          // UI status observers cannot affect synchronization.
        }
      }
    } catch {
      // Status is advisory and must not fail synchronization.
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
