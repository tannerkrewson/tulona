import { Column, Picker, Row, Slider, Switch, Text } from '@expo/ui';
import { useIsFocused, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import type { AppSettings } from '@domain';
import { useAppTheme, useThemePreference } from '@theme';
import { AccessiblePicker, AppButton, errorText, Screen } from '@ui';
import { RecoveryActions } from '../orchestration/RecoveryActions';

import { getSettingsCategory, type SettingsCategory } from './settings-categories';
import { PrototypeDataReset, SettingsActionError } from './SettingsFeedback';
import { loadSettingsStore } from './settings-runtime';
import type { SettingsStore } from './settings-store';

function Field({ label, children }: { label: string; children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <Column spacing={6} style={{ width: '100%' }}>
      <Text textStyle={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{label}</Text>
      {children}
    </Column>
  );
}

type CategoryContentProps = {
  category: SettingsCategory;
  router: ReturnType<typeof useRouter>;
  store: SettingsStore;
};

function CategoryControls({ category, router, store }: CategoryContentProps) {
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

  switch (category.id) {
    case 'appearance':
      return (
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
      );
    case 'time-boundaries':
      return (
        <Column spacing={16} style={{ width: '100%' }}>
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
        </Column>
      );
    case 'short-activity-filter':
      return (
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
      );
    case 'routine-alarm':
      return (
        <Column spacing={12} style={{ width: '100%' }}>
          <Text textStyle={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
            Foreground sound is best-effort and never schedules background notifications.
          </Text>
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
        </Column>
      );
    case 'routine-defaults':
      return (
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
      );
    case 'catalog-visibility':
      return (
        <Switch
          disabled={saving}
          label="Show archived activities and routines"
          onValueChange={(value) => run(() => store.getState().setShowArchived(value))}
          testID="settings-show-archived"
          value={settings.showArchived}
        />
      );
    case 'backup-restore':
      return (
        <AppButton
          disabled={saving}
          label="Backup & restore"
          onPress={() => router.push('/backup')}
          style={{ height: 52, width: '100%' }}
          testID="open-backup"
        />
      );
    case 'prototype-data':
      return <PrototypeDataReset onCleared={() => router.replace('/(tabs)')} />;
  }
}

function SettingsCategoryContent({ category, router, store }: CategoryContentProps) {
  const { colors } = useAppTheme();
  return (
    <Screen onBack={() => router.back()} title={category.title}>
      <Column spacing={16} style={{ width: '100%' }}>
        <SettingsActionError onBack={() => router.back()} store={store} />
        <Column
          spacing={16}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 14,
            borderWidth: 1,
            padding: 16,
            width: '100%',
          }}
        >
          <CategoryControls category={category} router={router} store={store} />
        </Column>
      </Column>
    </Screen>
  );
}

export default function SettingsCategoryScreen({
  categoryId,
}: {
  categoryId: string | string[] | undefined;
}) {
  const { colors } = useAppTheme();
  const focused = useIsFocused();
  const router = useRouter();
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
      <Screen onBack={() => router.back()} title="Settings">
        <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>
          Settings category not found.
        </Text>
      </Screen>
    );
  }

  if (!store) {
    return (
      <Screen onBack={() => router.back()} title={category.title}>
        <Column spacing={12} style={{ width: '100%' }}>
          <Text textStyle={{ color: loadError ? colors.text : colors.textMuted, fontSize: 15 }}>
            {loadError ?? 'Loading settings...'}
          </Text>
          {loadError ? (
            <RecoveryActions
              onRetry={load}
              onBack={() => router.back()}
              retryTestID="settings-retry"
              testID="settings-load-recovery"
            />
          ) : null}
          {category.id === 'prototype-data' ? (
            <PrototypeDataReset onCleared={() => router.replace('/(tabs)')} />
          ) : null}
        </Column>
      </Screen>
    );
  }

  return <SettingsCategoryContent category={category} router={router} store={store} />;
}
