import { Button, Column, Row, Text } from '@expo/ui';
import { useState } from 'react';

import { downloadRawDataJson } from '../backup/web-download';
import { bootCoordinator } from './boot-coordinator';
import { errorText, IconButton } from '@ui';
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
    <Column spacing={8} style={{ width: '100%' }} testID={testID}>
      <Row alignment="center" spacing={8}>
        {onRetry ? (
          <Button
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
        <Button
          disabled={disabled}
          label="Export raw local data"
          onPress={exportRaw}
          testID={`${testID}-export-raw`}
          variant="outlined"
        />
      </Row>
      {rawError ? (
        <Text textStyle={{ color: colors.danger.foreground, fontSize: 13 }}>{rawError}</Text>
      ) : null}
    </Column>
  );
}
