import {
  createAsyncStorageDatabase,
  createCatalogRepository,
  createDatasetManager,
  createHabitRepository,
  createSettingsRepository,
  createTrackerRepository,
  PersistenceError,
} from '@data';

import { createCatalogService, type CatalogService } from '../catalog/catalog-service';
import { createSettingsService, type SettingsService } from '../settings/settings-service';

import { createHabitService, type HabitService } from './habit-service';
import { createHabitStore, type HabitStore } from './habit-store';
import {
  createHabitReconciliationService,
  type HabitReconciliationService,
} from './reconciliation';
import { createTrackerService, type TrackerService } from '../tracker/tracker-service';

const database = createAsyncStorageDatabase();
const datasetManager = createDatasetManager(database);

export interface HabitRuntime {
  habitService: HabitService;
  catalogService: CatalogService;
  trackerService: TrackerService;
  reconciliationService: HabitReconciliationService;
  settingsService: SettingsService;
}

/** Builds habit services through the active dataset boundary. */
export async function loadHabitRuntime(): Promise<HabitRuntime> {
  const namespace = await datasetManager.active();
  if (!namespace) throw new PersistenceError('metadata', 'Create or activate a dataset first');

  const catalogService = createCatalogService(createCatalogRepository(database, namespace));
  const habitRepository = createHabitRepository(database, namespace);
  const habitService = createHabitService(habitRepository, {
    catalog: catalogService,
  });
  const trackerService = createTrackerService(createTrackerRepository(database, namespace));
  const settingsService = createSettingsService(createSettingsRepository(database, namespace));
  const settings = await settingsService.read();
  const reconciliationService = createHabitReconciliationService(
    habitRepository,
    trackerService,
    catalogService,
    {
      rolloverHour: settings.logicalDayRolloverHour,
      weekStartsOn: settings.weekStartsOn,
    }
  );
  return {
    habitService,
    catalogService,
    trackerService,
    reconciliationService,
    settingsService,
  };
}

export async function loadHabitStore(): Promise<HabitStore> {
  const runtime = await loadHabitRuntime();
  const settings = await runtime.settingsService.read();
  const store = createHabitStore(runtime.habitService, {
    catalogService: runtime.catalogService,
    logicalDayRolloverHour: settings.logicalDayRolloverHour,
    weekStartsOn: settings.weekStartsOn,
  });
  await store.getState().hydrate();
  return store;
}
