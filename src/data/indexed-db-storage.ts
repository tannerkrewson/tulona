import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

import type { AsyncStorageLike, DatabaseSnapshotCommit } from './database';

interface TulonaStorageSchema extends DBSchema {
  entries: {
    key: string;
    value: string;
  };
}

export const INDEXED_DB_NAME = 'tulona-storage';
export const INDEXED_DB_VERSION = 1;
const INDEXED_DB_STORE = 'entries' as const;

/** AsyncStorage-compatible key/value storage backed by the browser's IndexedDB. */
export class IndexedDbStorage implements AsyncStorageLike {
  private readonly database: Promise<IDBPDatabase<TulonaStorageSchema>>;

  constructor(databaseName: string = INDEXED_DB_NAME) {
    this.database = openDB<TulonaStorageSchema>(databaseName, INDEXED_DB_VERSION, {
      upgrade: (database) => {
        if (!database.objectStoreNames.contains(INDEXED_DB_STORE)) {
          database.createObjectStore(INDEXED_DB_STORE);
        }
      },
    });
  }

  async getItem(key: string): Promise<string | null> {
    const value = await (await this.database).get(INDEXED_DB_STORE, key);
    return value ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    const database = await this.database;
    await database.put(INDEXED_DB_STORE, value, key);
  }

  async removeItem(key: string): Promise<void> {
    const database = await this.database;
    await database.delete(INDEXED_DB_STORE, key);
  }

  async getAllKeys(): Promise<readonly string[]> {
    const database = await this.database;
    return database.getAllKeys(INDEXED_DB_STORE);
  }

  async readSnapshot(): Promise<ReadonlyMap<string, string>> {
    const database = await this.database;
    const transaction = database.transaction(INDEXED_DB_STORE, 'readonly');
    const [keys, values] = await Promise.all([
      transaction.store.getAllKeys(),
      transaction.store.getAll(),
    ]);
    await transaction.done;
    return new Map(keys.map((key, index) => [String(key), values[index]]));
  }

  async compareAndApplySnapshot(commit: DatabaseSnapshotCommit): Promise<boolean> {
    const database = await this.database;
    const transaction = database.transaction(INDEXED_DB_STORE, 'readwrite');
    const store = transaction.store;
    const [keys, values] = await Promise.all([store.getAllKeys(), store.getAll()]);
    const current = new Map(keys.map((key, index) => [String(key), values[index]]));
    const actualPrefix = new Map([...current].filter(([key]) => key.startsWith(commit.prefix)));
    const prefixMatches =
      actualPrefix.size === commit.expectedPrefix.size &&
      [...actualPrefix].every(([key, value]) => commit.expectedPrefix.get(key) === value);
    const comparisonsMatch = [...commit.compare].every(
      ([key, expected]) => (current.get(key) ?? null) === expected
    );
    if (!prefixMatches || !comparisonsMatch) {
      await transaction.done;
      return false;
    }
    for (const [key, value] of commit.writes) store.put(value, key);
    for (const key of commit.deletes) store.delete(key);
    await transaction.done;
    return true;
  }

  async multiGet(keys: readonly string[]): Promise<readonly (readonly [string, string | null])[]> {
    const database = await this.database;
    return Promise.all(
      keys.map(async (key) => [key, (await database.get(INDEXED_DB_STORE, key)) ?? null] as const)
    );
  }

  async multiSet(entries: readonly (readonly [string, string])[]): Promise<void> {
    const database = await this.database;
    const transaction = database.transaction(INDEXED_DB_STORE, 'readwrite');
    for (const [key, value] of entries) transaction.store.put(value, key);
    await transaction.done;
  }

  async multiRemove(keys: readonly string[]): Promise<void> {
    const database = await this.database;
    const transaction = database.transaction(INDEXED_DB_STORE, 'readwrite');
    for (const key of keys) transaction.store.delete(key);
    await transaction.done;
  }
}

/**
 * Removes only old Tulona localStorage keys after an explicit user reset.
 * Startup never calls this: legacy data is not migrated or silently deleted.
 */
export function clearLegacyLocalStorage(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  const legacyKeys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith('tulona:') || key?.startsWith('ds:')) legacyKeys.push(key);
  }
  for (const key of legacyKeys) window.localStorage.removeItem(key);
}
