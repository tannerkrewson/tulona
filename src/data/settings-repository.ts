import { appSettingsSchema } from '@domain';
import type { AppSettings } from '@domain';

import type { KeyValueDatabase } from './database';
import { DatasetStore } from './dataset-store';
import { PersistenceError } from './errors';
import type { DatasetNamespace } from './namespaces';

export interface SettingsRepositoryApi {
  read(): Promise<AppSettings>;
  readWithRecovery(): Promise<SettingsReadResult>;
  write(settings: AppSettings): Promise<void>;
}

export interface SettingsReadResult {
  settings: AppSettings;
  status: 'missing' | 'valid' | 'recovered';
  error?: PersistenceError;
}

export const DEFAULT_SETTINGS: AppSettings = {
  settingsVersion: 1,
  logicalDayRolloverHour: 0,
  appearance: 'system',
  weekStartsOn: 0,
  alarmSettings: {
    enabled: false,
    leadTimeMs: 0,
    sound: true,
    vibration: true,
    volume: 1,
  },
  defaultRoutineBehavior: 'resume',
  showArchived: false,
};

export class SettingsRepository implements SettingsRepositoryApi {
  private readonly store: DatasetStore;

  constructor(
    database: KeyValueDatabase,
    private readonly namespace: DatasetNamespace
  ) {
    this.store = new DatasetStore(database);
  }

  async read(): Promise<AppSettings> {
    const value = await this.store.read(this.namespace, 'settings', appSettingsSchema);
    return value ?? { ...DEFAULT_SETTINGS, alarmSettings: { ...DEFAULT_SETTINGS.alarmSettings } };
  }

  async readWithRecovery(): Promise<SettingsReadResult> {
    try {
      const value = await this.store.read(this.namespace, 'settings', appSettingsSchema);
      if (!value) return { settings: await this.read(), status: 'missing' };
      return { settings: value, status: 'valid' };
    } catch (error) {
      const persistenceError =
        error instanceof PersistenceError
          ? new PersistenceError(
              error.category,
              `Settings were recovered in memory: ${error.message}`,
              error.key,
              error
            )
          : new PersistenceError('metadata', 'Settings were recovered in memory', undefined, error);
      return {
        settings: { ...DEFAULT_SETTINGS, alarmSettings: { ...DEFAULT_SETTINGS.alarmSettings } },
        status: 'recovered',
        error: persistenceError,
      };
    }
  }

  async write(settings: AppSettings): Promise<void> {
    await this.store.write(this.namespace, 'settings', appSettingsSchema, settings);
  }
}

export function createSettingsRepository(
  database: KeyValueDatabase,
  namespace: DatasetNamespace
): SettingsRepository {
  return new SettingsRepository(database, namespace);
}
