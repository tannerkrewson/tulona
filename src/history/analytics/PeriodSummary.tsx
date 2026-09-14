import { Text } from '@expo/ui';
import { useAppTheme } from '@theme';
import { StyleSheet, View } from 'react-native';

import { comparePeriods, formatAnalyticsDuration, type PeriodComparison } from './analytics-data';

export interface PeriodSummaryProps {
  totalMs: number;
  periodLabel?: string;
  averageMs?: number;
  previousTotalMs?: number;
  previousLabel?: string;
  testID?: string;
}

function detailLabel(averageMs: number | undefined): string | null {
  return averageMs === undefined ? null : `Average ${formatAnalyticsDuration(averageMs)} per day`;
}

/** Compact period context without turning History into a dashboard of metric cards. */
export function PeriodSummary({
  totalMs,
  periodLabel,
  averageMs,
  previousTotalMs,
  previousLabel = 'the previous period',
  testID,
}: PeriodSummaryProps) {
  const { colors } = useAppTheme();
  const comparison: PeriodComparison | null =
    previousTotalMs === undefined ? null : comparePeriods(totalMs, previousTotalMs, previousLabel);
  const averageLabel = detailLabel(averageMs);

  return (
    <View
      style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID={testID}
    >
      <View accessible accessibilityLabel={`Total tracked ${formatAnalyticsDuration(totalMs)}`}>
        <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>Total tracked</Text>
        <Text textStyle={{ color: colors.text, fontSize: 30, fontWeight: '700' }}>
          {formatAnalyticsDuration(totalMs)}
        </Text>
        {periodLabel ? (
          <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>{periodLabel}</Text>
        ) : null}
      </View>
      {averageLabel || comparison ? (
        <View style={[styles.details, { borderTopColor: colors.border }]}>
          {averageLabel ? (
            <View accessible accessibilityLabel={averageLabel} style={styles.detail}>
              <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>{averageLabel}</Text>
            </View>
          ) : null}
          {comparison ? (
            <View accessible accessibilityLabel={comparison.label} style={styles.detail}>
              <Text textStyle={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>
                {comparison.label}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 16,
    width: '100%',
  },
  details: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 16,
    paddingTop: 12,
  },
  detail: {
    flex: 1,
  },
});
