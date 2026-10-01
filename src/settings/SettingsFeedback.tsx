import { Column, Text } from '@ui/primitives';
import { useState } from 'react';

import { useAppTheme } from '@theme';
import { confirmAction, errorText, FormRow, FormSection } from '@ui';
import { RecoveryActions } from '../orchestration/RecoveryActions';
import { bootCoordinator } from '../orchestration/boot-coordinator';

import type { SettingsStore } from './settings-store';

export function SettingsActionError({
  store,
  onBack,
}: {
  store: SettingsStore;
  onBack: () => void;
}) {
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
        onClose={onBack}
        retryTestID="settings-reload"
        testID="settings-recovery"
      />
    </Column>
  );
}

export function PrototypeDataReset({ onCleared }: { onCleared: () => void }) {
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
    <>
      <FormSection
        footer={error ?? 'Removes every activity, habit, goal, and setting from this device.'}
        footerTone={error ? 'danger' : 'muted'}
        testID="prototype-data-reset"
      >
        <FormRow
          disabled={busy}
          kind="destructive"
          label="Clear All Data"
          onPress={() =>
            void confirmAction({
              confirmLabel: 'Clear All Data',
              destructive: true,
              message:
                'This removes every dataset, routine, activity, habit, setting, and history record from this device.',
              title: 'Clear All Data?',
            }).then((confirmed) => {
              if (confirmed) void clearData();
            })
          }
          testID="clear-local-data"
        />
      </FormSection>
    </>
  );
}
