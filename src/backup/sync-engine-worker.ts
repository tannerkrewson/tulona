import {
  createSyncDocument,
  documentHeads,
  loadSyncDocument,
  mergeSyncDocuments,
  projectSyncDocument,
  saveSyncDocument,
  updateSyncDocumentFromBackup,
  type SyncDocument,
} from './dropbox-sync-document';
import type {
  SyncDocumentHandle,
  SyncEngineMethod,
  SyncEngineMethods,
  SyncEngineRequest,
  SyncEngineTransport,
} from './sync-engine';

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const PKCE_LENGTH = 96;

export function encodeBase64(bytes: Uint8Array): string {
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]!;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const bits = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    output += BASE64_ALPHABET[(bits >> 18) & 63];
    output += BASE64_ALPHABET[(bits >> 12) & 63];
    output += second === undefined ? '=' : BASE64_ALPHABET[(bits >> 6) & 63];
    output += third === undefined ? '=' : BASE64_ALPHABET[bits & 63];
  }
  return output;
}

export function decodeBase64(value: string): Uint8Array {
  const normalized = value.replace(/\s/g, '');
  if (!normalized || normalized.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(normalized)) {
    throw new Error('Dropbox synchronization file contains invalid encoded data');
  }
  const bytes: number[] = [];
  for (let index = 0; index < normalized.length; index += 4) {
    const a = BASE64_ALPHABET.indexOf(normalized[index]!);
    const b = BASE64_ALPHABET.indexOf(normalized[index + 1]!);
    const c = normalized[index + 2] === '=' ? 0 : BASE64_ALPHABET.indexOf(normalized[index + 2]!);
    const d = normalized[index + 3] === '=' ? 0 : BASE64_ALPHABET.indexOf(normalized[index + 3]!);
    if (a < 0 || b < 0 || c < 0 || d < 0) throw new Error('Dropbox sync file encoding is invalid');
    const bits = (a << 18) | (b << 12) | (c << 6) | d;
    bytes.push((bits >> 16) & 255);
    if (normalized[index + 2] !== '=') bytes.push((bits >> 8) & 255);
    if (normalized[index + 3] !== '=') bytes.push(bits & 255);
  }
  return new Uint8Array(bytes);
}

function base64Url(bytes: Uint8Array): string {
  return encodeBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** Holds Automerge documents by handle so callers never need WebAssembly themselves. */
export function createSyncEngineWorker(): SyncEngineMethods {
  const documents = new Map<string, SyncDocument>();
  let nextHandle = 0;

  const store = (session: string, document: SyncDocument): SyncDocumentHandle => {
    nextHandle += 1;
    const id = `${session}:${nextHandle}`;
    documents.set(id, document);
    return { id, datasetId: document.datasetId };
  };
  const read = (session: string, handle: SyncDocumentHandle): SyncDocument => {
    const document = handle.id.startsWith(`${session}:`) ? documents.get(handle.id) : undefined;
    if (!document) throw new Error('Synchronization document is no longer available');
    return document;
  };

  return {
    create: (session, backup, actorId, datasetId) =>
      store(session, createSyncDocument(backup, actorId, datasetId)),
    load: (session, encoded, actorId) =>
      store(session, loadSyncDocument(decodeBase64(encoded), actorId)),
    update: (session, document, previous, next) =>
      store(session, updateSyncDocumentFromBackup(read(session, document), previous, next)),
    merge: (session, local, remote, baseline) =>
      store(
        session,
        mergeSyncDocuments(read(session, local), read(session, remote), baseline ?? undefined)
      ),
    project: (session, document, options) => projectSyncDocument(read(session, document), options),
    save: (session, document) => encodeBase64(saveSyncDocument(read(session, document))),
    heads: (session, document) => documentHeads(read(session, document)),
    release: (session) => {
      for (const id of documents.keys()) {
        if (id.startsWith(`${session}:`)) documents.delete(id);
      }
    },
    createPkceCodes: async () => {
      const verifier = base64Url(crypto.getRandomValues(new Uint8Array(PKCE_LENGTH))).slice(0, 128);
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
      return { verifier, challenge: base64Url(new Uint8Array(digest)) };
    },
  };
}

export function dispatchSyncEngineRequest(
  worker: SyncEngineMethods,
  request: SyncEngineRequest
): Promise<unknown> {
  const method = worker[request.method] as (...args: unknown[]) => unknown;
  return Promise.resolve().then(() => method(...(request.args as unknown[])));
}

/** Answers one JSON request from `HostedSyncEngineClient`, reporting failures by message. */
export async function handleSyncEngineMessage(
  worker: SyncEngineMethods,
  message: string
): Promise<string> {
  const { id, request } = JSON.parse(message) as { id: number; request: SyncEngineRequest };
  try {
    const result = await dispatchSyncEngineRequest(worker, request);
    return JSON.stringify({ id, result: result ?? null });
  } catch (error) {
    return JSON.stringify({ id, error: error instanceof Error ? error.message : String(error) });
  }
}

export function createInProcessSyncTransport(
  worker: SyncEngineMethods = createSyncEngineWorker()
): SyncEngineTransport {
  return <M extends SyncEngineMethod>(method: M, args: Parameters<SyncEngineMethods[M]>) =>
    dispatchSyncEngineRequest(worker, { method, args } as SyncEngineRequest) as Promise<
      Awaited<ReturnType<SyncEngineMethods[M]>>
    >;
}
