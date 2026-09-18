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
  const database = new AsyncStorageDatabase(new MemoryStorage());
  const writes: string[][] = [];
  const unsubscribe = database.subscribeToWrites((keys) => writes.push([...keys]));

  await database.write('one', '1');
  await database.multiWrite([
    ['two', '2'],
    ['three', '3'],
  ]);
  await database.remove('two');
  await database.multiRemove(['one', 'three']);

  assert(
    JSON.stringify(writes) ===
      JSON.stringify([['one'], ['two', 'three'], ['two'], ['one', 'three']]),
    'successful writes and removals must notify observers once with their keys'
  );

  const throwingUnsubscribe = database.subscribeToWrites(() => {
    throw new Error('observer failure');
  });
  await database.write('after-observer-failure', 'still local');
  throwingUnsubscribe();
  unsubscribe();
  assert(
    (await database.read('after-observer-failure')) === 'still local',
    'observer failures must never fail local persistence'
  );
}

run().catch((error: unknown) => {
  throw error;
});
