import { Button, Column, Picker, Text } from '@expo/ui';
import { useIsFocused, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import type { AppSettings } from '@domain';
import { useAppTheme } from '@theme';
import { errorText, Screen } from '@ui';
import { RecoveryActions } from '../orchestration/RecoveryActions';

import { loadSettingsStore } from './settings-runtime';
import type { SettingsStore } from './settings-store';

function SettingSection({
  title,
  description,
  children,
  themeMode,
}: {
  title: string;
  description: string;
  children: ReactNode;
  themeMode?: AppSettings['appearance'];
}) {
  const { colors } = useAppTheme(themeMode);
  return (
    <Column
      spacing={12}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 18,
        borderWidth: 1,
        padding: 18,
        width: '100%',
      }}
    >
      <Column spacing={3}>
        <Text textStyle={{ color: colors.text, fontSize: 19, fontWeight: '700' }}>{title}</Text>
        <Text textStyle={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
          {description}
        </Text>
      </Column>
      {children}
    </Column>
  );
}

function Field({
  label,
  children,
  themeMode,
}: {
  label: string;
  children: ReactNode;
  themeMode?: AppSettings['appearance'];
}) {
  const { colors } = useAppTheme(themeMode);
  return (
    <Column spacing={6} style={{ width: '100%' }}>
      <Text textStyle={{ color: colors.textMuted, fontSize: 14, fontWeight: '600' }}>{label}</Text>
      {children}
    </Column>
  );
}

function ActionError({
  store,
  onBack,
  themeMode,
}: {
  store: SettingsStore;
  onBack: () => void;
  themeMode?: AppSettings['appearance'];
}) {
  const { colors } = useAppTheme(themeMode);
  const error = store((state) => state.persistenceError);
  if (!error) return null;
  return (
    <Column
      spacing={7}
      style={{
        backgroundColor: colors.danger.background,
        borderColor: colors.danger.foreground,
        borderRadius: 14,
        borderWidth: 1,
        padding: 14,
        width: '100%',
      }}
      testID="settings-error"
    >
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 15, fontWeight: '700' }}>
        Settings could not be saved
      </Text>
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{errorText(error)}</Text>
      <RecoveryActions
        disabled={store((state) => state.loading || state.saving)}
        onRetry={() =>
          void store
            .getState()
            .reload()
            .catch(() => undefined)
        }
        onBack={onBack}
        retryTestID="settings-reload"
        testID="settings-recovery"
      />
    </Column>
  );
}

export default function SettingsScreen() {
  const { colors } = useAppTheme();
  const focused = useIsFocused();
  const router = useRouter();
  const [store, setStore] = useState<SettingsStore | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    void loadSettingsStore()
      .then((nextStore) => setStore(() => nextStore))
      .catch((error: unknown) => setLoadError(errorText(error)));
  }, []);

  useEffect(() => {
    if (focused) void Promise.resolve().then(load);
  }, [focused, load]);

  if (!store) {
    const noDataset = loadError?.includes('Create or activate a dataset first') === true;
    return (
      <Screen title="Settings" description="Preferences are stored on this device.">
        <Column spacing={12} style={{ width: '100%' }}>
          <Text
            textStyle={{
              color: loadError ? colors.text : colors.textMuted,
              fontSize: 15,
            }}
          >
            {loadError ?? 'Loading settings...'}
          </Text>
          {loadError ? (
            <RecoveryActions
              onRetry={load}
              onBack={() => router.replace('/(tabs)')}
              retryTestID="settings-retry"
              testID="settings-load-recovery"
            />
          ) : null}
          {noDataset ? (
            <Button
              label="Set up this device"
              onPress={() => router.push('/onboarding')}
              testID="open-onboarding"
            />
          ) : null}
        </Column>
      </Screen>
    );
  }

  return <SettingsContent store={store} router={router} />;
}

function SettingsContent({
  store,
  router,
}: {
  store: SettingsStore;
  router: ReturnType<typeof useRouter>;
}) {
  const settings = store((state) => state.settings);
  const saving = store((state) => state.saving);
  const { colors } = useAppTheme(settings?.appearance);
  if (!settings) {
    return (
      <Screen title="Settings" description="Preferences are stored on this device.">
        <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>Loading settings...</Text>
      </Screen>
    );
  }

  const run = (action: () => Promise<AppSettings>) => {
    if (saving) return;
    void action().catch(() => undefined);
  };

  return (
    <Screen
      description="Preferences are stored on this device and applied to new feature queries."
      themeMode={settings.appearance}
      title="Settings"
    >
      <Column spacing={14} style={{ width: '100%' }}>
        <ActionError
          onBack={() => router.replace('/(tabs)')}
          store={store}
          themeMode={settings.appearance}
        />
        <SettingSection
          description="Choose how Tulona looks on this device."
          themeMode={settings.appearance}
          title="Appearance"
        >
          <Field label="Theme" themeMode={settings.appearance}>
            <Picker
              selectedValue={settings.appearance}
              onValueChange={(value) =>
                run(() =>
                  store.getState().setAppearance(String(value) as AppSettings['appearance'])
                )
              }
              testID="settings-appearance"
            >
              <Picker.Item label="Use device setting" value="system" />
              <Picker.Item label="Light" value="light" />
              <Picker.Item label="Dark" value="dark" />
            </Picker>
          </Field>
        </SettingSection>
        <SettingSection
          description="A new logical day starts locally at this hour. Midnight is the default."
          themeMode={settings.appearance}
          title="Time boundaries"
        >
          <Field label="Logical day starts at" themeMode={settings.appearance}>
            <Picker
              selectedValue={String(settings.logicalDayRolloverHour)}
              onValueChange={(value) =>
                run(() => store.getState().setLogicalDayRolloverHour(Number(value)))
              }
              testID="settings-logical-day"
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <Picker.Item
                  key={hour}
                  label={
                    hour === 0
                      ? '12:00 AM (midnight)'
                      : `${hour % 12 || 12}:00 ${hour < 12 ? 'AM' : 'PM'}`
                  }
                  value={String(hour)}
                />
              ))}
            </Picker>
          </Field>
          <Field label="Week starts on" themeMode={settings.appearance}>
            <Picker
              selectedValue={String(settings.weekStartsOn)}
              onValueChange={(value) => run(() => store.getState().setWeekStartsOn(Number(value)))}
              testID="settings-week-start"
            >
              {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(
                (label, day) => (
                  <Picker.Item key={label} label={label} value={String(day)} />
                )
              )}
            </Picker>
          </Field>
        </SettingSection>
        <SettingSection
          description="Foreground sound is best-effort and never schedules background notifications."
          themeMode={settings.appearance}
          title="Routine alarm"
        >
          <Field label="Alarm" themeMode={settings.appearance}>
            <Picker
              selectedValue={settings.alarmSettings.enabled ? 'enabled' : 'disabled'}
              onValueChange={(value) =>
                run(() => store.getState().setRoutineAlarmEnabled(value === 'enabled'))
              }
              testID="settings-alarm-enabled"
            >
              <Picker.Item label="Disabled" value="disabled" />
              <Picker.Item label="Enabled" value="enabled" />
            </Picker>
          </Field>
          <Field label="Volume" themeMode={settings.appearance}>
            <Picker
              selectedValue={String(settings.alarmSettings.volume ?? 1)}
              onValueChange={(value) =>
                run(() => store.getState().setRoutineAlarmVolume(Number(value)))
              }
              testID="settings-alarm-volume"
            >
              {[0, 0.25, 0.5, 0.75, 1].map((volume) => (
                <Picker.Item
                  key={volume}
                  label={`${Math.round(volume * 100)}%`}
                  value={String(volume)}
                />
              ))}
            </Picker>
          </Field>
        </SettingSection>
        <SettingSection
          description="Choose what the routine surface should do with a saved active routine."
          themeMode={settings.appearance}
          title="Routine defaults"
        >
          <Field label="When reopening a routine" themeMode={settings.appearance}>
            <Picker
              selectedValue={settings.defaultRoutineBehavior}
              onValueChange={(value) =>
                run(() =>
                  store
                    .getState()
                    .setDefaultRoutineBehavior(value as AppSettings['defaultRoutineBehavior'])
                )
              }
              testID="settings-routine-behavior"
            >
              <Picker.Item label="Resume where I left off" value="resume" />
              <Picker.Item label="Restart the current step" value="restart" />
            </Picker>
          </Field>
        </SettingSection>
        <SettingSection
          description="Archived records are retained for history and can be shown in catalog views."
          themeMode={settings.appearance}
          title="Catalog visibility"
        >
          <Field label="Archived activities and routines" themeMode={settings.appearance}>
            <Picker
              selectedValue={settings.showArchived ? 'shown' : 'hidden'}
              onValueChange={(value) =>
                run(() => store.getState().setShowArchived(value === 'shown'))
              }
              testID="settings-show-archived"
            >
              <Picker.Item label="Hide archived" value="hidden" />
              <Picker.Item label="Show archived" value="shown" />
            </Picker>
          </Field>
        </SettingSection>
        <Button
          disabled={saving}
          label="Backup & restore"
          onPress={() => router.push('/backup')}
          testID="open-backup"
        />
      </Column>
    </Screen>
  );
}
