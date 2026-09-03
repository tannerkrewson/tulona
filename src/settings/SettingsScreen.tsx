import { Column, Picker, Row, Slider, Switch, Text } from '@expo/ui';
import { useIsFocused, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import type { AppSettings } from '@domain';
import { useAppTheme, useThemePreference } from '@theme';
import { AccessiblePicker, AppButton, errorText, Screen } from '@ui';
import { RecoveryActions } from '../orchestration/RecoveryActions';
import { bootCoordinator } from '../orchestration/boot-coordinator';

import { loadSettingsStore } from './settings-runtime';
import type { SettingsStore } from './settings-store';

function SettingSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const { colors } = useAppTheme();
  return (
    <Column
      spacing={12}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 14,
        borderWidth: 1,
        padding: 16,
        width: '100%',
      }}
    >
      <Column spacing={3}>
        <Text textStyle={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{title}</Text>
        <Text textStyle={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
          {description}
        </Text>
      </Column>
      {children}
    </Column>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <Column spacing={6} style={{ width: '100%' }}>
      <Text textStyle={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{label}</Text>
      {children}
    </Column>
  );
}

function ActionError({ store, onBack }: { store: SettingsStore; onBack: () => void }) {
  const { colors } = useAppTheme();
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

function PrototypeDataReset({ onCleared }: { onCleared: () => void }) {
  const { colors } = useAppTheme();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearData = async () => {
    setBusy(true);
    setError(null);
    try {
      await bootCoordinator.clearAllData();
      onCleared();
    } catch (clearError) {
      setError(errorText(clearError));
      setBusy(false);
    }
  };

  return (
    <Column spacing={10} testID="prototype-data-reset">
      {error ? (
        <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{error}</Text>
      ) : null}
      {confirming ? (
        <Column spacing={8}>
          <Text textStyle={{ color: colors.danger.foreground, fontSize: 14, lineHeight: 20 }}>
            This removes every dataset, routine, activity, habit, setting, and history record from
            this device.
          </Text>
          <AppButton
            disabled={busy}
            label={busy ? 'Clearing...' : 'Yes, clear all local data'}
            onPress={() => void clearData()}
            testID="confirm-clear-local-data"
          />
          <AppButton
            disabled={busy}
            label="Cancel"
            onPress={() => setConfirming(false)}
            variant="outlined"
            testID="cancel-clear-local-data"
          />
        </Column>
      ) : (
        <AppButton
          disabled={busy}
          label="Clear all local data"
          onPress={() => setConfirming(true)}
          variant="outlined"
          testID="clear-local-data"
        />
      )}
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
            <AppButton
              label="Set up this device"
              onPress={() => router.push('/onboarding')}
              testID="open-onboarding"
            />
          ) : null}
          <SettingSection
            description="Use this prototype reset after intentionally breaking a local data schema."
            title="Prototype data"
          >
            <PrototypeDataReset onCleared={() => router.replace('/onboarding')} />
          </SettingSection>
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
  const { colors } = useAppTheme();
  const { setAppearance: setThemeAppearance } = useThemePreference();
  if (!settings) {
    return (
      <Screen title="Settings" description="Preferences are stored on this device.">
        <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>Loading settings...</Text>
      </Screen>
    );
  }

  const run = (action: () => Promise<AppSettings>, onSuccess?: (settings: AppSettings) => void) => {
    if (saving) return;
    void action()
      .then((nextSettings) => onSuccess?.(nextSettings))
      .catch(() => undefined);
  };

  return (
    <Screen
      description="Preferences are stored on this device and applied to new feature queries."
      title="Settings"
    >
      <Column spacing={14} style={{ width: '100%' }}>
        <ActionError onBack={() => router.replace('/(tabs)')} store={store} />
        <SettingSection description="Choose how Tulona looks on this device." title="Appearance">
          <Row alignment="center" spacing={8} style={{ width: '100%' }}>
            {(
              [
                { id: 'system', label: 'System' },
                { id: 'light', label: 'Light' },
                { id: 'dark', label: 'Dark' },
              ] as const
            ).map((option) => (
              <AppButton
                key={option.id}
                disabled={saving}
                label={option.label}
                onPress={() =>
                  run(
                    () => store.getState().setAppearance(option.id),
                    (nextSettings) => setThemeAppearance(nextSettings.appearance)
                  )
                }
                style={{ height: 44, width: '32%' }}
                testID={`settings-appearance-${option.id}`}
                variant={settings.appearance === option.id ? 'filled' : 'outlined'}
              />
            ))}
          </Row>
        </SettingSection>
        <SettingSection
          description="A new logical day starts locally at this hour. Midnight is the default."
          title="Time boundaries"
        >
          <Field label="Logical day starts at">
            <AccessiblePicker
              label="Logical day starts at"
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
            </AccessiblePicker>
          </Field>
          <Field label="Week starts on">
            <AccessiblePicker
              label="Week starts on"
              selectedValue={String(settings.weekStartsOn)}
              onValueChange={(value) => run(() => store.getState().setWeekStartsOn(Number(value)))}
              testID="settings-week-start"
            >
              {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(
                (label, day) => (
                  <Picker.Item key={label} label={label} value={String(day)} />
                )
              )}
            </AccessiblePicker>
          </Field>
        </SettingSection>
        <SettingSection
          description="Stops shorter than this are discarded so accidental taps do not become history."
          title="Short activity filter"
        >
          <Field label="Ignore activities shorter than">
            <AccessiblePicker
              label="Ignore activities shorter than"
              selectedValue={String(settings.minimumActivityDurationMs)}
              onValueChange={(value) =>
                run(() => store.getState().setMinimumActivityDurationMs(Number(value)))
              }
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
            </AccessiblePicker>
          </Field>
        </SettingSection>
        <SettingSection
          description="Foreground sound is best-effort and never schedules background notifications."
          title="Routine alarm"
        >
          <Switch
            disabled={saving}
            label="Alarm"
            onValueChange={(value) => run(() => store.getState().setRoutineAlarmEnabled(value))}
            testID="settings-alarm-enabled"
            value={settings.alarmSettings.enabled}
          />
          <Column spacing={6} style={{ width: '100%' }}>
            <Text textStyle={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
              {`Volume · ${Math.round((settings.alarmSettings.volume ?? 1) * 100)}%`}
            </Text>
            <Slider
              disabled={saving || !settings.alarmSettings.enabled}
              max={1}
              min={0}
              onValueChange={(value) => run(() => store.getState().setRoutineAlarmVolume(value))}
              step={0.25}
              testID="settings-alarm-volume"
              value={settings.alarmSettings.volume ?? 1}
            />
          </Column>
        </SettingSection>
        <SettingSection
          description="Choose what the routine surface should do with a saved active routine."
          title="Routine defaults"
        >
          <Field label="When reopening a routine">
            <AccessiblePicker
              label="When reopening a routine"
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
            </AccessiblePicker>
          </Field>
        </SettingSection>
        <SettingSection
          description="Archived records are retained for history and can be shown in catalog views."
          title="Catalog visibility"
        >
          <Switch
            disabled={saving}
            label="Show archived activities and routines"
            onValueChange={(value) => run(() => store.getState().setShowArchived(value))}
            testID="settings-show-archived"
            value={settings.showArchived}
          />
        </SettingSection>
        <AppButton
          disabled={saving}
          label="Backup & restore"
          onPress={() => router.push('/backup')}
          style={{ height: 52, width: '100%' }}
          testID="open-backup"
        />
        <SettingSection
          description="Use this prototype reset after intentionally breaking a local data schema."
          title="Prototype data"
        >
          <PrototypeDataReset onCleared={() => router.replace('/onboarding')} />
        </SettingSection>
      </Column>
    </Screen>
  );
}
