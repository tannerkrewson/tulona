import { Text } from '@expo/ui';
import { AppIcon } from '@icons';
import { useAppTheme } from '@theme';
import { StyleSheet, View } from 'react-native';

import {
  formatAnalyticsDuration,
  formatAnalyticsPercentage,
  formatGoalPeriod,
  formatGoalType,
} from './analytics-data';
import type { TimeGoalEvaluation } from '@domain';

export interface GoalProgressProps {
  evaluation: TimeGoalEvaluation;
  activityName: string;
  activityColor?: string | null;
  testID?: string;
}

function progressWidth(fraction: number): `${number}%` {
  const value = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  return `${value * 100}%`;
}

function DirectProgress({
  evaluation,
  accent,
}: {
  evaluation: Extract<TimeGoalEvaluation, { kind: 'progress' }>;
  accent: string;
}) {
  const { colors } = useAppTheme();
  const { progress } = evaluation;
  const isTarget = progress.goal.type === 'target';
  const status = isTarget
    ? progress.completed
      ? 'Target met'
      : `${formatAnalyticsDuration(progress.remainingMs)} remaining`
    : progress.exceeded
      ? `Over limit by ${formatAnalyticsDuration(progress.trackedMs - progress.goalMs)}`
      : 'Within limit';
  const icon = isTarget ? (progress.completed ? 'check-circle-2' : 'circle-dot') : 'timer';
  const label = `${formatGoalType(progress.goal.type)}: ${formatAnalyticsDuration(progress.trackedMs)} of ${formatAnalyticsDuration(progress.goalMs)}`;

  return (
    <View style={styles.body}>
      <View
        accessible
        accessibilityLabel={`Goal progress: ${label}. ${status}.`}
        style={styles.valueRow}
      >
        <Text textStyle={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{label}</Text>
        <View style={styles.status}>
          <AppIcon color={colors.textMuted} name={icon} size={16} />
          <Text textStyle={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>
            {status}
          </Text>
        </View>
      </View>
      <View
        accessibilityElementsHidden
        style={[styles.progressTrack, { backgroundColor: colors.surfaceMuted }]}
      >
        <View
          style={{
            backgroundColor: accent,
            borderRadius: 99,
            height: '100%',
            minWidth: progress.percentage > 0 ? 4 : 0,
            width: progressWidth(progress.percentage),
          }}
        />
      </View>
    </View>
  );
}

function AdherenceProgress({
  evaluation,
  accent,
}: {
  evaluation: Extract<TimeGoalEvaluation, { kind: 'adherence' }>;
  accent: string;
}) {
  const { colors } = useAppTheme();
  const { adherence } = evaluation;
  const eligible = adherence.eligiblePeriods;
  const completed = adherence.completedPeriods;
  const upcoming = Math.max(0, adherence.totalPeriods - eligible);
  const label =
    eligible > 0
      ? `Met ${completed} of ${eligible} ${formatGoalPeriod(adherence.goal.period, true)}`
      : 'No completed periods yet';
  const detail =
    upcoming > 0 ? `${upcoming} upcoming period${upcoming === 1 ? '' : 's'} not counted` : null;

  return (
    <View style={styles.body}>
      <View
        accessible
        accessibilityLabel={`Goal adherence: ${label}, ${eligible > 0 ? formatAnalyticsPercentage(completed / eligible) : 'not available'}.`}
        style={styles.valueRow}
      >
        <Text textStyle={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{label}</Text>
        <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>
          {eligible > 0 ? formatAnalyticsPercentage(completed / eligible) : '—'}
        </Text>
      </View>
      <View
        accessibilityElementsHidden
        style={[styles.progressTrack, { backgroundColor: colors.surfaceMuted }]}
      >
        <View
          style={{
            backgroundColor: accent,
            borderRadius: 99,
            height: '100%',
            minWidth: completed > 0 ? 4 : 0,
            width: progressWidth(eligible > 0 ? completed / eligible : 0),
          }}
        />
      </View>
      {detail ? <Text textStyle={{ color: colors.textMuted, fontSize: 12 }}>{detail}</Text> : null}
    </View>
  );
}

/** Goal visualization for direct periods and larger-range adherence summaries. */
export function GoalProgress({
  evaluation,
  activityName,
  activityColor,
  testID,
}: GoalProgressProps) {
  const { colors } = useAppTheme();
  const goal =
    evaluation.kind === 'progress' ? evaluation.progress.goal : evaluation.adherence.goal;
  const accent = activityColor ?? colors.textMuted;

  return (
    <View
      style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID={testID}
    >
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: colors.surfaceMuted }]}>
          <AppIcon color={accent} name="award" size={18} />
        </View>
        <View style={styles.headerText}>
          <Text textStyle={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>
            {activityName}
          </Text>
          <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>
            {`${formatGoalType(goal.type)} · ${formatGoalPeriod(goal.period)}`}
          </Text>
        </View>
      </View>
      {evaluation.kind === 'progress' ? (
        <DirectProgress accent={accent} evaluation={evaluation} />
      ) : (
        <AdherenceProgress accent={accent} evaluation={evaluation} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
    padding: 16,
    width: '100%',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  icon: {
    alignItems: 'center',
    borderRadius: 10,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  headerText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  body: {
    gap: 10,
    width: '100%',
  },
  valueRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    minHeight: 44,
  },
  status: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 5,
    justifyContent: 'flex-end',
  },
  progressTrack: {
    borderRadius: 99,
    height: 8,
    overflow: 'hidden',
    width: '100%',
  },
});
