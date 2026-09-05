import { Column, Text } from '@expo/ui';
import { useState } from 'react';

import { useAppTheme } from '@theme';
import { AppButton, errorText } from '@ui';
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
        onBack={onBack}
        retryTestID="settings-reload"
        testID="settings-recovery"
      />
    </Column>
  );
}

export function PrototypeDataReset({ onCleared }: { onCleared: () => void }) {
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
