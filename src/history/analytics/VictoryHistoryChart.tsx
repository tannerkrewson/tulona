import {
  Bar,
  CartesianChart,
  StackedBar,
  type ChartBounds,
  type PointsArray,
} from 'victory-native';
import { useAppTheme } from '@theme';
import { StyleSheet, View } from 'react-native';
import type { ComponentType, ReactNode } from 'react';

import type { HistoryChartPoint, HistoryChartSeries, HistoryChartVariant } from './analytics-data';

interface DynamicChartRenderArgs {
  points: Record<string, PointsArray>;
  chartBounds: ChartBounds;
}

interface DynamicCartesianChartProps {
  data: Record<string, unknown>[];
  xKey: string;
  yKeys: string[];
  domain?: { y?: [number, number] };
  padding?: { left?: number; right?: number; top?: number; bottom?: number };
  domainPadding?: { left?: number; right?: number; top?: number; bottom?: number };
  frame?: { lineColor?: string; lineWidth?: number };
  children: (args: DynamicChartRenderArgs) => ReactNode;
}

// Victory's generic y-key constraint cannot express a runtime series list.
// Keep the cast local so callers still receive strongly typed History props.
const DynamicCartesianChart =
  CartesianChart as unknown as ComponentType<DynamicCartesianChartProps>;

export interface VictoryHistoryChartProps {
  data: readonly HistoryChartPoint[];
  series: readonly HistoryChartSeries[];
  variant: HistoryChartVariant;
  height: number;
}

function chartMaximum(
  data: readonly HistoryChartPoint[],
  series: readonly HistoryChartSeries[]
): number {
  const maximum = data.reduce((largest, point) => {
    const pointMaximum = series.reduce(
      (value, item) => Math.max(value, Number(point[item.key]) || 0),
      0
    );
    return Math.max(largest, pointMaximum, point.totalMs);
  }, 0);
  return maximum > 0 ? maximum : 1;
}

export default function VictoryHistoryChart({
  data,
  series,
  variant,
  height,
}: VictoryHistoryChartProps) {
  const { colors } = useAppTheme();
  const maximum = chartMaximum(data, series);
  const chartData = data.map((point) => ({ ...point })) as Record<string, unknown>[];
  const seriesKeys = series.map((item) => item.key);
  const chartColors = series.map((item) => item.color ?? colors.surfaceMuted);

  return (
    <View accessibilityElementsHidden style={[styles.chart, { height }]}>
      <DynamicCartesianChart
        data={chartData}
        domain={{ y: [0, maximum] }}
        domainPadding={{ bottom: 4, left: 18, right: 18, top: 8 }}
        frame={{ lineColor: colors.border, lineWidth: StyleSheet.hairlineWidth }}
        padding={{ bottom: 4, left: 4, right: 4, top: 4 }}
        xKey="x"
        yKeys={seriesKeys}
      >
        {({ points, chartBounds }) => {
          const pointArrays = series.map((item) => points[item.key] ?? []);
          if (variant === 'stacked') {
            return (
              <StackedBar
                barWidth={undefined}
                chartBounds={chartBounds}
                colors={chartColors}
                innerPadding={0.32}
                points={pointArrays}
              />
            );
          }
          const [pointArray = []] = pointArrays;
          return <Bar chartBounds={chartBounds} color={colors.textMuted} points={pointArray} />;
        }}
      </DynamicCartesianChart>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: {
    width: '100%',
  },
});
