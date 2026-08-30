import { Column, Text } from '@expo/ui';

import { useAppTheme } from '@theme';
import { RecoveryActions } from '../orchestration/RecoveryActions';

export function HabitErrorMessage({
  message,
  onRetry,
  onBack,
  retryTestID,
}: {
  message: string | null;
  onRetry?: () => void;
  onBack?: () => void;
  retryTestID?: string;
}) {
  const { colors } = useAppTheme();
  if (!message) return null;

  return (
    <Column
      spacing={4}
      style={{
        backgroundColor: colors.danger.background,
        borderColor: colors.danger.foreground,
        borderRadius: 12,
        borderWidth: 1,
        padding: 14,
        width: '100%',
      }}
      testID="habit-persistence-error"
    >
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 14, fontWeight: '700' }}>
        Habit action failed
      </Text>
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{message}</Text>
      <RecoveryActions
        onBack={onBack}
        onRetry={onRetry}
        retryTestID={retryTestID}
        testID="habit-recovery"
      />
    </Column>
  );
}
