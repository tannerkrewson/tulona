import AsyncStorage from '@react-native-async-storage/async-storage';

import { PersistenceError } from './errors';
import { IndexedDbStorage } from './indexed-db-storage';

export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys?(): Promise<readonly string[]>;
  multiGet?(keys: readonly string[]): Promise<readonly (readonly [string, string | null])[]>;
  multiSet?(entries: readonly (readonly [string, string])[]): Promise<void>;
  multiRemove?(keys: readonly string[]): Promise<void>;
  readSnapshot?(): Promise<ReadonlyMap<string, string>>;
  compareAndApplySnapshot?(commit: DatabaseSnapshotCommit): Promise<boolean>;
}

export type DatabaseWriteSource = 'local' | 'sync';
export type DatabaseWriteListener = (keys: readonly string[], source?: DatabaseWriteSource) => void;

export interface DatabaseSnapshotCommit {
  /** Compare the complete key set with this prefix, including new/deleted keys. */
  prefix: string;
  expectedPrefix: ReadonlyMap<string, string>;
  /** Additional individual keys, such as the persisted sync document. */
  compare: ReadonlyMap<string, string | null>;
  writes: ReadonlyMap<string, string>;
  deletes: readonly string[];
  source?: DatabaseWriteSource;
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
  /** Optional best-effort observer for integrations such as automatic backups. */
  subscribeToWrites?(listener: DatabaseWriteListener): () => void;
  /** Writes made in another tab of the same origin. */
  subscribeToExternalWrites?(listener: DatabaseWriteListener): () => void;
  /** A consistent view of all key/value entries when the adapter can provide one. */
  readSnapshot?(): Promise<ReadonlyMap<string, string>>;
  /** Atomically compare and apply a dataset projection where the adapter allows it. */
  compareAndApplySnapshot?(commit: DatabaseSnapshotCommit): Promise<boolean>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sameStringMap(
  left: ReadonlyMap<string, string>,
  right: ReadonlyMap<string, string>
): boolean {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) if (right.get(key) !== value) return false;
  return true;
}

/** Explicit AsyncStorage access. Zustand persistence middleware is not used. */
export class AsyncStorageDatabase implements KeyValueDatabase {
  private readonly writeListeners = new Set<DatabaseWriteListener>();
  private readonly externalWriteListeners = new Set<DatabaseWriteListener>();
  private readonly instanceId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  private operationTail: Promise<void> = Promise.resolve();
  private readonly channel: BroadcastChannel | null;

  constructor(private readonly storage: AsyncStorageLike = AsyncStorage) {
    this.channel =
      typeof BroadcastChannel === 'undefined'
        ? null
        : new BroadcastChannel('tulona-database-changes');
    if (this.channel) {
      const nodeChannel = this.channel as BroadcastChannel & { unref?: () => void };
      nodeChannel.unref?.();
      this.channel.onmessage = (event: MessageEvent<unknown>) => {
        const message = event.data as {
          instanceId?: unknown;
          keys?: unknown;
          source?: unknown;
        } | null;
        if (
          !message ||
          message.instanceId === this.instanceId ||
          !Array.isArray(message.keys) ||
          message.keys.some((key) => typeof key !== 'string')
        )
          return;
        const source = message.source === 'sync' ? 'sync' : 'local';
        for (const listener of this.externalWriteListeners) {
          try {
            listener(message.keys as string[], source);
          } catch {
            // External observers must not interfere with the writing tab.
          }
        }
      };
    }
  }

  close(): void {
    this.channel?.close();
  }

  private serializeOperation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation);
    this.operationTail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  subscribeToWrites(listener: DatabaseWriteListener): () => void {
    this.writeListeners.add(listener);
    return () => this.writeListeners.delete(listener);
  }

  subscribeToExternalWrites(listener: DatabaseWriteListener): () => void {
    this.externalWriteListeners.add(listener);
    return () => this.externalWriteListeners.delete(listener);
  }

  private notifyWrite(keys: readonly string[], source: DatabaseWriteSource = 'local'): void {
    for (const listener of this.writeListeners) {
      try {
        listener(keys, source);
      } catch {
        // Observers must never turn a successful local write into a failed write.
      }
    }
    this.channel?.postMessage({ instanceId: this.instanceId, keys, source });
  }

  async read(key: string): Promise<string | null> {
    return this.serializeOperation(async () => {
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
    });
  }

  async write(key: string, value: string): Promise<void> {
    return this.serializeOperation(async () => {
      try {
        await this.storage.setItem(key, value);
        this.notifyWrite([key]);
      } catch (error) {
        throw new PersistenceError(
          'write',
          `Unable to write storage key "${key}": ${errorMessage(error)}`,
          key,
          error
        );
      }
    });
  }

  async remove(key: string): Promise<void> {
    return this.serializeOperation(async () => {
      try {
        await this.storage.removeItem(key);
        this.notifyWrite([key]);
      } catch (error) {
        throw new PersistenceError(
          'remove',
          `Unable to remove storage key "${key}": ${errorMessage(error)}`,
          key,
          error
        );
      }
    });
  }

  async multiRead(keys: readonly string[]): Promise<ReadonlyMap<string, string | null>> {
    return this.serializeOperation(async () => {
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
    });
  }

  async multiWrite(entries: readonly (readonly [string, string])[]): Promise<void> {
    return this.serializeOperation(async () => {
      try {
        if (this.storage.multiSet) {
          await this.storage.multiSet(entries);
        } else {
          await Promise.all(entries.map(([key, value]) => this.storage.setItem(key, value)));
        }
        this.notifyWrite(entries.map(([key]) => key));
      } catch (error) {
        throw new PersistenceError(
          'multi-write',
          `Unable to write multiple storage keys: ${errorMessage(error)}`,
          undefined,
          error
        );
      }
    });
  }

  async multiRemove(keys: readonly string[]): Promise<void> {
    return this.serializeOperation(async () => {
      try {
        if (this.storage.multiRemove) {
          await this.storage.multiRemove(keys);
        } else {
          await Promise.all(keys.map((key) => this.storage.removeItem(key)));
        }
        this.notifyWrite(keys);
      } catch (error) {
        throw new PersistenceError(
          'remove',
          `Unable to remove multiple storage keys: ${errorMessage(error)}`,
          undefined,
          error
        );
      }
    });
  }

  async readSnapshot(): Promise<ReadonlyMap<string, string>> {
    return this.serializeOperation(async () => {
      if (this.storage.readSnapshot) return this.storage.readSnapshot();
      if (!this.storage.getAllKeys) {
        throw new PersistenceError('read', 'This storage adapter cannot take a full snapshot');
      }
      try {
        const keys = await this.storage.getAllKeys();
        const values = this.storage.multiGet
          ? await this.storage.multiGet(keys)
          : await Promise.all(
              keys.map(async (key) => [key, await this.storage.getItem(key)] as const)
            );
        return new Map(
          values.flatMap(([key, value]) => (value === null ? [] : [[key, value] as const]))
        );
      } catch (error) {
        throw new PersistenceError(
          'read',
          `Unable to take a storage snapshot: ${errorMessage(error)}`,
          undefined,
          error
        );
      }
    });
  }

  async compareAndApplySnapshot(commit: DatabaseSnapshotCommit): Promise<boolean> {
    return this.serializeOperation(async () => {
      if (this.storage.compareAndApplySnapshot) {
        const applied = await this.storage.compareAndApplySnapshot(commit);
        if (applied)
          this.notifyWrite([...commit.writes.keys(), ...commit.deletes], commit.source ?? 'sync');
        return applied;
      }
      if (!this.storage.getAllKeys) {
        throw new PersistenceError(
          'write',
          'This storage adapter cannot safely apply a synchronized snapshot'
        );
      }
      const keys = await this.storage.getAllKeys();
      const values = this.storage.multiGet
        ? await this.storage.multiGet(keys)
        : await Promise.all(
            keys.map(async (key) => [key, await this.storage.getItem(key)] as const)
          );
      const actual = new Map(values);
      const actualPrefix = new Map(
        [...actual].flatMap(([key, value]) =>
          key.startsWith(commit.prefix) && value !== null ? [[key, value] as const] : []
        )
      );
      if (!sameStringMap(actualPrefix, commit.expectedPrefix)) return false;
      for (const [key, expected] of commit.compare) {
        if ((actual.get(key) ?? null) !== expected) return false;
      }
      const oldValues = new Map<string, string | null>();
      for (const key of [...commit.writes.keys(), ...commit.deletes]) {
        oldValues.set(key, actual.get(key) ?? null);
      }
      try {
        if (this.storage.multiSet) await this.storage.multiSet([...commit.writes]);
        else for (const [key, value] of commit.writes) await this.storage.setItem(key, value);
        if (this.storage.multiRemove) await this.storage.multiRemove(commit.deletes);
        else for (const key of commit.deletes) await this.storage.removeItem(key);
      } catch (error) {
        for (const [key, value] of oldValues) {
          try {
            if (value === null) await this.storage.removeItem(key);
            else await this.storage.setItem(key, value);
          } catch {
            // Keep the original error; a later startup can retry synchronization.
          }
        }
        throw new PersistenceError(
          'write',
          `Unable to apply synchronized data: ${errorMessage(error)}`,
          undefined,
          error
        );
      }
      this.notifyWrite([...commit.writes.keys(), ...commit.deletes], commit.source ?? 'sync');
      return true;
    });
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
    if (!this.storage.getAllKeys) {
      throw new PersistenceError(
        'read',
        'Unable to enumerate storage keys because this storage adapter does not support key enumeration'
      );
    }
    return this.serializeOperation(async () => {
      try {
        return await this.storage.getAllKeys!();
      } catch (error) {
        throw new PersistenceError(
          'read',
          `Unable to enumerate storage keys: ${errorMessage(error)}`,
          undefined,
          error
        );
      }
    });
  }
}

export function createAsyncStorageDatabase(storage?: AsyncStorageLike): KeyValueDatabase {
  if (storage) return new AsyncStorageDatabase(storage);
  if (typeof indexedDB !== 'undefined') return new AsyncStorageDatabase(new IndexedDbStorage());
  return new AsyncStorageDatabase();
}
