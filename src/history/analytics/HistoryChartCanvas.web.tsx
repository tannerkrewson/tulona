import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { useAppTheme } from '@theme';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { basePathAsset } from '../../pwa/basePath';
import type { HistoryChartCanvasProps } from './HistoryChartCanvas';

function ChartFallback({ height, testID }: Pick<HistoryChartCanvasProps, 'height' | 'testID'>) {
  const { colors } = useAppTheme();
  return (
    <View
      accessibilityLabel="Loading chart"
      style={[styles.fallback, { backgroundColor: colors.surfaceMuted, height }]}
      testID={testID ? `${testID}-loading` : undefined}
    >
      <ActivityIndicator color={colors.textMuted} size="small" />
    </View>
  );
}

export function HistoryChartCanvas({
  data,
  series,
  variant,
  height,
  testID,
}: HistoryChartCanvasProps) {
  const props = { data, series, variant, height };
  const fallback = <ChartFallback height={height} testID={testID} />;

  // Expo's static renderer runs in Node, where CanvasKit cannot initialize.
  // The browser loads it on demand after the page has mounted.
  if (typeof window === 'undefined') return fallback;

  return (
    <WithSkiaWeb
      fallback={fallback}
      getComponent={() => import('./VictoryHistoryChart')}
      componentProps={props}
      opts={{
        locateFile: () =>
          new URL(
            process.env.NODE_ENV === 'production'
              ? basePathAsset('canvaskit.wasm')
              : '/canvaskit.wasm',
            window.location.origin
          ).toString(),
      }}
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
});
