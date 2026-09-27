import { Host } from '@expo/ui';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Animated, PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@theme';

export interface SlideUpSheetProps {
  children: ReactNode;
  onClose: () => void;
  backgroundColor?: string;
  testID?: string;
  contentTestID?: string;
}

/** Route content presented as a near-full-height, draggable sheet. */
export function SlideUpSheet({
  children,
  onClose,
  backgroundColor,
  testID = 'slide-up-sheet',
  contentTestID,
}: SlideUpSheetProps) {
  const { colorScheme, colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [translateY] = useState(() => new Animated.Value(0));

  useEffect(() => {
    translateY.setValue(0);
  }, [translateY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_event, gesture) => translateY.setValue(Math.max(0, gesture.dy)),
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dy > 100 || gesture.vy > 0.8) {
            onClose();
            return;
          }
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 24,
            stiffness: 240,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 24,
            stiffness: 240,
          }).start();
        },
      }),
    [onClose, translateY]
  );

  return (
    <Host
      colorScheme={colorScheme}
      ignoreSafeArea="all"
      seedColor={colors.primary}
      style={styles.host}
      useViewportSizeMeasurement
    >
      <View style={styles.root} testID={testID}>
        <Pressable
          accessibilityLabel="Close sheet"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.scrim}
          testID={`${testID}-scrim`}
        />
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: backgroundColor ?? colors.background,
              paddingBottom: Math.max(insets.bottom, 16),
            },
            { transform: [{ translateY }] },
          ]}
        >
          <View
            {...panResponder.panHandlers}
            accessible
            accessibilityActions={[{ name: 'activate', label: 'Close sheet' }]}
            accessibilityLabel="Drag down to close"
            accessibilityRole="button"
            onAccessibilityAction={({ nativeEvent }) => {
              if (nativeEvent.actionName === 'activate') onClose();
            }}
            style={styles.handleArea}
          >
            <View style={[styles.handle, { backgroundColor: colors.textMuted }]} />
          </View>
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            testID={contentTestID}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    height: '94%',
    maxHeight: '96%',
    overflow: 'hidden',
    width: '100%',
  },
  handleArea: {
    alignItems: 'center',
    height: 38,
    justifyContent: 'center',
    width: '100%',
  },
  handle: { borderRadius: 2, height: 4, opacity: 0.5, width: 38 },
  content: { alignItems: 'center', gap: 18, paddingBottom: 22, paddingHorizontal: 22 },
});
