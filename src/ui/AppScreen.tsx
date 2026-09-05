import { Column, Host, Row, ScrollView, Text } from '@expo/ui';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@theme';
import { IconButton } from './IconButton';

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
export function AppScreen({ onBack, children, title, scrollable = true, testID }: AppScreenProps) {
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
        paddingBottom: 32,
        paddingTop: 22 + insets.top,
      }}
    >
      {onBack || title ? (
        <Row alignment="center" spacing={4} style={{ height: 42, width: '100%' }}>
          {onBack ? (
            <IconButton
              accessibilityHint="Returns to the previous screen"
              icon="arrow-left"
              label="Back"
              onPress={onBack}
              testID="screen-back"
              variant="plain"
              iconSize={23}
            />
          ) : null}
          {title ? (
            <Text
              numberOfLines={1}
              textStyle={{ color: colors.text, fontSize: 30, fontWeight: '700', lineHeight: 36 }}
            >
              {title}
            </Text>
          ) : null}
        </Row>
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
