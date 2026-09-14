import { Column, Host, Row, ScrollView, Text } from '@expo/ui';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme, type ThemeColors } from '@theme';
import { IconButton } from './IconButton';

export interface AppScreenProps {
  onBack?: () => void;
  children: ReactNode;
  title?: string;
  description?: string;
  scrollable?: boolean;
  testID?: string;
  backgroundColor?: string;
}

const hostStyles = StyleSheet.create({
  host: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  content: {
    alignSelf: 'center',
    flex: 1,
    gap: 16,
    maxWidth: 720,
    width: '100%',
  },
});

function TitleRow({
  colors,
  onBack,
  title,
}: {
  colors: ThemeColors;
  onBack?: () => void;
  title?: string;
}) {
  return (
    <View style={titleRowStyles.row}>
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
    </View>
  );
}

const titleRowStyles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    height: 42,
    width: '100%',
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
  backgroundColor,
}: AppScreenProps) {
  const { colorScheme, colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const screenBackground = backgroundColor ?? colors.background;
  const frameStyle = {
    backgroundColor: screenBackground,
    paddingLeft: 20 + insets.left,
    paddingRight: 20 + insets.right,
    paddingBottom: 32,
    paddingTop: 22 + insets.top,
  };
  // Non-scrollable screens (habits pager, routine runner) own their inner
  // layout and must fill the host height; Column's universal style only
  // covers width/height, so the full-bleed flex frame lives on RN Views.
  if (!scrollable) {
    return (
      <Host
        colorScheme={colorScheme}
        ignoreSafeArea="all"
        seedColor={colors.primary}
        style={[hostStyles.host, { backgroundColor: screenBackground }]}
        testID={testID}
        useViewportSizeMeasurement
      >
        <View style={[hostStyles.fill, frameStyle]}>
          <View style={hostStyles.content}>
            {onBack || title ? <TitleRow colors={colors} onBack={onBack} title={title} /> : null}
            {description ? (
              <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>{description}</Text>
            ) : null}
            {children}
          </View>
        </View>
      </Host>
    );
  }
  const content = (
    <Column
      alignment="start"
      spacing={16}
      style={{
        ...contentStyle,
        backgroundColor: screenBackground,
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
      {description ? (
        <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>{description}</Text>
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
      style={[hostStyles.host, { backgroundColor: screenBackground }]}
      testID={testID}
      useViewportSizeMeasurement
    >
      <ScrollView style={{ height: '100%', width: '100%' }}>{content}</ScrollView>
    </Host>
  );
}
