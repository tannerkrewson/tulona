import 'fake-indexeddb/auto';

import { createAsyncStorageDatabase } from '../src/data/database';
import { clearLegacyLocalStorage } from '../src/data/indexed-db-storage';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function run(): Promise<void> {
  const database = createAsyncStorageDatabase();
  const prefix = `indexed-db-test-${Date.now()}-${Math.random()}`;
  const entries = [
    [`${prefix}:one`, 'first value'],
    [`${prefix}:two`, 'second value'],
  ] as const;

  await database.write(entries[0][0], entries[0][1]);
  assert(
    (await database.read(entries[0][0])) === entries[0][1],
    'IndexedDB storage must round-trip a single value'
  );

  await database.multiWrite(entries);
  const values = await database.multiRead(entries.map(([key]) => key));
  assert(
    values.get(entries[0][0]) === entries[0][1] && values.get(entries[1][0]) === entries[1][1],
    'IndexedDB storage must round-trip batched values'
  );
  if (!database.keys) throw new Error('IndexedDB database must support key enumeration');
  assert(
    (await database.keys()).filter((key) => key.startsWith(prefix)).length === entries.length,
    'IndexedDB storage must enumerate keys for backups and reset'
  );

  await database.multiRemove(entries.map(([key]) => key));
  assert(
    (await database.read(entries[0][0])) === null,
    'IndexedDB storage must remove batched values'
  );

  const legacyValues = new Map([
    ['tulona:metadata', 'legacy metadata'],
    ['ds:legacy-dataset:catalog', 'legacy catalog'],
    ['unrelated-key', 'keep me'],
  ]);
  const legacyStorage = {
    get length(): number {
      return legacyValues.size;
    },
    key(index: number): string | null {
      return [...legacyValues.keys()][index] ?? null;
    },
    removeItem(key: string): void {
      legacyValues.delete(key);
    },
  };
  const previousWindow = (globalThis as { window?: unknown }).window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: legacyStorage },
  });
  try {
    clearLegacyLocalStorage();
  } finally {
    if (previousWindow === undefined) Reflect.deleteProperty(globalThis, 'window');
    else Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
  }
  assert(
    !legacyValues.has('tulona:metadata') &&
      !legacyValues.has('ds:legacy-dataset:catalog') &&
      legacyValues.has('unrelated-key'),
    'explicit reset cleanup must remove only legacy Tulona localStorage keys'
  );
}

run().catch((error: unknown) => {
  throw error;
});
