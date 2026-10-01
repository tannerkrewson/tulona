import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@theme';

// React Native's style type excludes browser gesture and scroll properties.
// Keep the explicit web extension behind Platform.OS guards.
const webDragStyle: ViewStyle & Pick<CSSProperties, 'touchAction' | 'overscrollBehavior'> = {
  touchAction: 'none',
  overscrollBehavior: 'none',
};

export interface SlideUpSheetProps {
  children: ReactNode;
  onClose: () => void;
  backgroundColor?: string;
  testID?: string;
  contentTestID?: string;
  /** Long lists scroll; compact timer surfaces fill the frame and drag from their background. */
  scrollable?: boolean;
}

/** Route content presented as a near-full-height, draggable sheet. */
export function SlideUpSheet({
  children,
  onClose,
  backgroundColor,
  testID = 'slide-up-sheet',
  contentTestID,
  scrollable = true,
}: SlideUpSheetProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<View>(null);
  const handleRef = useRef<View>(null);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  const [translateY] = useState(() => new Animated.Value(0));

  useEffect(() => {
    translateY.setValue(0);
  }, [translateY]);

  const panResponder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- create stores callbacks; it does not invoke them during render.
      PanResponder.create({
        // Bubble after child Pressables so controls retain their own responder.
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_event, gesture) => translateY.setValue(Math.max(0, gesture.dy)),
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dy > 100 || (gesture.dy > 20 && gesture.vy > 0.8)) {
            closeRef.current();
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
    [translateY]
  );

  // Pointer events keep PWA drags independent of the browser's scroll responder.
  // Native platforms use the responder system below, with protected Pressables.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const element = (scrollable
      ? handleRef.current
      : sheetRef.current) as unknown as HTMLElement | null;
    if (!element) return;
    let drag: {
      pointerId: number;
      startY: number;
      lastY: number;
      lastAt: number;
      velocity: number;
    } | null = null;
    const reset = () =>
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: false,
        damping: 24,
        stiffness: 240,
      }).start();
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;
      const control = (event.target as Element).closest(
        'button, [role="button"], input, select, textarea, a, [contenteditable="true"]'
      );
      if (control && control.getAttribute('data-testid') !== `${testID}-handle`) return;
      drag = {
        pointerId: event.pointerId,
        startY: event.clientY,
        lastY: event.clientY,
        lastAt: event.timeStamp,
        velocity: 0,
      };
      element.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    const move = (event: PointerEvent) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const elapsed = event.timeStamp - drag.lastAt;
      if (elapsed > 0) drag.velocity = (event.clientY - drag.lastY) / elapsed;
      drag.lastY = event.clientY;
      drag.lastAt = event.timeStamp;
      translateY.setValue(Math.max(0, event.clientY - drag.startY));
    };
    const up = (event: PointerEvent) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const distance = event.clientY - drag.startY;
      const velocity = event.timeStamp - drag.lastAt < 100 ? drag.velocity : 0;
      drag = null;
      if (element.hasPointerCapture(event.pointerId))
        element.releasePointerCapture(event.pointerId);
      if (distance > 100 || (distance > 20 && velocity > 0.8)) closeRef.current();
      else reset();
    };
    const cancel = () => {
      drag = null;
      reset();
    };
    element.addEventListener('pointerdown', down);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', cancel);
    return () => {
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', cancel);
    };
  }, [scrollable, testID, translateY]);

  return (
    <View style={styles.host}>
      <View style={styles.root} testID={testID}>
        <Pressable
          accessibilityLabel="Close sheet"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.scrim}
          testID={`${testID}-scrim`}
        />
        <Animated.View
          ref={sheetRef}
          {...(!scrollable && Platform.OS !== 'web' ? panResponder.panHandlers : {})}
          style={[
            styles.sheet,
            {
              backgroundColor: backgroundColor ?? colors.background,
              paddingBottom: Math.max(insets.bottom, 16),
              ...(!scrollable && Platform.OS === 'web' ? webDragStyle : {}),
            },
            { transform: [{ translateY }] },
          ]}
        >
          <View
            ref={handleRef}
            testID={`${testID}-handle`}
            {...(scrollable && Platform.OS !== 'web' ? panResponder.panHandlers : {})}
            accessible
            accessibilityActions={[{ name: 'activate', label: 'Close sheet' }]}
            accessibilityLabel="Drag down to close"
            accessibilityRole="button"
            onAccessibilityAction={({ nativeEvent }) => {
              if (nativeEvent.actionName === 'activate') onClose();
            }}
            style={[styles.handleArea, Platform.OS === 'web' ? webDragStyle : null]}
          >
            <View style={[styles.handle, { backgroundColor: colors.textMuted }]} />
          </View>
          {scrollable ? (
            <ScrollView
              bounces={false}
              overScrollMode="never"
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              testID={contentTestID}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.content, styles.fixedContent]} testID={contentTestID}>
              {children}
            </View>
          )}
        </Animated.View>
      </View>
    </View>
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
  fixedContent: { flex: 1, minHeight: 0, paddingBottom: 8 },
});
