import { PersistenceError } from '@data';

import type { CatalogService } from '../catalog/catalog-service';
import type { HabitService } from '../habits/habit-service';
import { bootCoordinator } from '../orchestration/boot-coordinator';
import type { SettingsService } from '../settings/settings-service';
import type { TrackerService } from '../tracker/tracker-service';
import type { GoalService } from './goal-service';

export interface GoalsRuntime {
  goalService: GoalService;
  catalogService: CatalogService;
  habitService: HabitService;
  trackerService: TrackerService;
  settingsService: SettingsService;
}

export async function loadGoalsRuntime(): Promise<GoalsRuntime> {
  const result = await bootCoordinator.hydrate();
  if (!result.runtime) throw new PersistenceError('metadata', 'Create or activate a dataset first');
  return {
    goalService: result.runtime.services.goals,
    catalogService: result.runtime.services.catalog,
    habitService: result.runtime.services.habits,
    trackerService: result.runtime.services.tracker,
    settingsService: result.runtime.services.settings,
  };
}
