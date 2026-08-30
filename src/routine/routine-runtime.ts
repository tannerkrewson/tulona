import { PersistenceError } from '@data';

import { bootCoordinator } from '../orchestration/boot-coordinator';
import type { CatalogService } from '../catalog/catalog-service';
import type { SettingsService } from '../settings/settings-service';
import type { RoutineService } from './routine-service';
import type { RoutineAlarmService } from './routine-alarm';
import type { TrackerService } from '../tracker/tracker-service';
import type { TrackerStore } from '../tracker/tracker-store';
import type { AppSettings } from '@domain';

export interface RoutineRuntime {
  catalogService: CatalogService;
  routineService: RoutineService;
  trackerService: TrackerService;
  settingsService: SettingsService;
  settings: AppSettings;
  routineAlarmService: RoutineAlarmService;
  trackerStore: TrackerStore;
}

/** Builds feature services through the active dataset boundary. */
export async function loadRoutineRuntime(): Promise<RoutineRuntime> {
  const result = await bootCoordinator.hydrate();
  if (!result.runtime) throw new PersistenceError('metadata', 'Create or activate a dataset first');
  return {
    catalogService: result.runtime.services.catalog,
    routineService: result.runtime.services.routine,
    trackerService: result.runtime.services.tracker,
    settingsService: result.runtime.services.settings,
    settings: result.runtime.settings,
    routineAlarmService: result.runtime.services.routineAlarm,
    trackerStore: result.runtime.stores.tracker,
  };
}
