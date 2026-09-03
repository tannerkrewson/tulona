import { appSettingsSchema, type AlarmSettings, type AppSettings, type Appearance } from '@domain';

import type { SettingsRepositoryApi } from '../data/settings-repository';
import { DEFAULT_SETTINGS } from '../data/settings-repository';
import { PersistenceError } from '../data/errors';

export type SettingsPatch = Partial<
  Pick<
    AppSettings,
    | 'logicalDayRolloverHour'
    | 'appearance'
    | 'weekStartsOn'
    | 'minimumActivityDurationMs'
    | 'defaultRoutineBehavior'
    | 'showArchived'
  >
> & {
  alarmSettings?: Partial<AlarmSettings>;
};

export interface SettingsServiceApi {
  read(): Promise<AppSettings>;
  get(): Promise<AppSettings>;
  update(patch: SettingsPatch): Promise<AppSettings>;
  updateSettings(patch: SettingsPatch): Promise<AppSettings>;
  setAppearance(appearance: Appearance): Promise<AppSettings>;
  setLogicalDayRolloverHour(hour: number): Promise<AppSettings>;
  setLogicalDayRollover(hour: number): Promise<AppSettings>;
  setWeekStartsOn(weekStartsOn: number): Promise<AppSettings>;
  setMinimumActivityDurationMs(durationMs: number): Promise<AppSettings>;
  setRoutineAlarmEnabled(enabled: boolean): Promise<AppSettings>;
  setRoutineAlarmVolume(volume: number): Promise<AppSettings>;
  setDefaultRoutineBehavior(behavior: AppSettings['defaultRoutineBehavior']): Promise<AppSettings>;
  setShowArchived(showArchived: boolean): Promise<AppSettings>;
}

export interface SettingsServiceOptions {
  onUpdated?: (settings: AppSettings) => void;
}

function copySettings(settings: AppSettings): AppSettings {
  return { ...settings, alarmSettings: { ...settings.alarmSettings } };
}

function validation(message: string, cause?: unknown): never {
  throw new PersistenceError('validation', message, undefined, cause);
}

function validateSettings(value: unknown): AppSettings {
  const result = appSettingsSchema.safeParse(value);
  if (!result.success) {
    validation(`Settings failed validation: ${result.error.message}`, result.error);
  }
  return copySettings(result.data as AppSettings);
}

function validateBoolean(value: boolean, label: string): boolean {
  if (typeof value !== 'boolean') validation(`${label} must be a boolean`);
  return value;
}

function validateNumber(value: number, label: string, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    validation(`${label} must be an integer from ${min} through ${max}`);
  }
  return value;
}

function validateVolume(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    validation('Routine alarm volume must be between 0 and 1');
  }
  return value;
}

function validateAppearance(value: Appearance): Appearance {
  if (value !== 'system' && value !== 'light' && value !== 'dark') {
    validation(`Unknown appearance "${String(value)}"`);
  }
  return value;
}

function validateBehavior(
  value: AppSettings['defaultRoutineBehavior']
): AppSettings['defaultRoutineBehavior'] {
  if (value !== 'resume' && value !== 'restart') {
    validation(`Unknown default routine behavior "${String(value)}"`);
  }
  return value;
}

function applyPatch(current: AppSettings, patch: SettingsPatch): AppSettings {
  const next: AppSettings = {
    ...current,
    ...(patch.appearance === undefined ? {} : { appearance: validateAppearance(patch.appearance) }),
    ...(patch.logicalDayRolloverHour === undefined
      ? {}
      : {
          logicalDayRolloverHour: validateNumber(
            patch.logicalDayRolloverHour,
            'Logical-day rollover hour',
            0,
            23
          ),
        }),
    ...(patch.weekStartsOn === undefined
      ? {}
      : { weekStartsOn: validateNumber(patch.weekStartsOn, 'Week start', 0, 6) }),
    ...(patch.minimumActivityDurationMs === undefined
      ? {}
      : {
          minimumActivityDurationMs: validateNumber(
            patch.minimumActivityDurationMs,
            'Minimum activity duration',
            0,
            Number.MAX_SAFE_INTEGER
          ),
        }),
    ...(patch.defaultRoutineBehavior === undefined
      ? {}
      : { defaultRoutineBehavior: validateBehavior(patch.defaultRoutineBehavior) }),
    ...(patch.showArchived === undefined
      ? {}
      : { showArchived: validateBoolean(patch.showArchived, 'Archived visibility') }),
    alarmSettings: {
      ...current.alarmSettings,
      ...(patch.alarmSettings?.enabled === undefined
        ? {}
        : { enabled: validateBoolean(patch.alarmSettings.enabled, 'Alarm enabled') }),
      ...(patch.alarmSettings?.leadTimeMs === undefined
        ? {}
        : {
            leadTimeMs: validateNumber(
              patch.alarmSettings.leadTimeMs,
              'Alarm lead time',
              0,
              Number.MAX_SAFE_INTEGER
            ),
          }),
      ...(patch.alarmSettings?.sound === undefined
        ? {}
        : { sound: validateBoolean(patch.alarmSettings.sound, 'Alarm sound') }),
      ...(patch.alarmSettings?.vibration === undefined
        ? {}
        : { vibration: validateBoolean(patch.alarmSettings.vibration, 'Alarm vibration') }),
      ...(patch.alarmSettings?.volume === undefined
        ? {}
        : { volume: validateVolume(patch.alarmSettings.volume) }),
    },
  };
  return validateSettings(next);
}

/** Validated application actions over the dataset-scoped settings repository. */
export class SettingsService implements SettingsServiceApi {
  constructor(
    private readonly repository: SettingsRepositoryApi,
    private readonly options: SettingsServiceOptions = {}
  ) {}

  async read(): Promise<AppSettings> {
    const settings = await this.repository.read();
    return validateSettings(settings);
  }

  async get(): Promise<AppSettings> {
    return this.read();
  }

  async update(patch: SettingsPatch): Promise<AppSettings> {
    const current = await this.read();
    const next = applyPatch(current, patch);
    await this.repository.write(next);
    // The validated value is safe to publish once the repository write succeeds.
    this.options.onUpdated?.(next);
    return this.read();
  }

  async updateSettings(patch: SettingsPatch): Promise<AppSettings> {
    return this.update(patch);
  }

  async setAppearance(appearance: Appearance): Promise<AppSettings> {
    return this.update({ appearance });
  }

  async setLogicalDayRolloverHour(hour: number): Promise<AppSettings> {
    return this.update({ logicalDayRolloverHour: hour });
  }

  async setLogicalDayRollover(hour: number): Promise<AppSettings> {
    return this.setLogicalDayRolloverHour(hour);
  }

  async setWeekStartsOn(weekStartsOn: number): Promise<AppSettings> {
    return this.update({ weekStartsOn });
  }

  async setMinimumActivityDurationMs(durationMs: number): Promise<AppSettings> {
    return this.update({ minimumActivityDurationMs: durationMs });
  }

  async setRoutineAlarmEnabled(enabled: boolean): Promise<AppSettings> {
    return this.update({ alarmSettings: { enabled } });
  }

  async setRoutineAlarmVolume(volume: number): Promise<AppSettings> {
    return this.update({ alarmSettings: { volume } });
  }

  async setDefaultRoutineBehavior(
    behavior: AppSettings['defaultRoutineBehavior']
  ): Promise<AppSettings> {
    return this.update({ defaultRoutineBehavior: behavior });
  }

  async setShowArchived(showArchived: boolean): Promise<AppSettings> {
    return this.update({ showArchived });
  }
}

export function createSettingsService(
  repository: SettingsRepositoryApi,
  options?: SettingsServiceOptions
): SettingsService {
  return new SettingsService(repository, options);
}

export { DEFAULT_SETTINGS };
