import AsyncStorage from '@react-native-async-storage/async-storage';

import { PersistenceError } from './errors';

export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys?(): Promise<readonly string[]>;
  multiGet?(keys: readonly string[]): Promise<readonly (readonly [string, string | null])[]>;
  multiSet?(entries: readonly (readonly [string, string])[]): Promise<void>;
  multiRemove?(keys: readonly string[]): Promise<void>;
}

export interface KeyValueDatabase {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  multiRead(keys: readonly string[]): Promise<ReadonlyMap<string, string | null>>;
  multiWrite(entries: readonly (readonly [string, string])[]): Promise<void>;
  multiRemove(keys: readonly string[]): Promise<void>;
  verify(key: string, expectedValue: string | null): Promise<void>;
  /** Used only by repository boundaries that need to enumerate a dataset. */
  keys?(): Promise<readonly string[]>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Explicit AsyncStorage access. Zustand persistence middleware is not used. */
export class AsyncStorageDatabase implements KeyValueDatabase {
  constructor(private readonly storage: AsyncStorageLike = AsyncStorage) {}

  async read(key: string): Promise<string | null> {
    try {
      return await this.storage.getItem(key);
    } catch (error) {
      throw new PersistenceError(
        'read',
        `Unable to read storage key "${key}": ${errorMessage(error)}`,
        key,
        error
      );
    }
  }

  async write(key: string, value: string): Promise<void> {
    try {
      await this.storage.setItem(key, value);
    } catch (error) {
      throw new PersistenceError(
        'write',
        `Unable to write storage key "${key}": ${errorMessage(error)}`,
        key,
        error
      );
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.storage.removeItem(key);
    } catch (error) {
      throw new PersistenceError(
        'remove',
        `Unable to remove storage key "${key}": ${errorMessage(error)}`,
        key,
        error
      );
    }
  }

  async multiRead(keys: readonly string[]): Promise<ReadonlyMap<string, string | null>> {
    try {
      if (this.storage.multiGet) {
        const values = await this.storage.multiGet(keys);
        return new Map(values.map(([key, value]) => [key, value] as const));
      }
      const values = await Promise.all(
        keys.map(async (key) => [key, await this.storage.getItem(key)] as const)
      );
      return new Map(values);
    } catch (error) {
      throw new PersistenceError(
        'multi-read',
        `Unable to read multiple storage keys: ${errorMessage(error)}`,
        undefined,
        error
      );
    }
  }

  async multiWrite(entries: readonly (readonly [string, string])[]): Promise<void> {
    try {
      if (this.storage.multiSet) {
        await this.storage.multiSet(entries);
        return;
      }
      await Promise.all(entries.map(([key, value]) => this.storage.setItem(key, value)));
    } catch (error) {
      throw new PersistenceError(
        'multi-write',
        `Unable to write multiple storage keys: ${errorMessage(error)}`,
        undefined,
        error
      );
    }
  }

  async multiRemove(keys: readonly string[]): Promise<void> {
    try {
      if (this.storage.multiRemove) {
        await this.storage.multiRemove(keys);
        return;
      }
      await Promise.all(keys.map((key) => this.storage.removeItem(key)));
    } catch (error) {
      throw new PersistenceError(
        'remove',
        `Unable to remove multiple storage keys: ${errorMessage(error)}`,
        undefined,
        error
      );
    }
  }

  async verify(key: string, expectedValue: string | null): Promise<void> {
    const actualValue = await this.read(key);
    if (actualValue !== expectedValue) {
      throw new PersistenceError(
        'verification',
        `Storage verification failed for key "${key}"`,
        key,
        { expectedValue, actualValue }
      );
    }
  }

  async keys(): Promise<readonly string[]> {
    if (!this.storage.getAllKeys) return [];
    try {
      return await this.storage.getAllKeys();
    } catch (error) {
      throw new PersistenceError(
        'read',
        `Unable to enumerate storage keys: ${errorMessage(error)}`,
        undefined,
        error
      );
    }
  }
}

export function createAsyncStorageDatabase(storage?: AsyncStorageLike): KeyValueDatabase {
  return new AsyncStorageDatabase(storage);
}
