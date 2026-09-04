import { Column, Host, Row, ScrollView, Text } from '@expo/ui';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@theme';
import { AppButton } from './AppButton';
import { AppIcon } from '@icons';

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
  const insets = useSafeAreaInsets();
  const content = (
    <Column
      alignment="start"
      spacing={16}
      style={{
        ...contentStyle,
        backgroundColor: colors.background,
        paddingLeft: 20 + insets.left,
        paddingRight: 20 + insets.right,
        paddingTop: 22 + insets.top,
      }}
    >
      {onBack ? (
        <AppButton
          onPress={onBack}
          style={{ height: 42, paddingHorizontal: 0 }}
          testID="screen-back"
          variant="text"
        >
          <Row alignment="center" spacing={2}>
            <AppIcon
              accessibilityLabel="Back"
              color={colors.primary}
              name="chevron-left"
              size={22}
            />
            <Text textStyle={{ color: colors.primary, fontSize: 17 }}>Back</Text>
          </Row>
        </AppButton>
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
      // The tab navigator owns the bottom safe area; retain only screen-edge insets here.
      ignoreSafeArea="all"
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
