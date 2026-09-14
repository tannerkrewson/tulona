import { Text } from '@expo/ui';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '@theme';

import { AnalyticsEmptyState } from './AnalyticsEmptyState';

export interface ChartContainerProps {
  children?: ReactNode;
  title?: string;
  caption?: string;
  emptyMessage?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** A restrained surface for charts that keeps their labels outside the canvas. */
export function ChartContainer({
  children,
  title,
  caption,
  emptyMessage,
  style,
  testID,
}: ChartContainerProps) {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.surface, borderColor: colors.border },
        style,
      ]}
      testID={testID}
    >
      {title || caption ? (
        <View style={styles.header}>
          {title ? (
            <Text textStyle={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{title}</Text>
          ) : null}
          {caption ? (
            <Text textStyle={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}>
              {caption}
            </Text>
          ) : null}
        </View>
      ) : null}
      {children ?? (
        <AnalyticsEmptyState message={emptyMessage ?? 'No tracked time in this period.'} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
    padding: 16,
    width: '100%',
  },
  header: {
    gap: 2,
  },
});
