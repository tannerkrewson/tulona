import { Text } from '@expo/ui';
import { AppIcon } from '@icons';
import { useAppTheme } from '@theme';
import { StyleSheet, View } from 'react-native';

export interface AnalyticsEmptyStateProps {
  message: string;
  testID?: string;
}

export function AnalyticsEmptyState({ message, testID }: AnalyticsEmptyStateProps) {
  const { colors } = useAppTheme();

  return (
    <View accessible accessibilityLabel={message} style={styles.container} testID={testID}>
      <AppIcon accessibilityLabel={message} color={colors.textMuted} name="clock" size={20} />
      <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 44,
    width: '100%',
  },
});
