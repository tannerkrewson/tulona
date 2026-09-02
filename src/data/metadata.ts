import { globalMetadataSchema } from '@domain';
import type { GlobalMetadata, IsoTimestamp } from '@domain';

import type { KeyValueDatabase } from './database';
import { PersistenceError } from './errors';
import { GLOBAL_METADATA_KEY } from './keys';

export const CURRENT_SCHEMA_VERSION = 2;
export const CURRENT_METADATA_VERSION = 1;

export interface MetadataLoadResult {
  metadata: GlobalMetadata;
  status: 'missing' | 'valid' | 'recovered' | 'migration-required';
  error?: PersistenceError;
}

export function defaultGlobalMetadata(
  now: IsoTimestamp = new Date().toISOString()
): GlobalMetadata {
  return {
    metadataVersion: CURRENT_METADATA_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    activeDatasetId: null,
    datasets: [],
    createdAt: now,
    updatedAt: now,
  };
}

function parseMetadata(value: string): GlobalMetadata {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new PersistenceError(
      'corruption',
      'Global metadata is not valid JSON',
      GLOBAL_METADATA_KEY,
      error
    );
  }
  const result = globalMetadataSchema.safeParse(parsed);
  if (!result.success) {
    throw new PersistenceError(
      'validation',
      `Global metadata failed validation: ${result.error.message}`,
      GLOBAL_METADATA_KEY,
      result.error
    );
  }
  return result.data as GlobalMetadata;
}

export class MetadataRepository {
  constructor(private readonly database: KeyValueDatabase) {}

  async load(): Promise<MetadataLoadResult> {
    const value = await this.database.read(GLOBAL_METADATA_KEY);
    if (value === null) return { metadata: defaultGlobalMetadata(), status: 'missing' };
    try {
      const metadata = parseMetadata(value);
      if (metadata.schemaVersion !== CURRENT_SCHEMA_VERSION) {
        return {
          metadata,
          status: 'migration-required',
          error: new PersistenceError(
            'migration',
            `Global metadata requires migration from schema version ${metadata.schemaVersion} to ${CURRENT_SCHEMA_VERSION}`,
            GLOBAL_METADATA_KEY
          ),
        };
      }
      return { metadata, status: 'valid' };
    } catch (error) {
      const persistenceError =
        error instanceof PersistenceError
          ? new PersistenceError(
              'metadata',
              `Global metadata was recovered in memory: ${error.message}`,
              GLOBAL_METADATA_KEY,
              error
            )
          : new PersistenceError(
              'metadata',
              'Global metadata was recovered in memory',
              GLOBAL_METADATA_KEY,
              error
            );
      return { metadata: defaultGlobalMetadata(), status: 'recovered', error: persistenceError };
    }
  }

  async write(metadata: GlobalMetadata): Promise<void> {
    const result = globalMetadataSchema.safeParse(metadata);
    if (!result.success) {
      throw new PersistenceError(
        'validation',
        `Global metadata failed validation: ${result.error.message}`,
        GLOBAL_METADATA_KEY,
        result.error
      );
    }
    let value: string;
    try {
      value = JSON.stringify(result.data);
    } catch (error) {
      throw new PersistenceError(
        'serialization',
        'Global metadata could not be serialized',
        GLOBAL_METADATA_KEY,
        error
      );
    }
    await this.database.write(GLOBAL_METADATA_KEY, value);
    await this.database.verify(GLOBAL_METADATA_KEY, value);
  }
}

export interface SchemaMigrationContext {
  readonly fromVersion: number;
  readonly toVersion: number;
}

export interface SchemaMigration {
  readonly fromVersion: number;
  readonly toVersion: number;
  migrate(value: unknown, context: SchemaMigrationContext): unknown | Promise<unknown>;
}

export interface MigrationPlan {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly migrations: readonly SchemaMigration[];
}

/** Migration-ready registry; migrations are explicit and never inferred. */
export class SchemaMigrationRegistry {
  private readonly migrations = new Map<number, SchemaMigration>();

  register(migration: SchemaMigration): void {
    if (migration.toVersion !== migration.fromVersion + 1) {
      throw new RangeError('Schema migrations must advance exactly one version');
    }
    if (this.migrations.has(migration.fromVersion)) {
      throw new Error(`A migration from version ${migration.fromVersion} is already registered`);
    }
    this.migrations.set(migration.fromVersion, migration);
  }

  plan(fromVersion: number, toVersion: number): MigrationPlan {
    if (!Number.isInteger(fromVersion) || !Number.isInteger(toVersion) || fromVersion > toVersion) {
      throw new RangeError('Migration versions must be ordered integers');
    }
    const migrations: SchemaMigration[] = [];
    for (let version = fromVersion; version < toVersion; version += 1) {
      const migration = this.migrations.get(version);
      if (!migration)
        throw new PersistenceError(
          'migration',
          `No migration registered from schema version ${version}`
        );
      migrations.push(migration);
    }
    return { fromVersion, toVersion, migrations };
  }

  async migrate(value: unknown, fromVersion: number, toVersion: number): Promise<unknown> {
    const plan = this.plan(fromVersion, toVersion);
    let current = value;
    for (const migration of plan.migrations) {
      current = await migration.migrate(current, {
        fromVersion: migration.fromVersion,
        toVersion: migration.toVersion,
      });
    }
    return current;
  }
}
