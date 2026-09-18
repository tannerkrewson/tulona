import type { Dropbox, DropboxAuth } from 'dropbox';

import {
  DROPBOX_BACKUP_PATH,
  DropboxBackupService,
  type DropboxBackupServiceOptions,
} from '../src/backup';
import { AsyncStorageDatabase, type AsyncStorageLike } from '../src/data';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class MemoryStorage implements AsyncStorageLike {
  readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(check: () => boolean, message: string): Promise<void> {
  const deadline = Date.now() + 1000;
  while (!check() && Date.now() < deadline) await wait(5);
  assert(check(), message);
}

interface UploadCall {
  path: string;
  contents: string;
  mode: { '.tag': string };
  autorename: boolean;
  mute: boolean;
}

function createHarness(options: { debounceMs?: number } = {}) {
  const storage = new MemoryStorage();
  const database = new AsyncStorageDatabase(storage);
  let snapshot = '{"snapshot":"first"}';
  const uploads: UploadCall[] = [];
  const authOptions: { clientId: string; refreshToken?: string }[] = [];
  const authUrlArguments: unknown[][] = [];
  let uploadGate: Promise<void> | null = null;
  let releaseUpload: (() => void) | null = null;

  const fakeAuth = {
    codeVerifier: 'test-code-verifier',
    getAuthenticationUrl: async (...args: unknown[]) => {
      authUrlArguments.push(args);
      return 'https://www.dropbox.com/oauth2/authorize?test=1';
    },
    getCodeVerifier(): string {
      return this.codeVerifier;
    },
    setCodeVerifier(value: string): void {
      this.codeVerifier = value;
    },
    getAccessTokenFromCode: async () => ({
      result: {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
      },
    }),
  };
  const authFactory: NonNullable<DropboxBackupServiceOptions['authFactory']> = (options) => {
    authOptions.push({ clientId: options.clientId, refreshToken: options.refreshToken });
    return fakeAuth as unknown as DropboxAuth;
  };
  const clientFactory: NonNullable<DropboxBackupServiceOptions['clientFactory']> = () =>
    ({
      filesUpload: async (value: unknown) => {
        uploads.push(value as UploadCall);
        if (uploadGate) await uploadGate;
        return { result: {} };
      },
    }) as unknown as Dropbox;

  const service = new DropboxBackupService({ exportJson: async () => snapshot }, database, {
    appKey: 'test-app-key',
    redirectUri: 'https://example.test/dropbox-auth',
    now: () => Date.parse('2026-09-17T15:00:00.000Z'),
    debounceMs: options.debounceMs ?? 5,
    authFactory,
    clientFactory,
  });

  return {
    authOptions,
    authUrlArguments,
    database,
    service,
    setSnapshot(value: string): void {
      snapshot = value;
    },
    uploads,
    blockNextUpload(): void {
      uploadGate = new Promise<void>((resolve) => {
        releaseUpload = resolve;
      });
    },
    releaseUpload(): void {
      releaseUpload?.();
      releaseUpload = null;
      uploadGate = null;
    },
  };
}

async function authorizationChecks(): Promise<void> {
  const harness = createHarness();
  const started = await harness.service.beginAuthorization();
  assert(started.url.includes('dropbox.com'), 'authorization must use Dropbox');
  assert(harness.authUrlArguments[0]?.[2] === 'code', 'authorization must use the code flow');
  assert(
    harness.authUrlArguments[0]?.[3] === 'offline',
    'authorization must request a refresh token'
  );

  const pending = JSON.parse((await harness.database.read('tulona:dropbox-backup')) ?? '{}') as {
    pendingAuthorization?: { state?: string; codeVerifier?: string };
  };
  const pendingAuthorization = pending.pendingAuthorization;
  const state = harness.authUrlArguments[0]?.[1];
  assert(
    pendingAuthorization !== undefined &&
      pendingAuthorization.state === state &&
      pendingAuthorization.codeVerifier === 'test-code-verifier',
    'authorization state and PKCE verifier must be persisted before redirect'
  );
  try {
    await harness.service.completeAuthorization('code', 'wrong-state');
    throw new Error('mismatched Dropbox state must be rejected');
  } catch (error) {
    assert(error instanceof Error && error.message.includes('state'), 'state mismatch is explicit');
  }

  await harness.service.completeAuthorization('code', String(state));
  const status = await harness.service.getStatus();
  assert(status.connected && status.enabled, 'completed authorization must enable backups');
  assert(
    harness.authOptions.some((options) => options.refreshToken === undefined),
    'authorization exchange must not require a client secret or refresh token'
  );
}

async function overwriteChecks(): Promise<void> {
  const harness = createHarness();
  await harness.service.beginAuthorization();
  const state = String(harness.authUrlArguments[0]?.[1]);
  await harness.service.completeAuthorization('code', state);
  await harness.service.backupNow();
  assert(harness.uploads.length === 1, 'manual backup must upload one snapshot');
  assert(
    harness.uploads[0]?.path === DROPBOX_BACKUP_PATH &&
      harness.uploads[0]?.mode['.tag'] === 'overwrite' &&
      harness.uploads[0]?.autorename === false &&
      harness.uploads[0]?.mute === true,
    'backup must use one stable overwrite-only Dropbox path'
  );
  assert(
    harness.authOptions.some((options) => options.refreshToken === 'refresh-token'),
    'uploads must authenticate with the persisted refresh token'
  );

  harness.setSnapshot('{"snapshot":"new"}');
  await harness.service.backupNow();
  assert(harness.uploads[1]?.contents === '{"snapshot":"new"}', 'backup must use the latest JSON');
}

async function automaticQueueChecks(): Promise<void> {
  const harness = createHarness({ debounceMs: 5 });
  await harness.service.beginAuthorization();
  await harness.service.completeAuthorization('code', String(harness.authUrlArguments[0]?.[1]));
  harness.blockNextUpload();
  const stop = harness.service.startAutomaticBackups();
  await waitFor(() => harness.uploads.length === 1, 'automatic backup must run after startup');
  harness.setSnapshot('{"snapshot":"second"}');
  await harness.database.write('ds:test:changed', 'yes');
  harness.releaseUpload();
  await waitFor(() => harness.uploads.length === 2, 'writes during an upload must queue a retry');
  assert(
    harness.uploads[0]?.contents === '{"snapshot":"first"}' &&
      harness.uploads[1]?.contents === '{"snapshot":"second"}',
    'queued automatic backups must upload the newer snapshot after the older one completes'
  );
  stop();
}

async function run(): Promise<void> {
  await authorizationChecks();
  await overwriteChecks();
  await automaticQueueChecks();
}

run().catch((error: unknown) => {
  throw error;
});
