import {
  createAsyncStorageDatabase,
  createCatalogRepository,
  createDatasetManager,
  createSettingsRepository,
  createTrackerRepository,
  PersistenceError,
} from '@data';

import { createCatalogService, type CatalogService } from '../catalog/catalog-service';
import { createReportingService, type ReportingService } from './reporting-service';
import { createTrackerService, type TrackerService } from '../tracker/tracker-service';

const database = createAsyncStorageDatabase();
const datasetManager = createDatasetManager(database);

export interface ReportingRuntime {
  reportingService: ReportingService;
  catalogService: CatalogService;
  trackerService: TrackerService;
}

export async function loadReportingRuntime(): Promise<ReportingRuntime> {
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
  return { reportingService, catalogService, trackerService };
}
