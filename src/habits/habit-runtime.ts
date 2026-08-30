import { PersistenceError } from '@data';

import { bootCoordinator } from '../orchestration/boot-coordinator';
import type { CatalogService } from '../catalog/catalog-service';
import type { SettingsService } from '../settings/settings-service';
import type { HabitService } from './habit-service';
import type { HabitStore } from './habit-store';
import type { HabitReconciliationService } from './reconciliation';
import type { TrackerService } from '../tracker/tracker-service';

export interface HabitRuntime {
  habitService: HabitService;
  catalogService: CatalogService;
  trackerService: TrackerService;
  reconciliationService: HabitReconciliationService;
  settingsService: SettingsService;
}

/** Builds habit services through the active dataset boundary. */
export async function loadHabitRuntime(): Promise<HabitRuntime> {
  const result = await bootCoordinator.hydrate();
  if (!result.runtime) throw new PersistenceError('metadata', 'Create or activate a dataset first');
  const { services } = result.runtime;
  return {
    habitService: services.habits,
    catalogService: services.catalog,
    trackerService: services.tracker,
    reconciliationService: services.reconciliation,
    settingsService: services.settings,
  };
}

export async function loadHabitStore(): Promise<HabitStore> {
  const result = await bootCoordinator.hydrate();
  if (!result.runtime) throw new PersistenceError('metadata', 'Create or activate a dataset first');
  return result.runtime.stores.habits;
}
