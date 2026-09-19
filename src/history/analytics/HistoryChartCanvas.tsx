import { useAppTheme } from '@theme';
import { lazy, Suspense } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { HistoryChartPoint, HistoryChartSeries, HistoryChartVariant } from './analytics-data';

export interface HistoryChartCanvasProps {
  data: readonly HistoryChartPoint[];
  series: readonly HistoryChartSeries[];
  variant: HistoryChartVariant;
  height: number;
  testID?: string;
}

const LazyNativeChart = lazy(() => import('./VictoryHistoryChart'));

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
  const fallback = <ChartFallback height={height} testID={testID} />;

  return (
    <Suspense fallback={fallback}>
      <LazyNativeChart data={data} height={height} series={series} variant={variant} />
    </Suspense>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
});
