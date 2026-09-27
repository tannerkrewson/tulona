import { DropboxBackupService } from '../src/backup/dropbox-backup';
import type { KeyValueDatabase } from '../src/data/database';

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

async function run() {
  await assertUnsupportedRuntime(undefined);
  await assertUnsupportedRuntime({});
  console.log('Dropbox sync safely handles runtimes without Automerge WebAssembly support.');
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
