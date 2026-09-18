import { useAppTheme } from '@theme';
import { StyleSheet, View } from 'react-native';

import { formatAnalyticsPercentage, type ActivityCompositionSegment } from './analytics-data';

export interface ActivityCompositionBarProps {
  segments: readonly ActivityCompositionSegment[];
  totalMs?: number;
  accessibilityLabel?: string;
  accessible?: boolean;
  testID?: string;
}

function compositionLabel(
  segments: readonly ActivityCompositionSegment[],
  totalMs: number
): string {
  if (segments.length === 0 || totalMs <= 0) return 'No tracked activity';
  return segments
    .map(
      (segment) => `${segment.label}, ${formatAnalyticsPercentage(segment.durationMs / totalMs)}`
    )
    .join('; ');
}

/** A truthful, labeled composition bar using the colors captured in History. */
export function ActivityCompositionBar({
  segments,
  totalMs,
  accessibilityLabel,
  accessible = true,
  testID,
}: ActivityCompositionBarProps) {
  const { colors } = useAppTheme();
  const visibleSegments = segments.filter((segment) => segment.durationMs > 0);
  const calculatedTotal = visibleSegments.reduce((total, segment) => total + segment.durationMs, 0);
  const effectiveTotal = Math.max(totalMs && totalMs > 0 ? totalMs : 0, calculatedTotal);

  return (
    <View
      accessible={accessible}
      accessibilityLabel={accessibilityLabel ?? compositionLabel(visibleSegments, effectiveTotal)}
      style={styles.container}
      testID={testID}
    >
      <View style={[styles.track, { backgroundColor: colors.surfaceMuted }]}>
        {visibleSegments.map((segment) => (
          <View
            accessibilityElementsHidden
            key={segment.key}
            style={{
              backgroundColor: segment.color ?? colors.primary,
              flex: effectiveTotal > 0 ? segment.durationMs / effectiveTotal : 0,
              minWidth: 2,
            }}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 12,
    width: '100%',
  },
  track: {
    borderRadius: 99,
    flexDirection: 'row',
    height: 10,
    overflow: 'hidden',
    width: '100%',
  },
});
