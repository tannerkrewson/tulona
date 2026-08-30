import { Column, Text } from '@expo/ui';

import { useAppTheme } from '@theme';

export function HabitErrorMessage({ message }: { message: string | null }) {
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
    </Column>
  );
}
