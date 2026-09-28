import { useState } from 'react';
import { Text as NativeText, View } from 'react-native';

import { downloadRawDataJson } from '../backup/web-download';
import { bootCoordinator } from './boot-coordinator';
import { AppButton, errorText, IconButton } from '@ui';
import { useAppTheme } from '@theme';

export interface RecoveryActionsProps {
  onRetry?: () => void;
  onClose?: () => void;
  testID?: string;
  retryTestID?: string;
  disabled?: boolean;
}

/** Keeps durable-data failures recoverable without hiding the original error. */
export function RecoveryActions({
  onRetry,
  onClose,
  testID = 'recovery-actions',
  retryTestID,
  disabled = false,
}: RecoveryActionsProps) {
  const { colors } = useAppTheme();
  const [rawError, setRawError] = useState<string | null>(null);

  const exportRaw = () => {
    setRawError(null);
    void bootCoordinator
      .exportRawData()
      .then((content) => {
        if (!downloadRawDataJson(content)) {
          throw new Error('Raw data download is only available on web');
        }
      })
      .catch((error: unknown) => setRawError(errorText(error)));
  };

  return (
    <View style={{ gap: 8, width: '100%' }} testID={testID}>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}>
        {onRetry ? (
          <AppButton
            disabled={disabled}
            label="Retry"
            onPress={onRetry}
            testID={retryTestID ?? `${testID}-retry`}
          />
        ) : null}
        {onClose ? (
          <IconButton
            accessibilityHint="Dismisses this error"
            color={colors.danger.foreground}
            icon="x"
            label="Close error"
            onPress={onClose}
            testID={`${testID}-close`}
            variant="plain"
          />
        ) : null}
      </View>
      <AppButton
        disabled={disabled}
        label="Export raw local data"
        onPress={exportRaw}
        style={{ width: '100%' }}
        testID={`${testID}-export-raw`}
        variant="outlined"
      />
      {rawError ? (
        <NativeText style={{ color: colors.danger.foreground, fontSize: 13 }}>
          {rawError}
        </NativeText>
      ) : null}
    </View>
  );
}
