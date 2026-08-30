import {
  createAsyncStorageDatabase,
  createCatalogRepository,
  createDatasetManager,
  createHabitRepository,
  PersistenceError,
} from '@data';

import { createCatalogService, type CatalogService } from '../catalog/catalog-service';

import { createHabitService, type HabitService } from './habit-service';
import { createHabitStore, type HabitStore } from './habit-store';

const database = createAsyncStorageDatabase();
const datasetManager = createDatasetManager(database);

export interface HabitRuntime {
  habitService: HabitService;
  catalogService: CatalogService;
}

/** Builds habit services through the active dataset boundary. */
export async function loadHabitRuntime(): Promise<HabitRuntime> {
  const namespace = await datasetManager.active();
  if (!namespace) throw new PersistenceError('metadata', 'Create or activate a dataset first');

  const catalogService = createCatalogService(createCatalogRepository(database, namespace));
  const habitService = createHabitService(createHabitRepository(database, namespace), {
    catalog: catalogService,
  });
  return { habitService, catalogService };
}

export async function loadHabitStore(): Promise<HabitStore> {
  const runtime = await loadHabitRuntime();
  const store = createHabitStore(runtime.habitService, { catalogService: runtime.catalogService });
  await store.getState().hydrate();
  return store;
}
