import { Picker } from '@expo/ui';
import { Column, Text } from '@ui/primitives';
import { useIsFocused, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import type { AppSettings } from '@domain';
import { useAppTheme, useThemePreference } from '@theme';
import { AppIcon } from '@icons';
import {
  AppSlider,
  errorText,
  Form,
  FormContent,
  FormPickerRow,
  FormRow,
  FormSection,
  FormSwitchRow,
  Screen,
} from '@ui';
import { RecoveryActions } from '../orchestration/RecoveryActions';
import { goBackInAppStack } from '../navigation/app-back';
import BackupScreen from '../backup/BackupScreen';

import { getSettingsCategory, type SettingsCategory } from './settings-categories';
import GoalsSettingsPanel from './GoalsSettingsPanel';
import { PrototypeDataReset, SettingsActionError } from './SettingsFeedback';
import { loadSettingsStore } from './settings-runtime';
import type { SettingsStore } from './settings-store';

type CategoryContentProps = {
  category: SettingsCategory;
  goBack: () => void;
  router: ReturnType<typeof useRouter>;
  store: SettingsStore;
};

function CategoryControls({ category, store }: Pick<CategoryContentProps, 'category' | 'store'>) {
  const settings = store((state) => state.settings);
  const saving = store((state) => state.saving);
  const { colors } = useAppTheme();
  const { setAppearance: setThemeAppearance } = useThemePreference();

  if (!settings) {
    return <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>Loading settings...</Text>;
  }

  const run = (action: () => Promise<AppSettings>, onSuccess?: (next: AppSettings) => void) => {
    if (saving) return;
    void action()
      .then((nextSettings) => onSuccess?.(nextSettings))
      .catch(() => undefined);
  };

  const hourLabel = (hour: number) =>
    hour === 0 ? 'Midnight' : `${hour % 12 || 12}:00 ${hour < 12 ? 'AM' : 'PM'}`;

  switch (category.id) {
    case 'appearance':
      return (
        <Form>
          <FormSection>
            {(
              [
                { id: 'system', label: 'Automatic', icon: 'settings' },
                { id: 'light', label: 'Light', icon: 'sun' },
                { id: 'dark', label: 'Dark', icon: 'moon' },
              ] as const
            ).map((option) => (
              <FormRow
                accessibilityLabel={`${option.label}${settings.appearance === option.id ? ', selected' : ''}`}
                disabled={saving}
                icon={option.icon}
                key={option.id}
                kind="action"
                label={option.label}
                onPress={() =>
                  run(
                    () => store.getState().setAppearance(option.id),
                    (nextSettings) => setThemeAppearance(nextSettings.appearance)
                  )
                }
                testID={`settings-appearance-${option.id}`}
                trailing={
                  settings.appearance === option.id ? (
                    <AppIcon color={colors.primary} name="check" size={20} strokeWidth={2.6} />
                  ) : undefined
                }
              />
            ))}
          </FormSection>
        </Form>
      );
    case 'time-and-activity':
      return (
        <Form>
          <FormSection
            footer={`Time before ${hourLabel(settings.logicalDayRolloverHour).toLowerCase()} counts toward the previous day.`}
          >
            <FormPickerRow
              label="Day starts at"
              onValueChange={(value) =>
                run(() => store.getState().setLogicalDayRolloverHour(Number(value)))
              }
              selectedValue={String(settings.logicalDayRolloverHour)}
              testID="settings-logical-day"
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <Picker.Item key={hour} label={hourLabel(hour)} value={String(hour)} />
              ))}
            </FormPickerRow>
            <FormPickerRow
              label="Week starts on"
              onValueChange={(value) => run(() => store.getState().setWeekStartsOn(Number(value)))}
              selectedValue={String(settings.weekStartsOn)}
              testID="settings-week-start"
            >
              {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(
                (label, day) => (
                  <Picker.Item key={label} label={label} value={String(day)} />
                )
              )}
            </FormPickerRow>
          </FormSection>
          <FormSection footer="Stopping an activity sooner than this discards it, so quick mis-taps don't end up in your history.">
            <FormPickerRow
              label="Ignore shorter than"
              onValueChange={(value) =>
                run(() => store.getState().setMinimumActivityDurationMs(Number(value)))
              }
              selectedValue={String(settings.minimumActivityDurationMs)}
              testID="settings-minimum-activity-duration"
            >
              <Picker.Item label="Off" value="0" />
              <Picker.Item label="5 seconds" value="5000" />
              <Picker.Item label="10 seconds" value="10000" />
              <Picker.Item label="15 seconds" value="15000" />
              <Picker.Item label="30 seconds" value="30000" />
              <Picker.Item label="1 minute" value="60000" />
              <Picker.Item label="2 minutes" value="120000" />
              <Picker.Item label="5 minutes" value="300000" />
            </FormPickerRow>
          </FormSection>
        </Form>
      );
    case 'routines':
      return (
        <Form>
          <FormSection
            footer="Plays when a step's time is up while Tulona is open. It doesn't send notifications."
            title="Step Alarm"
          >
            <FormSwitchRow
              disabled={saving}
              label="Sound"
              onValueChange={(value) => run(() => store.getState().setRoutineAlarmEnabled(value))}
              testID="settings-alarm-enabled"
              value={settings.alarmSettings.enabled}
            />
            <FormContent>
              <Column spacing={6} style={{ width: '100%' }}>
                <Text
                  textStyle={{
                    color: settings.alarmSettings.enabled ? colors.text : colors.textMuted,
                    fontSize: 17,
                  }}
                >
                  {`Volume · ${Math.round((settings.alarmSettings.volume ?? 1) * 100)}%`}
                </Text>
                <AppSlider
                  disabled={saving || !settings.alarmSettings.enabled}
                  max={1}
                  min={0}
                  onValueChange={(value) =>
                    run(() => store.getState().setRoutineAlarmVolume(value))
                  }
                  step={0.25}
                  testID="settings-alarm-volume"
                  value={settings.alarmSettings.volume ?? 1}
                />
              </Column>
            </FormContent>
          </FormSection>
          <FormSection
            footer={
              settings.defaultRoutineBehavior === 'resume'
                ? 'An interrupted routine picks up where you left off.'
                : 'An interrupted routine restarts its current step from the beginning.'
            }
          >
            <FormPickerRow
              label="When reopened"
              onValueChange={(value) =>
                run(() =>
                  store
                    .getState()
                    .setDefaultRoutineBehavior(value as AppSettings['defaultRoutineBehavior'])
                )
              }
              selectedValue={settings.defaultRoutineBehavior}
              testID="settings-routine-behavior"
            >
              <Picker.Item label="Resume" value="resume" />
              <Picker.Item label="Restart step" value="restart" />
            </FormPickerRow>
          </FormSection>
        </Form>
      );
    case 'goals':
      return <GoalsSettingsPanel />;
    default:
      return null;
  }
}

function SettingsCategoryContent({ category, goBack, router, store }: CategoryContentProps) {
  if (category.id === 'data') {
    return (
      <BackupScreen
        footer={
          <>
            <SettingsActionError onBack={goBack} store={store} />
            <PrototypeDataReset onCleared={() => router.replace('/')} />
          </>
        }
        onBack={goBack}
        title="Data"
      />
    );
  }

  return (
    <Screen onBack={goBack} title={category.title}>
      <Column spacing={16} style={{ width: '100%' }}>
        <SettingsActionError onBack={goBack} store={store} />
        <CategoryControls category={category} store={store} />
      </Column>
    </Screen>
  );
}

export default function SettingsCategoryScreen({
  categoryId,
  returnFromDropbox,
}: {
  categoryId: string | string[] | undefined;
  returnFromDropbox?: string | string[];
}) {
  const { colors } = useAppTheme();
  const focused = useIsFocused();
  const router = useRouter();
  const isDropboxReturn = Array.isArray(returnFromDropbox)
    ? returnFromDropbox[0]
    : returnFromDropbox;
  const goBack = () =>
    isDropboxReturn === '1' ? router.replace('/settings') : goBackInAppStack(router, '/settings');
  const category = getSettingsCategory(categoryId);
  const [store, setStore] = useState<SettingsStore | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    void loadSettingsStore()
      .then((nextStore) => setStore(() => nextStore))
      .catch((error: unknown) => setLoadError(errorText(error)));
  }, []);

  useEffect(() => {
    if (focused && category) void Promise.resolve().then(load);
  }, [category, focused, load]);

  if (!category) {
    return (
      <Screen onBack={goBack} title="Settings">
        <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>
          Settings category not found.
        </Text>
      </Screen>
    );
  }

  if (!store) {
    return (
      <Screen onBack={goBack} title={category.title}>
        <Column spacing={12} style={{ width: '100%' }}>
          <Text textStyle={{ color: loadError ? colors.text : colors.textMuted, fontSize: 15 }}>
            {loadError ?? 'Loading settings...'}
          </Text>
          {loadError ? (
            <RecoveryActions
              onRetry={load}
              onClose={goBack}
              retryTestID="settings-retry"
              testID="settings-load-recovery"
            />
          ) : null}
          {category.id === 'data' ? (
            <PrototypeDataReset onCleared={() => router.replace('/')} />
          ) : null}
        </Column>
      </Screen>
    );
  }

  return (
    <SettingsCategoryContent category={category} goBack={goBack} router={router} store={store} />
  );
}
