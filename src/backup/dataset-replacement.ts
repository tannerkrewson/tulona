import { createId, isUuid, toTimestamp, type UUID } from '@domain';

import {
  GLOBAL_METADATA_KEY,
  MetadataRepository,
  OperationJournal,
  PersistenceError,
  type DatasetManager,
  type KeyValueDatabase,
  type BackupRepositoryApi,
} from '@data';

import { parseBackup, type BackupImportResult, type ParseBackupOptions } from './backup-import';
import type { LifeTrackerBackup } from './backup-schema';

export interface DatasetReplacementOptions {
  datasetId?: UUID;
  datasetName?: string;
  operationId?: string;
}

export interface DatasetReplacementResult {
  datasetId: UUID;
  previousDatasetId: UUID | null;
  summary: BackupImportResult['summary'];
  recoveredOperationIds: string[];
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Writes a verified namespace before one journaled switch of active metadata. */
export class DatasetReplacementService {
  private readonly metadata: MetadataRepository;
  private readonly journal: OperationJournal;

  constructor(
    database: KeyValueDatabase,
    private readonly datasetManager: DatasetManager,
    private readonly repository: BackupRepositoryApi,
    private readonly parseOptions: ParseBackupOptions = {}
  ) {
    this.metadata = new MetadataRepository(database);
    this.journal = new OperationJournal(database);
  }

  async replaceCurrentData(
    input: string | unknown,
    options: DatasetReplacementOptions = {}
  ): Promise<DatasetReplacementResult> {
    // Parsing and semantic checks happen before any metadata or dataset write.
    const imported = parseBackup(input, this.parseOptions);
    return this.replaceParsed(imported, options);
  }

  async recover(): Promise<string[]> {
    const report = await this.journal.recoverUnfinished();
    if (report.failed.length > 0) {
      throw new PersistenceError(
        'journal',
        `Journal recovery failed: ${report.failed.map(({ id, error }) => `${id}: ${error.message}`).join('; ')}`,
        undefined,
        report.failed
      );
    }
    return report.recovered;
  }

  private async replaceParsed(
    imported: BackupImportResult,
    options: DatasetReplacementOptions
  ): Promise<DatasetReplacementResult> {
    const recoveredOperationIds = await this.recover();
    const metadataResult = await this.metadata.load();
    if (metadataResult.status !== 'valid' && metadataResult.status !== 'missing') {
      throw (
        metadataResult.error ??
        new PersistenceError('metadata', 'Dataset metadata is not safe to replace')
      );
    }
    const previousDatasetId = metadataResult.metadata.activeDatasetId;
    const datasetId = options.datasetId ?? createId();
    if (!isUuid(datasetId))
      throw new PersistenceError('validation', 'Replacement dataset ID is invalid');
    const name =
      options.datasetName?.trim() || `Imported backup ${imported.backup.exportedAt.slice(0, 10)}`;
    if (!name)
      throw new PersistenceError('validation', 'Replacement dataset name must not be empty');

    const existing = metadataResult.metadata.datasets.find((dataset) => dataset.id === datasetId);
    if (existing && metadataResult.metadata.activeDatasetId !== datasetId) {
      // A prior interrupted write can safely resume into its own namespace,
      // but an unrelated existing namespace must not be overwritten.
      if (existing.archivedAt !== null) {
        throw new PersistenceError('conflict', `Replacement dataset "${datasetId}" is archived`);
      }
      throw new PersistenceError('conflict', `Replacement dataset "${datasetId}" already exists`);
    }

    const namespace = this.datasetManager.namespace(datasetId);
    const snapshot = snapshotFromBackup(imported.backup);
    if (existing && metadataResult.metadata.activeDatasetId === datasetId) {
      await this.repository.verify(namespace, snapshot);
      return {
        datasetId,
        previousDatasetId,
        summary: imported.summary,
        recoveredOperationIds,
      };
    }
    await this.repository.write(namespace, snapshot);
    await this.repository.verify(namespace, snapshot);

    const currentMetadataResult = await this.metadata.load();
    if (currentMetadataResult.status !== 'valid' && currentMetadataResult.status !== 'missing') {
      throw (
        currentMetadataResult.error ??
        new PersistenceError('metadata', 'Dataset metadata became unsafe during replacement')
      );
    }
    const currentMetadata = currentMetadataResult.metadata;
    const switchedAt = toTimestamp(Date.now());
    const replacementDataset = {
      id: datasetId,
      name,
      schemaVersion: currentMetadata.schemaVersion,
      createdAt: switchedAt,
      updatedAt: switchedAt,
      archivedAt: null,
    };
    const switchedMetadata = {
      ...currentMetadata,
      activeDatasetId: datasetId,
      datasets: existing
        ? currentMetadata.datasets
        : [...currentMetadata.datasets, replacementDataset],
      updatedAt: switchedAt,
    };
    await this.journal.run({
      id: options.operationId ?? `backup-replace-${datasetId}`,
      datasetId,
      kind: 'backup-dataset-replacement',
      changes: [{ key: GLOBAL_METADATA_KEY, newValue: JSON.stringify(switchedMetadata) }],
    });
    return {
      datasetId,
      previousDatasetId,
      summary: imported.summary,
      recoveredOperationIds,
    };
  }
}

function snapshotFromBackup(backup: LifeTrackerBackup) {
  return {
    settings: backup.settings,
    catalog: backup.catalog,
    transitions: backup.transitions,
    routineHistory: backup.routineHistory,
    activeRoutine: backup.activeRoutine,
    habits: backup.habits,
    habitDayStates: backup.habitDayStates,
  };
}

export function replacementErrorMessage(error: unknown): string {
  return errorText(error);
}
