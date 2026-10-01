import { DropboxBackupService } from '../src/backup/dropbox-backup';
import type { KeyValueDatabase } from '../src/data/database';
import { HostedSyncEngineClient } from '../src/backup/hosted-sync-engine';
import { registerHostedSyncRuntime, type SyncEngineTransport } from '../src/backup/sync-engine';
import { createSyncEngineWorker } from '../src/backup/sync-engine-worker';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const database: KeyValueDatabase = {
  read: async () => null,
  write: async () => undefined,
  remove: async () => undefined,
  multiRead: async () => new Map(),
  multiWrite: async () => undefined,
  multiRemove: async () => undefined,
  verify: async () => undefined,
};

const backupService = {} as ConstructorParameters<typeof DropboxBackupService>[0];
const service = new DropboxBackupService(backupService, database);

async function assertUnsupportedRuntime(simulatedWebAssembly: unknown): Promise<void> {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'WebAssembly');
  Object.defineProperty(globalThis, 'WebAssembly', {
    configurable: true,
    value: simulatedWebAssembly,
    writable: true,
  });

  try {
    const status = await service.getStatus();
    assert(!status.syncSupported, 'runtime must report Dropbox sync unavailable');
    assert(!status.enabled, 'unsupported runtimes must not report auto-sync enabled');

    let syncError: unknown;
    try {
      await service.syncNow();
    } catch (error) {
      syncError = error;
    }
    assert(
      syncError instanceof Error && syncError.message.includes('WebAssembly'),
      'manual sync must fail safely with an explanatory runtime error'
    );

    let authorizationError: unknown;
    try {
      await service.beginAuthorization();
    } catch (error) {
      authorizationError = error;
    }
    assert(
      authorizationError instanceof Error && authorizationError.message.includes('WebAssembly'),
      'unsupported runtimes must not start an unusable Dropbox authorization flow'
    );

    let enableError: unknown;
    try {
      await service.setEnabled(true);
    } catch (error) {
      enableError = error;
    }
    assert(
      enableError instanceof Error && enableError.message.includes('WebAssembly'),
      'unsupported runtimes must refuse automatic sync without touching data'
    );
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'WebAssembly', originalDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'WebAssembly');
    }
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('expected the promise to reject');
}

async function assertHostedRuntime(): Promise<void> {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'WebAssembly');
  Object.defineProperty(globalThis, 'WebAssembly', {
    configurable: true,
    value: undefined,
    writable: true,
  });
  const client = new HostedSyncEngineClient(20, 1000);
  registerHostedSyncRuntime({ transport: client.transport });
  try {
    assert(
      (await service.getStatus()).syncSupported,
      'a hosted sync engine must make Dropbox sync available without WebAssembly'
    );

    let demanded = 0;
    const unsubscribe = client.subscribeToDemand(() => {
      demanded += 1;
    });
    const unavailable = await rejection(
      client.transport('heads', ['s', { id: 's:1', datasetId: 'd' }])
    );
    assert(demanded === 1 && client.isDemanded, 'the first request must ask the host to start');
    assert(
      unavailable.includes('did not start'),
      'requests must fail when the engine never starts'
    );
    unsubscribe();

    const sent: string[] = [];
    client.attach('first', (message) => sent.push(message));
    const inFlight = rejection(client.transport('heads', ['s', { id: 's:1', datasetId: 'd' }]));
    await tick();
    client.attach('first', (message) => sent.push(message));
    client.attach('second', (message) => sent.push(message));
    assert(
      (await inFlight).includes('restarted'),
      'a new engine instance must reject requests whose documents it no longer holds'
    );

    const answered = client.transport('heads', ['s', { id: 's:1', datasetId: 'd' }]);
    await tick();
    const { id } = JSON.parse(sent.at(-1)!) as { id: number };
    client.receive(JSON.stringify({ id, result: ['head'] }));
    assert((await answered)[0] === 'head', 'responses must resolve the matching request');

    const failed = rejection(client.transport('heads', ['s', { id: 's:1', datasetId: 'd' }]));
    await tick();
    const failedId = (JSON.parse(sent.at(-1)!) as { id: number }).id;
    client.receive(JSON.stringify({ id: failedId, error: 'Engine failure' }));
    assert((await failed) === 'Engine failure', 'engine errors must reject with their message');
  } finally {
    registerHostedSyncRuntime(null);
    if (originalDescriptor) Object.defineProperty(globalThis, 'WebAssembly', originalDescriptor);
    else Reflect.deleteProperty(globalThis, 'WebAssembly');
  }
}

async function assertHostedPkce(): Promise<void> {
  const codes = await createSyncEngineWorker().createPkceCodes();
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codes.verifier))
  );
  const expectedChallenge = btoa(String.fromCharCode(...digest))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  assert(
    /^[A-Za-z0-9_-]{128}$/.test(codes.verifier) && codes.challenge === expectedChallenge,
    'engine PKCE codes must be a 128-character verifier with its S256 challenge'
  );

  const memory = new Map<string, string>();
  const memoryDatabase: KeyValueDatabase = {
    ...database,
    read: async (key) => memory.get(key) ?? null,
    write: async (key, value) => {
      memory.set(key, value);
    },
  };
  const authService = new DropboxBackupService(backupService, memoryDatabase, {
    appKey: 'test-app-key',
    redirectUri: 'tulona://dropbox-auth',
  });
  const transport = (async (method: string) => {
    if (method !== 'createPkceCodes') throw new Error(`unexpected ${method}`);
    return codes;
  }) as SyncEngineTransport;
  const webCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
  registerHostedSyncRuntime({ transport });
  try {
    const { url } = await authService.beginAuthorization();
    const stored = [...memory.values()].join('\n');
    assert(
      url.includes(`code_challenge=${codes.challenge}`) &&
        url.includes('code_challenge_method=S256') &&
        stored.includes(codes.verifier),
      'without Web Crypto, authorization must use and remember the hosted engine PKCE codes'
    );
  } finally {
    registerHostedSyncRuntime(null);
    if (webCrypto) Object.defineProperty(globalThis, 'crypto', webCrypto);
  }
}

async function run() {
  await assertUnsupportedRuntime(undefined);
  await assertUnsupportedRuntime({});
  await assertHostedRuntime();
  await assertHostedPkce();
  console.log('Dropbox sync handles runtimes with and without Automerge WebAssembly support.');
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
