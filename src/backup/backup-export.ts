import { toTimestamp } from '@domain';

import type { BackupRepositoryApi } from '@data/backup-repository';
import type { DatasetNamespace } from '@data/namespaces';

import {
  BACKUP_FORMAT,
  backupSchema,
  CURRENT_BACKUP_SCHEMA_VERSION,
  CURRENT_BACKUP_VERSION,
} from './backup-schema';
import type { LifeTrackerBackup } from './backup-schema';

export interface BackupExportOptions {
  appVersion?: string;
  exportedAt?: string;
}

export async function exportBackup(
  repository: BackupRepositoryApi,
  namespace: DatasetNamespace,
  options: BackupExportOptions = {}
): Promise<LifeTrackerBackup> {
  const snapshot = await repository.read(namespace);
  const backup = {
    format: BACKUP_FORMAT,
    backupVersion: CURRENT_BACKUP_VERSION,
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    exportedAt: toTimestamp(options.exportedAt ?? Date.now()),
    appVersion: options.appVersion ?? '0.1.0',
    settings: snapshot.settings,
    catalog: snapshot.catalog,
    routineDefinitions: snapshot.catalog.routines,
    transitions: snapshot.transitions,
    routineHistory: snapshot.routineHistory,
    activeRoutine: snapshot.activeRoutine,
    habits: snapshot.habits,
    habitDayStates: snapshot.habitDayStates,
  };
  const result = backupSchema.safeParse(backup);
  if (!result.success) {
    throw new Error(`Cannot export invalid dataset: ${result.error.message}`);
  }
  return result.data as LifeTrackerBackup;
}

export function serializeBackup(backup: LifeTrackerBackup): string {
  const result = backupSchema.safeParse(backup);
  if (!result.success) throw new Error(`Cannot serialize invalid backup: ${result.error.message}`);
  return `${JSON.stringify(result.data, null, 2)}\n`;
}

export class BackupExporter {
  constructor(
    private readonly repository: BackupRepositoryApi,
    private readonly options: BackupExportOptions = {}
  ) {}

  export(namespace: DatasetNamespace): Promise<LifeTrackerBackup> {
    return exportBackup(this.repository, namespace, this.options);
  }

  async exportJson(namespace: DatasetNamespace): Promise<string> {
    return serializeBackup(await this.export(namespace));
  }
}
