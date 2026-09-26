import type { Dropbox, DropboxAuth } from 'dropbox';

import {
  DROPBOX_BACKUP_SCOPES,
  DropboxBackupService,
  type DropboxBackupServiceOptions,
} from '../src/backup/dropbox-backup';
import { parseBackup } from '../src/backup/backup-import';
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

async function run(): Promise<void> {
  const storage = new MemoryStorage();
  const database = new AsyncStorageDatabase(storage);
  const authUrlArguments: unknown[][] = [];
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
  const options: DropboxBackupServiceOptions = {
    appKey: 'test-app-key',
    redirectUri: 'https://example.test/dropbox-auth',
    authFactory: () => fakeAuth as unknown as DropboxAuth,
    clientFactory: () => ({}) as Dropbox,
  };
  const service = new DropboxBackupService(
    {
      exportSynchronizationSnapshot: async () => {
        throw new Error('not used in this authorization test');
      },
      inspectImport: parseBackup,
      applySynchronizationProjection: async () => false,
    },
    database,
    options
  );

  const started = await service.beginAuthorization();
  assert(started.url.includes('dropbox.com'), 'authorization must use Dropbox');
  assert(authUrlArguments[0]?.[2] === 'code', 'authorization must use the code flow');
  assert(authUrlArguments[0]?.[3] === 'offline', 'authorization must request a refresh token');
  assert(
    JSON.stringify(authUrlArguments[0]?.[4]) === JSON.stringify(DROPBOX_BACKUP_SCOPES),
    'authorization must request content read/write and metadata read scopes'
  );

  const pending = JSON.parse((await database.read('tulona:dropbox-backup')) ?? '{}') as {
    pendingAuthorization?: { state?: string; codeVerifier?: string };
  };
  const state = authUrlArguments[0]?.[1];
  const pendingAuthorization = pending.pendingAuthorization;
  assert(
    pendingAuthorization !== undefined &&
      pendingAuthorization.state === state &&
      pendingAuthorization.codeVerifier === 'test-code-verifier',
    'authorization state and PKCE verifier must be persisted before redirect'
  );
  try {
    await service.completeAuthorization('code', 'wrong-state');
    throw new Error('mismatched Dropbox state must be rejected');
  } catch (error) {
    assert(error instanceof Error && error.message.includes('state'), 'state mismatch is explicit');
  }

  await service.completeAuthorization('code', String(state));
  const status = await service.getStatus();
  assert(status.connected && status.enabled, 'completed authorization must enable synchronization');

  if ('close' in database && typeof database.close === 'function') database.close();
}

run().catch((error: unknown) => {
  throw error;
});
