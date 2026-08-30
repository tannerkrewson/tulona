import { PersistenceError } from '@data';

import { bootCoordinator } from '../orchestration/boot-coordinator';
import type { SettingsService } from './settings-service';
import type { SettingsStore } from './settings-store';

export interface SettingsRuntime {
  settingsService: SettingsService;
  settingsStore: SettingsStore;
}

export async function loadSettingsRuntime(): Promise<SettingsRuntime> {
  const result = await bootCoordinator.hydrate();
  if (!result.runtime) throw new PersistenceError('metadata', 'Create or activate a dataset first');
  return {
    settingsService: result.runtime.services.settings,
    settingsStore: result.runtime.stores.settings,
  };
}

export async function loadSettingsStore(): Promise<SettingsStore> {
  return (await loadSettingsRuntime()).settingsStore;
}
