import {
  createAsyncStorageDatabase,
  createCatalogRepository,
  createDatasetManager,
  createRoutineRepository,
  createSettingsRepository,
  createTrackerRepository,
  PersistenceError,
} from '@data';
import type { AppSettings } from '@domain';

import { createCatalogService, type CatalogService } from '../catalog/catalog-service';
import { createSettingsService, type SettingsService } from '../settings/settings-service';
import { createRoutineService, type RoutineService } from './routine-service';
import { createRoutineAlarmService, type RoutineAlarmService } from './routine-alarm';
import { createTrackerService, type TrackerService } from '../tracker/tracker-service';

const database = createAsyncStorageDatabase();
const datasetManager = createDatasetManager(database);
const foregroundRoutineAlarmService = createRoutineAlarmService();

export interface RoutineRuntime {
  catalogService: CatalogService;
  routineService: RoutineService;
  trackerService: TrackerService;
  settingsService: SettingsService;
  settings: AppSettings;
  routineAlarmService: RoutineAlarmService;
}

/** Builds feature services through the active dataset boundary. */
export async function loadRoutineRuntime(): Promise<RoutineRuntime> {
  const namespace = await datasetManager.active();
  if (!namespace) throw new PersistenceError('metadata', 'Create or activate a dataset first');

  const catalogService = createCatalogService(createCatalogRepository(database, namespace));
  const trackerService = createTrackerService(createTrackerRepository(database, namespace));
  const settingsService = createSettingsService(createSettingsRepository(database, namespace));
  const settings = await settingsService.read();
  const routineService = createRoutineService(
    createRoutineRepository(database, namespace),
    catalogService,
    trackerService
  );
  // Keep the prepared foreground player alive while route loaders recreate runtimes.
  foregroundRoutineAlarmService.setSettings(settings.alarmSettings);
  return {
    catalogService,
    routineService,
    trackerService,
    settingsService,
    settings,
    routineAlarmService: foregroundRoutineAlarmService,
  };
}
