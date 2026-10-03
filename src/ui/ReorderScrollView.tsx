import { createContext, useContext, useMemo, useRef, useState } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';

interface ScrollController {
  offset: () => number;
  lock: (locked: boolean) => void;
  measure: (callback: (top: number, bottom: number) => void) => void;
  scrollBy: (amount: number) => void;
}
const ScrollContext = createContext<ScrollController | null>(null);
export const useReorderScroll = () => useContext(ScrollContext);

/** Coordinates handle dragging and edge scrolling with the nearest scroll view. */
export function ReorderScrollView({
  children,
  onScroll,
  scrollEnabled = true,
  ...props
}: ScrollViewProps) {
  const ref = useRef<ScrollView>(null);
  const offset = useRef(0);
  const contentHeight = useRef(0);
  const height = useRef(0);
  const [locked, setLocked] = useState(false);
  const controller = useMemo<ScrollController>(
    () => ({
      offset: () => offset.current,
      lock: setLocked,
      measure: (callback) =>
        ref.current
          ?.getNativeScrollRef()
          ?.measureInWindow((_x, y, _width, h) => callback(y, y + h)),
      scrollBy: (amount) => {
        const y = Math.max(
          0,
          Math.min(contentHeight.current - height.current, offset.current + amount)
        );
        offset.current = y;
        ref.current?.scrollTo({ y, animated: false });
      },
    }),
    []
  );
  return (
    <ScrollContext.Provider value={controller}>
      <ScrollView
        {...props}
        ref={ref}
        onContentSizeChange={(width, nextHeight) => {
          contentHeight.current = nextHeight;
          props.onContentSizeChange?.(width, nextHeight);
        }}
        onLayout={(event) => {
          height.current = event.nativeEvent.layout.height;
          props.onLayout?.(event);
        }}
        onScroll={(event) => {
          offset.current = event.nativeEvent.contentOffset.y;
          onScroll?.(event);
        }}
        scrollEnabled={scrollEnabled && !locked}
        scrollEventThrottle={16}
      >
        {children}
      </ScrollView>
    </ScrollContext.Provider>
  );
}
