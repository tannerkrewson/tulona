import type { DatasetMetadata, UUID } from '@domain';

import { createId } from '@domain';

import type { KeyValueDatabase } from './database';
import { datasetKey, datasetPrefix, type DatasetCollection } from './keys';
import { PersistenceError } from './errors';
import { defaultGlobalMetadata, MetadataRepository } from './metadata';

export interface DatasetNamespace {
  readonly datasetId: UUID;
  key(collection: DatasetCollection, suffix?: string): string;
}

class Namespace implements DatasetNamespace {
  constructor(readonly datasetId: UUID) {}

  key(collection: DatasetCollection, suffix?: string): string {
    return datasetKey(this.datasetId, collection, suffix);
  }
}

export interface DatasetReadResult {
  metadata: DatasetMetadata;
  active: boolean;
}

function assertWritableMetadata(
  status: 'missing' | 'valid' | 'recovered' | 'migration-required',
  error?: PersistenceError
): void {
  if (status === 'valid' || status === 'missing') return;
  throw error ?? new PersistenceError('metadata', 'Metadata is not safe to mutate');
}

/** Resolves dataset-scoped keys without exposing storage key details to repos. */
export class DatasetManager {
  private readonly metadataRepository: MetadataRepository;

  constructor(private readonly database: KeyValueDatabase) {
    this.metadataRepository = new MetadataRepository(database);
  }

  namespace(datasetId: UUID): DatasetNamespace {
    datasetPrefix(datasetId);
    return new Namespace(datasetId);
  }

  async list(): Promise<DatasetReadResult[]> {
    const result = await this.metadataRepository.load();
    assertWritableMetadata(result.status, result.error);
    return result.metadata.datasets.map((metadata) => ({
      metadata,
      active: metadata.id === result.metadata.activeDatasetId,
    }));
  }

  async loadMetadata() {
    return this.metadataRepository.load();
  }

  async active(): Promise<DatasetNamespace | null> {
    const result = await this.metadataRepository.load();
    assertWritableMetadata(result.status, result.error);
    if (!result.metadata.activeDatasetId) return null;
    const dataset = result.metadata.datasets.find(
      (candidate) => candidate.id === result.metadata.activeDatasetId && !candidate.archivedAt
    );
    if (!dataset)
      throw new PersistenceError(
        'metadata',
        'Active dataset metadata does not resolve to an active dataset'
      );
    return this.namespace(dataset.id);
  }

  async create(name: string, id: UUID = createId()): Promise<DatasetNamespace> {
    if (!name.trim()) throw new TypeError('Dataset name must not be empty');
    const metadataResult = await this.metadataRepository.load();
    assertWritableMetadata(metadataResult.status, metadataResult.error);
    if (metadataResult.metadata.datasets.some((dataset) => dataset.id === id)) {
      throw new PersistenceError('conflict', `Dataset "${id}" already exists`);
    }
    const now = new Date().toISOString();
    const dataset: DatasetMetadata = {
      id,
      name: name.trim(),
      schemaVersion: metadataResult.metadata.schemaVersion,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    const next = {
      ...metadataResult.metadata,
      datasets: [...metadataResult.metadata.datasets, dataset],
      updatedAt: now,
    };
    await this.metadataRepository.write(next);
    return this.namespace(id);
  }

  async activate(datasetId: UUID): Promise<DatasetNamespace> {
    const result = await this.metadataRepository.load();
    assertWritableMetadata(result.status, result.error);
    const dataset = result.metadata.datasets.find(
      (candidate) => candidate.id === datasetId && !candidate.archivedAt
    );
    if (!dataset)
      throw new PersistenceError(
        'metadata',
        `Cannot activate unknown or archived dataset "${datasetId}"`
      );
    const now = new Date().toISOString();
    await this.metadataRepository.write({
      ...result.metadata,
      activeDatasetId: datasetId,
      updatedAt: now,
    });
    return this.namespace(datasetId);
  }

  async archive(datasetId: UUID): Promise<void> {
    const result = await this.metadataRepository.load();
    assertWritableMetadata(result.status, result.error);
    const dataset = result.metadata.datasets.find((candidate) => candidate.id === datasetId);
    if (!dataset)
      throw new PersistenceError('metadata', `Cannot archive unknown dataset "${datasetId}"`);
    const now = new Date().toISOString();
    await this.metadataRepository.write({
      ...result.metadata,
      activeDatasetId:
        result.metadata.activeDatasetId === datasetId ? null : result.metadata.activeDatasetId,
      datasets: result.metadata.datasets.map((candidate) =>
        candidate.id === datasetId ? { ...candidate, archivedAt: now, updatedAt: now } : candidate
      ),
      updatedAt: now,
    });
  }

  async metadata(): Promise<ReturnType<typeof defaultGlobalMetadata>> {
    const result = await this.metadataRepository.load();
    assertWritableMetadata(result.status, result.error);
    return result.metadata;
  }

  /** Prototype-only escape hatch for clearing data after an intentional schema break. */
  async clearAll(): Promise<void> {
    if (!this.database.keys) {
      throw new PersistenceError(
        'read',
        'Unable to clear local data because storage key enumeration is unavailable'
      );
    }
    const keys = await this.database.keys();
    if (keys.length > 0) await this.database.multiRemove(keys);
  }
}

export function createDatasetManager(database: KeyValueDatabase): DatasetManager {
  return new DatasetManager(database);
}
