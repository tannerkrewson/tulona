import {
  createAsyncStorageDatabase,
  createDatasetManager,
  createSettingsRepository,
  PersistenceError,
} from '@data';

import { createSettingsService, type SettingsService } from './settings-service';
import { createSettingsStore, type SettingsStore } from './settings-store';

const database = createAsyncStorageDatabase();
const datasetManager = createDatasetManager(database);

export interface SettingsRuntime {
  settingsService: SettingsService;
  settingsStore: SettingsStore;
}

export async function loadSettingsRuntime(): Promise<SettingsRuntime> {
  const namespace = await datasetManager.active();
  if (!namespace) throw new PersistenceError('metadata', 'Create or activate a dataset first');
  const settingsService = createSettingsService(createSettingsRepository(database, namespace));
  const settingsStore = createSettingsStore(settingsService);
  await settingsStore.getState().hydrate();
  return { settingsService, settingsStore };
}

export async function loadSettingsStore(): Promise<SettingsStore> {
  return (await loadSettingsRuntime()).settingsStore;
}
