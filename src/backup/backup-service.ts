import { createId } from '@domain';

import type { BackupDatasetSnapshot, BackupRepositoryApi } from '@data/backup-repository';
import type { DatasetManager, DatasetNamespace } from '@data';
import type { TrackerRange } from '../tracker/tracker-engine';
import type { ReportingServiceApi } from '../reporting/reporting-service';

import {
  exportBackup,
  exportBackupFromSnapshot,
  serializeBackup,
  type BackupExportOptions,
} from './backup-export';
import { parseBackup, type BackupImportResult, type ParseBackupOptions } from './backup-import';
import {
  DatasetReplacementService,
  type DatasetReplacementOptions,
  type DatasetReplacementResult,
} from './dataset-replacement';
import { intervalsToCsv } from './csv-export';
import type { LifeTrackerBackup } from './backup-schema';

export interface SynchronizationSnapshot {
  backup: LifeTrackerBackup;
  datasetId: string;
  entries: ReadonlyMap<string, string>;
}

export interface BackupServiceOptions extends BackupExportOptions {
  parse?: ParseBackupOptions;
}

export class BackupService {
  private readonly replacement: DatasetReplacementService;

  constructor(
    private readonly repository: BackupRepositoryApi,
    private readonly datasetManager: DatasetManager,
    private readonly database: import('@data').KeyValueDatabase,
    private readonly reporting?: ReportingServiceApi,
    private readonly options: BackupServiceOptions = {}
  ) {
    this.replacement = new DatasetReplacementService(
      database,
      datasetManager,
      repository,
      options.parse
    );
  }

  async export(): Promise<LifeTrackerBackup> {
    const namespace = await this.activeNamespace();
    return exportBackup(this.repository, namespace, this.options);
  }

  async exportJson(): Promise<string> {
    return serializeBackup(await this.export());
  }

  async exportSynchronizationSnapshot(): Promise<SynchronizationSnapshot> {
    const namespace = await this.activeNamespace();
    const read = this.repository.readConsistent
      ? await this.repository.readConsistent(namespace)
      : {
          snapshot: await this.repository.read(namespace),
          entries: this.database.readSnapshot ? await this.database.readSnapshot() : new Map(),
        };
    return {
      backup: exportBackupFromSnapshot(read.snapshot, this.options),
      datasetId: namespace.datasetId,
      entries: read.entries,
    };
  }

  async applySynchronizationProjection(
    input: string | unknown,
    expectedDatasetId: string,
    expectedDatasetEntries: ReadonlyMap<string, string>,
    syncStateKey: string,
    expectedSyncState: string | null,
    nextSyncState: string
  ): Promise<boolean> {
    const imported = parseBackup(input, this.options.parse);
    const namespace = await this.activeNamespace();
    if (namespace.datasetId !== expectedDatasetId) return false;
    if (!this.repository.applySynchronizedSnapshot) {
      await this.repository.write(namespace, snapshotFromBackup(imported.backup));
      await this.database.write(syncStateKey, nextSyncState);
      return true;
    }
    return this.repository.applySynchronizedSnapshot(
      namespace,
      snapshotFromBackup(imported.backup),
      expectedDatasetEntries,
      new Map([[syncStateKey, expectedSyncState]]),
      new Map([[syncStateKey, nextSyncState]])
    );
  }

  inspectImport(input: string | unknown): BackupImportResult {
    return parseBackup(input, this.options.parse);
  }

  replaceCurrentData(
    input: string | unknown,
    options: DatasetReplacementOptions = {}
  ): Promise<DatasetReplacementResult> {
    return this.replacement.replaceCurrentData(input, {
      datasetId: options.datasetId ?? createId(),
      datasetName: options.datasetName,
      operationId: options.operationId,
    });
  }

  async exportCsv(range: TrackerRange = { startMs: 0, endMs: Date.now() }): Promise<string> {
    if (!this.reporting) throw new Error('CSV export requires the reporting service');
    const intervals = await this.reporting.queryIntervals(range, Date.now());
    return intervalsToCsv(intervals);
  }

  recover(): Promise<string[]> {
    return this.replacement.recover();
  }

  private async activeNamespace(): Promise<DatasetNamespace> {
    const namespace = await this.datasetManager.active();
    if (!namespace) throw new Error('Create or activate a dataset before exporting a backup');
    return namespace;
  }
}

function snapshotFromBackup(backup: LifeTrackerBackup): BackupDatasetSnapshot {
  return {
    settings: backup.settings,
    catalog: backup.catalog,
    transitions: backup.transitions,
    routineHistory: backup.routineHistory,
    activeRoutine: backup.activeRoutine,
    habits: backup.habits,
    habitDayStates: backup.habitDayStates,
    goals: backup.goals,
    goalSettings: backup.goalSettings,
    goalWeeks: backup.goalWeeks,
  };
}
