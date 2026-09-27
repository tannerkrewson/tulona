import { Column, Host, ScrollView } from '@expo/ui';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@theme';
import { PageHeader } from './PageHeader';

export interface AppScreenProps {
  onBack?: () => void;
  children: ReactNode;
  title?: string;
  headerRight?: ReactNode;
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
  headerRight,
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
            {onBack || title || headerRight ? (
              <PageHeader onBack={onBack} title={title}>
                {headerRight}
              </PageHeader>
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
      {onBack || title || headerRight ? (
        <PageHeader onBack={onBack} title={title}>
          {headerRight}
        </PageHeader>
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
