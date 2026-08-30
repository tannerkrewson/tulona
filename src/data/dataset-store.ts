import { z } from 'zod';

import type { DatasetNamespace } from './namespaces';
import type { DatasetCollection } from './keys';
import type { KeyValueDatabase } from './database';
import { PersistenceError } from './errors';

export class DatasetStore {
  constructor(private readonly database: KeyValueDatabase) {}

  async read<T>(
    namespace: DatasetNamespace,
    collection: DatasetCollection,
    schema: z.ZodType<T>,
    suffix?: string
  ): Promise<T | null> {
    const key = namespace.key(collection, suffix);
    const value = await this.database.read(key);
    if (value === null) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      throw new PersistenceError(
        'corruption',
        `Stored value for "${collection}" is not valid JSON`,
        key,
        error
      );
    }
    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw new PersistenceError(
        'validation',
        `Stored value for "${collection}" failed validation: ${result.error.message}`,
        key,
        result.error
      );
    }
    return result.data as T;
  }

  async write<T>(
    namespace: DatasetNamespace,
    collection: DatasetCollection,
    schema: z.ZodType<T>,
    value: T,
    suffix?: string
  ): Promise<void> {
    const key = namespace.key(collection, suffix);
    const result = schema.safeParse(value);
    if (!result.success) {
      throw new PersistenceError(
        'validation',
        `Value for "${collection}" failed validation: ${result.error.message}`,
        key,
        result.error
      );
    }
    let serialized: string;
    try {
      serialized = JSON.stringify(result.data);
    } catch (error) {
      throw new PersistenceError(
        'serialization',
        `Value for "${collection}" could not be serialized`,
        key,
        error
      );
    }
    await this.database.write(key, serialized);
    await this.database.verify(key, serialized);
  }

  async remove(
    namespace: DatasetNamespace,
    collection: DatasetCollection,
    suffix?: string
  ): Promise<void> {
    const key = namespace.key(collection, suffix);
    await this.database.remove(key);
    await this.database.verify(key, null);
  }
}
