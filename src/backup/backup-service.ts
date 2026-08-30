import { createId } from '@domain';

import type { BackupRepositoryApi } from '@data/backup-repository';
import type { DatasetManager, DatasetNamespace } from '@data';
import type { TrackerRange } from '../tracker/tracker-engine';
import type { ReportingServiceApi } from '../reporting/reporting-service';

import { exportBackup, serializeBackup, type BackupExportOptions } from './backup-export';
import { parseBackup, type BackupImportResult, type ParseBackupOptions } from './backup-import';
import {
  DatasetReplacementService,
  type DatasetReplacementOptions,
  type DatasetReplacementResult,
} from './dataset-replacement';
import type { LifeTrackerBackup } from './backup-schema';
import { intervalsToCsv } from './csv-export';

export interface BackupServiceOptions extends BackupExportOptions {
  parse?: ParseBackupOptions;
}

export class BackupService {
  private readonly replacement: DatasetReplacementService;

  constructor(
    private readonly repository: BackupRepositoryApi,
    private readonly datasetManager: DatasetManager,
    database: import('@data').KeyValueDatabase,
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
