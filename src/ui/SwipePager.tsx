import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const SETTLE_MS = 240;
const FLICK_VELOCITY = 500;

export interface SwipePagerProps {
  /** Position of the visible page. Pages are keyed by index, so neighbors never remount. */
  index: number;
  canGoNext: boolean;
  onChange: (delta: -1 | 1) => void;
  renderPage: (index: number) => ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Horizontal pager that follows the finger on the UI thread. Swiping left shows `index + 1`.
 * Each page is laid out at its own absolute offset, so when the parent moves `index` after a
 * swipe the track is already in place and nothing jumps.
 */
export function SwipePager({
  index,
  canGoNext,
  onChange,
  renderPage,
  style,
  testID,
}: SwipePagerProps) {
  const [width, setWidth] = useState(0);
  const offset = useSharedValue(0);
  const start = useSharedValue(0);
  const currentIndex = useSharedValue(index);
  const pending = useSharedValue(false);
  const nextAllowed = useSharedValue(canGoNext);
  const pageWidth = useSharedValue(width);

  useEffect(() => {
    currentIndex.set(index);
    pageWidth.set(width);
    nextAllowed.set(canGoNext);
    pending.set(false);
    offset.set(-index * width);
  }, [canGoNext, currentIndex, index, nextAllowed, offset, pageWidth, pending, width]);

  const pan = usePanGesture({
    activeOffsetX: [-12, 12],
    failOffsetY: [-12, 12],
    onActivate: () => {
      'worklet';
      start.set(offset.get());
    },
    onUpdate: (event) => {
      'worklet';
      if (pending.get()) return;
      const base = -currentIndex.get() * pageWidth.get();
      let next = start.get() + event.translationX;
      // Resist dragging toward a page that doesn't exist.
      if (next < base && !nextAllowed.get()) next = base + (next - base) / 3;
      offset.set(Math.min(base + pageWidth.get(), Math.max(base - pageWidth.get(), next)));
    },
    onDeactivate: (event) => {
      'worklet';
      if (pending.get() || pageWidth.get() === 0) return;
      const base = -currentIndex.get() * pageWidth.get();
      const moved = offset.get() - base;
      let delta = 0;
      if (moved < -pageWidth.get() / 2 || event.velocityX < -FLICK_VELOCITY) delta = 1;
      if (moved > pageWidth.get() / 2 || event.velocityX > FLICK_VELOCITY) delta = -1;
      if (delta === 1 && !nextAllowed.get()) delta = 0;
      const target = base - delta * pageWidth.get();
      if (delta !== 0) pending.set(true);
      offset.set(
        withTiming(
          target,
          { duration: SETTLE_MS, easing: Easing.out(Easing.cubic) },
          (finished) => {
            if (finished && delta !== 0) scheduleOnRN(onChange, delta as -1 | 1);
            else pending.set(false);
          }
        )
      );
    },
  });

  const trackStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }));

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.viewport, style]}
      testID={testID}
    >
      <GestureDetector gesture={pan}>
        <Animated.View style={[StyleSheet.absoluteFill, trackStyle]}>
          {width > 0
            ? [index - 1, index, index + 1].map((page) =>
                page > index && !canGoNext ? null : (
                  <View
                    key={page}
                    accessibilityElementsHidden={page !== index}
                    importantForAccessibility={page === index ? 'auto' : 'no-hide-descendants'}
                    aria-hidden={page !== index}
                    pointerEvents={page === index ? 'auto' : 'none'}
                    style={[styles.page, { left: page * width, width }]}
                  >
                    {renderPage(page)}
                  </View>
                )
              )
            : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    bottom: 0,
    position: 'absolute',
    top: 0,
  },
  viewport: {
    overflow: 'hidden',
  },
});
