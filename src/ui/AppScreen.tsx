import { Column, Host, ScrollView, Text } from '@expo/ui';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { useAppTheme } from '@theme';
import { AppButton } from './AppButton';

export interface AppScreenProps {
  onBack?: () => void;
  children: ReactNode;
  title?: string;
  description?: string;
  scrollable?: boolean;
  testID?: string;
}

const hostStyles = StyleSheet.create({
  host: {
    flex: 1,
  },
});

const contentStyle = {
  alignSelf: 'center',
  maxWidth: 720,
  width: '100%',
} as ComponentProps<typeof Column>['style'];

/** The cross-platform screen boundary for feature content. */
export function AppScreen({
  onBack,
  children,
  title,
  description,
  scrollable = true,
  testID,
}: AppScreenProps) {
  const { colorScheme, colors } = useAppTheme();
  const content = (
    <Column
      alignment="start"
      spacing={16}
      style={{
        ...contentStyle,
        backgroundColor: colors.background,
        paddingBottom: 32,
        paddingHorizontal: 20,
        paddingTop: 22,
      }}
    >
      {onBack ? (
        <AppButton label="Back" onPress={onBack} testID="screen-back" variant="text" />
      ) : null}
      {title ? (
        <Text textStyle={{ color: colors.text, fontSize: 30, fontWeight: '700' }}>{title}</Text>
      ) : null}
      {description ? (
        <Text textStyle={{ color: colors.textMuted, fontSize: 15, lineHeight: 22 }}>
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
