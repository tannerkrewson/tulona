import { Text } from '@expo/ui';
import { useAppTheme } from '@theme';
import { Pressable, StyleSheet, View } from 'react-native';

import { AnalyticsEmptyState } from './AnalyticsEmptyState';
import { ChartContainer } from './ChartContainer';
import { HistoryChartCanvas } from './HistoryChartCanvas';
import {
  formatAnalyticsDuration,
  type HistoryChartData,
  type HistoryChartPoint,
  type HistoryChartVariant,
} from './analytics-data';

export interface HistoryChartProps extends HistoryChartData {
  variant: HistoryChartVariant;
  title?: string;
  caption?: string;
  height?: number;
  showDatumLabels?: boolean;
  onDatumPress?: (point: HistoryChartPoint) => void;
  testID?: string;
}

function chartLabel(
  data: readonly HistoryChartPoint[],
  series: HistoryChartProps['series'],
  title: string
): string {
  const seriesLabel = series.map((item) => item.label).join(', ');
  const values = data.map((point) => `${point.label}: ${formatAnalyticsDuration(point.totalMs)}`);
  return `${title}. Activities represented: ${seriesLabel || 'none'}. ${values.join('; ')}`;
}

function DatumLabels({
  data,
  onDatumPress,
  showDatumLabels,
  testID,
}: Pick<HistoryChartProps, 'data' | 'onDatumPress' | 'showDatumLabels' | 'testID'>) {
  const { colors } = useAppTheme();
  if (!showDatumLabels && !onDatumPress) return null;

  return (
    <View style={styles.datumList} testID={testID ? `${testID}-labels` : undefined}>
      {data.map((point) => {
        const label = `${point.label}: ${formatAnalyticsDuration(point.totalMs)}`;
        if (onDatumPress) {
          return (
            <Pressable
              accessibilityHint="Opens this History period"
              accessibilityLabel={label}
              accessibilityRole="button"
              key={point.key}
              onPress={() => onDatumPress(point)}
              style={({ pressed }) => [
                styles.datumButton,
                { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
                pressed ? styles.pressed : null,
              ]}
            >
              <Text textStyle={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>
                {point.label}
              </Text>
              <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>
                {formatAnalyticsDuration(point.totalMs)}
              </Text>
            </Pressable>
          );
        }

        return (
          <Text
            key={point.key}
            numberOfLines={1}
            textStyle={{ color: colors.textMuted, fontSize: 12 }}
          >
            {point.label}
          </Text>
        );
      })}
    </View>
  );
}

/**
 * Platform-specific chart rendering keeps browser-only CanvasKit code out of
 * the native iOS bundle while preserving the same chart API on every target.
 */
export function HistoryChart({
  data,
  series,
  variant,
  title = 'Tracked time',
  caption,
  height = 180,
  showDatumLabels = false,
  onDatumPress,
  testID,
}: HistoryChartProps) {
  const hasData = data.length > 0 && series.length > 0;
  const accessibilityLabel = chartLabel(data, series, title);

  return (
    <ChartContainer
      caption={caption}
      emptyMessage="No tracked time in this period."
      testID={testID}
      title={title}
    >
      {!hasData ? (
        <AnalyticsEmptyState message="No tracked time in this period." />
      ) : (
        <View style={styles.content}>
          <View accessible accessibilityLabel={accessibilityLabel} style={styles.canvasWrap}>
            <HistoryChartCanvas
              data={data}
              height={height}
              series={series}
              testID={testID}
              variant={variant}
            />
          </View>
          <DatumLabels
            data={data}
            onDatumPress={onDatumPress}
            showDatumLabels={showDatumLabels}
            testID={testID}
          />
        </View>
      )}
    </ChartContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 10,
    width: '100%',
  },
  canvasWrap: {
    width: '100%',
  },
  datumList: {
    gap: 6,
    width: '100%',
  },
  datumButton: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  pressed: {
    opacity: 0.72,
  },
});
