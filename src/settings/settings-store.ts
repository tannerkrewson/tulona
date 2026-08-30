import { create } from 'zustand';

import type { AppSettings, Appearance } from '@domain';
import { PersistenceError } from '../data/errors';

import type { SettingsPatch, SettingsServiceApi } from './settings-service';

export interface SettingsStoreState {
  settings: AppSettings | null;
  loading: boolean;
  saving: boolean;
  persistenceError: PersistenceError | null;
  hydrate(): Promise<void>;
  reload(): Promise<void>;
  update(patch: SettingsPatch): Promise<AppSettings>;
  updateSettings(patch: SettingsPatch): Promise<AppSettings>;
  setAppearance(appearance: Appearance): Promise<AppSettings>;
  setLogicalDayRolloverHour(hour: number): Promise<AppSettings>;
  setWeekStartsOn(weekStartsOn: number): Promise<AppSettings>;
  setRoutineAlarmEnabled(enabled: boolean): Promise<AppSettings>;
  setRoutineAlarmVolume(volume: number): Promise<AppSettings>;
  setDefaultRoutineBehavior(behavior: AppSettings['defaultRoutineBehavior']): Promise<AppSettings>;
  setShowArchived(showArchived: boolean): Promise<AppSettings>;
}

function errorFrom(error: unknown): PersistenceError {
  return error instanceof PersistenceError
    ? error
    : new PersistenceError(
        'write',
        error instanceof Error ? error.message : String(error),
        undefined,
        error
      );
}

/** Feature state only; settings writes remain owned by SettingsService. */
export function createSettingsStore(service: SettingsServiceApi) {
  return create<SettingsStoreState>((set) => {
    const reload = async () => {
      set({ loading: true, persistenceError: null });
      try {
        const settings = await service.read();
        set({ settings, loading: false });
      } catch (error) {
        set({ loading: false, persistenceError: errorFrom(error) });
        throw error;
      }
    };

    const runMutation = async (mutation: () => Promise<AppSettings>): Promise<AppSettings> => {
      set({ saving: true, persistenceError: null });
      try {
        const result = await mutation();
        await reload();
        return result;
      } catch (error) {
        set({ persistenceError: errorFrom(error) });
        throw error;
      } finally {
        set({ saving: false });
      }
    };

    return {
      settings: null,
      loading: false,
      saving: false,
      persistenceError: null,
      hydrate: reload,
      reload,
      update: (patch) => runMutation(() => service.update(patch)),
      updateSettings: (patch) => runMutation(() => service.updateSettings(patch)),
      setAppearance: (appearance) => runMutation(() => service.setAppearance(appearance)),
      setLogicalDayRolloverHour: (hour) =>
        runMutation(() => service.setLogicalDayRolloverHour(hour)),
      setWeekStartsOn: (weekStartsOn) => runMutation(() => service.setWeekStartsOn(weekStartsOn)),
      setRoutineAlarmEnabled: (enabled) =>
        runMutation(() => service.setRoutineAlarmEnabled(enabled)),
      setRoutineAlarmVolume: (volume) => runMutation(() => service.setRoutineAlarmVolume(volume)),
      setDefaultRoutineBehavior: (behavior) =>
        runMutation(() => service.setDefaultRoutineBehavior(behavior)),
      setShowArchived: (showArchived) => runMutation(() => service.setShowArchived(showArchived)),
    };
  });
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;
