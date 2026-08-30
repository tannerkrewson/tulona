import { Column, Host, ScrollView, Text } from '@expo/ui';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { useAppTheme, type ThemeMode } from '@theme';

export interface AppScreenProps {
  children: ReactNode;
  title?: string;
  description?: string;
  scrollable?: boolean;
  themeMode?: ThemeMode;
  testID?: string;
}

const hostStyles = StyleSheet.create({
  host: {
    flex: 1,
  },
});

const contentStyle = {
  alignSelf: 'center',
  maxWidth: 760,
  width: '100%',
} as ComponentProps<typeof Column>['style'];

/** The cross-platform screen boundary for feature content. */
export function AppScreen({
  children,
  title,
  description,
  scrollable = true,
  themeMode = 'system',
  testID,
}: AppScreenProps) {
  const { colorScheme, colors } = useAppTheme(themeMode);
  const content = (
    <Column
      alignment="start"
      spacing={16}
      style={{
        ...contentStyle,
        backgroundColor: colors.background,
        paddingHorizontal: 16,
        paddingVertical: 24,
      }}
    >
      {title ? (
        <Text textStyle={{ color: colors.text, fontSize: 32, fontWeight: '700' }}>{title}</Text>
      ) : null}
      {description ? (
        <Text textStyle={{ color: colors.textMuted, fontSize: 16, lineHeight: 24 }}>
          {description}
        </Text>
      ) : null}
      {children}
    </Column>
  );

  return (
    <Host
      colorScheme={colorScheme}
      seedColor={colors.primary}
      style={[hostStyles.host, { backgroundColor: colors.background }]}
      testID={testID}
      useViewportSizeMeasurement
    >
      {scrollable ? (
        <ScrollView style={{ height: '100%', width: '100%' }}>{content}</ScrollView>
      ) : (
        content
      )}
    </Host>
  );
}
