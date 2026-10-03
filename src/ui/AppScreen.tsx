import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

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
    paddingBottom: 32,
    paddingHorizontal: 20,
    paddingTop: 22,
    width: '100%',
  },
  scrollContent: {
    alignItems: 'center',
  },
  // UIKit adds safe-area insets on top of a grown content frame, which would
  // make every page scroll by the inset height even when it is short.
  scrollContentGrow: {
    flexGrow: 1,
  },
});

const isIOS = Platform.OS === 'ios';

/** The shared screen boundary: page header, horizontal frame, and scrolling. */
export function AppScreen({
  onBack,
  children,
  title,
  headerRight,
  scrollable = true,
  underBottomChrome = false,
  testID,
  backgroundColor,
}: AppScreenProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const screenBackground = backgroundColor ?? colors.background;
  const header =
    onBack || title || headerRight ? (
      <PageHeader onBack={onBack} title={title}>
        {headerRight}
      </PageHeader>
    ) : null;

  if (!scrollable) {
    // A native safe area tracks the tab bar and its accessory as well as the
    // device edges, so fixed-height screens stop above system chrome.
    return (
      <SafeAreaView
        edges={underBottomChrome ? ['top', 'left', 'right'] : ['top', 'left', 'right', 'bottom']}
        style={[styles.root, { backgroundColor: screenBackground }]}
        testID={testID}
      >
        <View style={[styles.frame, styles.root, { paddingBottom: underBottomChrome ? 0 : 12 }]}>
          {header}
          {children}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: screenBackground }]} testID={testID}>
      <ScrollView
        // UIKit insets the content for the status bar, tab bar, and bottom
        // accessory; the web keeps an explicit top inset.
        contentContainerStyle={[styles.scrollContent, !isIOS && styles.scrollContentGrow]}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        style={styles.root}
      >
        <View
          style={[
            styles.frame,
            !isIOS && {
              paddingLeft: 20 + insets.left,
              paddingRight: 20 + insets.right,
              paddingTop: 22 + insets.top,
            },
          ]}
        >
          {header}
          {children}
        </View>
      </ScrollView>
    </View>
  );
}
