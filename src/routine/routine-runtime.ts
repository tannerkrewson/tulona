import {
  createAsyncStorageDatabase,
  createCatalogRepository,
  createDatasetManager,
  createRoutineRepository,
  createTrackerRepository,
  PersistenceError,
} from '@data';

import { createCatalogService, type CatalogService } from '../catalog/catalog-service';
import { createRoutineService, type RoutineService } from './routine-service';
import { createTrackerService, type TrackerService } from '../tracker/tracker-service';

const database = createAsyncStorageDatabase();
const datasetManager = createDatasetManager(database);

export interface RoutineRuntime {
  catalogService: CatalogService;
  routineService: RoutineService;
  trackerService: TrackerService;
}

/** Builds feature services through the active dataset boundary. */
export async function loadRoutineRuntime(): Promise<RoutineRuntime> {
  const namespace = await datasetManager.active();
  if (!namespace) throw new PersistenceError('metadata', 'Create or activate a dataset first');

  const catalogService = createCatalogService(createCatalogRepository(database, namespace));
  const trackerService = createTrackerService(createTrackerRepository(database, namespace));
  const routineService = createRoutineService(
    createRoutineRepository(database, namespace),
    catalogService,
    trackerService
  );
  return { catalogService, routineService, trackerService };
}
