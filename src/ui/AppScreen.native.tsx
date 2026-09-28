import { Host } from '@expo/ui';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@theme';
import { PageHeader } from './PageHeader';
import type { AppScreenProps } from './AppScreen.types';

export type { AppScreenProps } from './AppScreen.types';

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  frame: {
    alignSelf: 'center',
    gap: 16,
    maxWidth: 720,
    width: '100%',
  },
  scrollContent: {
    alignItems: 'center',
    flexGrow: 1,
  },
});

/** Native screens keep navigation and scrolling in UIKit; SwiftUI hosts only feature content. */
export function AppScreen({
  onBack,
  children,
  title,
  headerRight,
  scrollable = true,
  testID,
  backgroundColor,
  hostContent = true,
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
  const content = hostContent ? (
    <Host
      colorScheme={colorScheme}
      matchContents={scrollable ? { vertical: true } : false}
      seedColor={colors.primary}
      style={scrollable ? { width: '100%' } : { flex: 1, minHeight: 0, width: '100%' }}
    >
      {children}
    </Host>
  ) : (
    children
  );

  if (!scrollable) {
    return (
      <View style={[styles.root, { backgroundColor: screenBackground }]} testID={testID}>
        <View style={[styles.frame, frameStyle, styles.root]}>
          {onBack || title || headerRight ? (
            <PageHeader onBack={onBack} title={title}>
              {headerRight}
            </PageHeader>
          ) : null}
          {content}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: screenBackground }]} testID={testID}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        style={styles.root}
      >
        <View style={[styles.frame, frameStyle]}>
          {onBack || title || headerRight ? (
            <PageHeader onBack={onBack} title={title}>
              {headerRight}
            </PageHeader>
          ) : null}
          {content}
        </View>
      </ScrollView>
    </View>
  );
}
