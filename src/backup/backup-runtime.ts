import {
  BackupRepository,
  createAsyncStorageDatabase,
  createCatalogRepository,
  createDatasetManager,
  createSettingsRepository,
  createTrackerRepository,
  PersistenceError,
} from '@data';

import { createCatalogService } from '../catalog/catalog-service';
import { createReportingService, type ReportingService } from '../reporting/reporting-service';
import { createTrackerService } from '../tracker/tracker-service';
import { BackupService } from './backup-service';

const database = createAsyncStorageDatabase();
const datasetManager = createDatasetManager(database);

export interface BackupRuntime {
  backupService: BackupService;
  reportingService: ReportingService;
}

export async function loadBackupRuntime(): Promise<BackupRuntime> {
  const namespace = await datasetManager.active();
  if (!namespace) throw new PersistenceError('metadata', 'Create or activate a dataset first');
  const catalogService = createCatalogService(createCatalogRepository(database, namespace));
  const trackerService = createTrackerService(createTrackerRepository(database, namespace));
  const settingsRepository = createSettingsRepository(database, namespace);
  const reportingService = createReportingService({
    tracker: trackerService,
    catalog: catalogService,
    settings: settingsRepository,
  });
  const backupService = new BackupService(
    new BackupRepository(database),
    datasetManager,
    database,
    reportingService
  );
  return { backupService, reportingService };
}
