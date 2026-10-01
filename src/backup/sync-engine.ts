import type { LifeTrackerBackup } from './backup-schema';
import type { SyncConflict } from './dropbox-sync-document';

/** A reference to an Automerge document held by a sync engine worker. */
export interface SyncDocumentHandle {
  readonly id: string;
  readonly datasetId: string;
}

export interface SyncEngineProjection {
  backup: LifeTrackerBackup;
  conflicts: SyncConflict[];
}

export interface PkceCodes {
  verifier: string;
  challenge: string;
}

/**
 * Operations a sync engine worker performs. Documents stay inside the worker; callers pass
 * handles, and encoded documents cross the boundary as base64 strings.
 */
export interface SyncEngineMethods {
  create(
    session: string,
    backup: LifeTrackerBackup,
    actorId: string,
    datasetId: string
  ): SyncDocumentHandle;
  load(session: string, encoded: string, actorId: string): SyncDocumentHandle;
  update(
    session: string,
    document: SyncDocumentHandle,
    previous: LifeTrackerBackup,
    next: LifeTrackerBackup
  ): SyncDocumentHandle;
  merge(
    session: string,
    local: SyncDocumentHandle,
    remote: SyncDocumentHandle,
    baseline: LifeTrackerBackup | null
  ): SyncDocumentHandle;
  project(
    session: string,
    document: SyncDocumentHandle,
    options: { exportedAt?: string }
  ): SyncEngineProjection;
  save(session: string, document: SyncDocumentHandle): string;
  heads(session: string, document: SyncDocumentHandle): string[];
  release(session: string): void;
  createPkceCodes(): Promise<PkceCodes>;
}

export type SyncEngineMethod = keyof SyncEngineMethods;

export interface SyncEngineRequest<M extends SyncEngineMethod = SyncEngineMethod> {
  method: M;
  args: Parameters<SyncEngineMethods[M]>;
}

export type SyncEngineTransport = <M extends SyncEngineMethod>(
  method: M,
  args: Parameters<SyncEngineMethods[M]>
) => Promise<Awaited<ReturnType<SyncEngineMethods[M]>>>;

export interface SyncEngineSession {
  create(
    backup: LifeTrackerBackup,
    actorId: string,
    datasetId: string
  ): Promise<SyncDocumentHandle>;
  load(encoded: string, actorId: string): Promise<SyncDocumentHandle>;
  update(
    document: SyncDocumentHandle,
    previous: LifeTrackerBackup,
    next: LifeTrackerBackup
  ): Promise<SyncDocumentHandle>;
  merge(
    local: SyncDocumentHandle,
    remote: SyncDocumentHandle,
    baseline?: LifeTrackerBackup
  ): Promise<SyncDocumentHandle>;
  project(
    document: SyncDocumentHandle,
    options?: { exportedAt?: string }
  ): Promise<SyncEngineProjection>;
  save(document: SyncDocumentHandle): Promise<string>;
  heads(document: SyncDocumentHandle): Promise<string[]>;
  close(): Promise<void>;
}

let nextSessionId = 0;

export function createSyncEngineSession(transport: SyncEngineTransport): SyncEngineSession {
  nextSessionId += 1;
  const session = `s${nextSessionId}-${Date.now().toString(36)}`;
  return {
    create: (backup, actorId, datasetId) =>
      transport('create', [session, backup, actorId, datasetId]),
    load: (encoded, actorId) => transport('load', [session, encoded, actorId]),
    update: (document, previous, next) => transport('update', [session, document, previous, next]),
    merge: (local, remote, baseline) =>
      transport('merge', [session, local, remote, baseline ?? null]),
    project: (document, options = {}) => transport('project', [session, document, options]),
    save: (document) => transport('save', [session, document]),
    heads: (document) => transport('heads', [session, document]),
    close: () => transport('release', [session]),
  };
}

/** A runtime without WebAssembly can still sync by hosting the engine elsewhere, such as a WebView. */
export interface HostedSyncRuntime {
  transport: SyncEngineTransport;
  subscribeToForeground?: (listener: () => void) => () => void;
}

let hostedSyncRuntime: HostedSyncRuntime | null = null;

export function registerHostedSyncRuntime(runtime: HostedSyncRuntime | null): void {
  hostedSyncRuntime = runtime;
}

export function getHostedSyncRuntime(): HostedSyncRuntime | null {
  return hostedSyncRuntime;
}
