import { Column, Text } from '@expo/ui';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import {
  dateForLogicalDay,
  formatDuration,
  logicalDayBounds,
  shiftLogicalDay,
  timestampMs,
  type ActiveRoutine,
  type CatalogCollection,
  type Goal,
  type GoalActivityDurationComparison,
  type GoalWeekIdentity,
  type RoutineRunHistory,
  type TimeInterval,
  type UUID,
} from '@domain';
import { useAppTheme } from '@theme';
import { AppButton, errorText, ROW_SURFACE_LIST_GAP, Screen } from '@ui';
import { RecoveryActions } from '../orchestration/RecoveryActions';
import { resolveCatalogItem } from '../catalog/catalog-service';
import { ActivityRow } from '../tracker/ActivityRow';
import { FolderRow } from '../tracker/FolderRow';

import { loadRoutineRuntime, type RoutineRuntime } from './routine-runtime';
import type { RoutineDurationComparison } from './routine-service';

interface RoutineGoalImpact {
  goalId: UUID;
  goalTitle: string;
  activityName: string;
  comparison: GoalActivityDurationComparison;
  frequency: 'daily' | 'weekly';
  periodLabel: string;
  contributionMs: number;
  periodTotalMs: number;
  targetMs: number;
}

interface RoutineCompletionInsights {
  comparison: RoutineDurationComparison | null;
  goalImpacts: RoutineGoalImpact[];
}

function completedRoutineDurationComparison(comparison: RoutineDurationComparison): string {
  const difference = Math.abs(comparison.differenceMs);
  const average = formatDuration(comparison.averageDurationMs);
  if (difference < 30_000) {
    return `About the same as your average across ${comparison.previousRunCount} earlier runs in the last ${comparison.lookbackMonths} months (${average}).`;
  }
  const direction = comparison.differenceMs < 0 ? 'faster' : 'slower';
  return `${formatDuration(difference)} ${direction} than your average across ${comparison.previousRunCount} earlier runs in the last ${comparison.lookbackMonths} months (${average}).`;
}

function intervalDuration(
  intervals: readonly TimeInterval[],
  activityId: UUID,
  startMs: number,
  endMs: number
): number {
  return intervals.reduce((total, interval) => {
    if (interval.activityId !== activityId) return total;
    if (!Number.isFinite(interval.startMs) || !Number.isFinite(interval.endMs)) return total;
    if (interval.endMs <= interval.startMs) return total;
    const start = Math.max(interval.startMs, startMs);
    const end = Math.min(interval.endMs, endMs);
    return end > start ? total + end - start : total;
  }, 0);
}

function routineGoalImpacts(
  run: RoutineRunHistory,
  goals: readonly Goal[],
  catalog: CatalogCollection,
  intervals: readonly TimeInterval[],
  runWeek: GoalWeekIdentity,
  getWeek: (value: Date | number | string) => GoalWeekIdentity,
  rolloverHour: number
): RoutineGoalImpact[] {
  if (run.routineSnapshot.trackingMode !== 'steps') return [];
  const startedStepIds = new Set(
    run.stepSessions
      .filter((session) => session.startedAt !== null)
      .map((session) => session.stepId)
  );
  const activityIds = new Set(
    run.routineSnapshot.steps
      .filter((step) => step.activityId !== null && startedStepIds.has(step.id))
      .map((step) => step.activityId as UUID)
  );
  if (activityIds.size === 0) return [];
  const runStartMs = timestampMs(run.startedAt);
  const runEndMs = timestampMs(run.completedAt);
  if (runEndMs <= runStartMs) return [];

  const weeklyPeriods: Array<{ startMs: number; endMs: number; label: string }> = [];
  let week = getWeek(run.startedAt);
  for (let count = 0; count < 520 && week.startMs < runEndMs; count += 1) {
    weeklyPeriods.push({
      startMs: week.startMs,
      endMs: week.endMs,
      label: `week of ${new Date(week.startMs).toLocaleDateString([], { month: 'short', day: 'numeric' })}`,
    });
    if (week.weekStart >= runWeek.weekStart) break;
    week = getWeek(shiftLogicalDay(week.weekStart, 7, { rolloverHour }));
  }

  const dailyPeriods: Array<{ startMs: number; endMs: number; label: string }> = [];
  let day = logicalDayBounds(run.startedAt, { rolloverHour });
  const todayKey = logicalDayBounds(Date.now(), { rolloverHour }).key;
  for (let count = 0; count < 520 && day.startMs < runEndMs; count += 1) {
    dailyPeriods.push({
      startMs: day.startMs,
      endMs: day.endMs,
      label:
        day.key === todayKey
          ? 'today'
          : new Date(day.startMs).toLocaleDateString([], { month: 'short', day: 'numeric' }),
    });
    day = logicalDayBounds(shiftLogicalDay(day.key, 1, { rolloverHour }), { rolloverHour });
  }

  return goals.flatMap((goal) => {
    if (goal.evaluationMode !== 'automatic' || goal.overallStatus !== 'in-progress') return [];
    const configuredStartWeek =
      'startWeek' in goal && typeof goal.startWeek === 'string' ? goal.startWeek : null;
    const startWeek = configuredStartWeek
      ? getWeek(dateForLogicalDay(configuredStartWeek, rolloverHour))
      : getWeek(goal.createdAt);
    return goal.rules.flatMap((rule) => {
      if (rule.kind !== 'activity-duration' || !activityIds.has(rule.activityId)) return [];
      const activityName =
        catalog.activities.find((activity) => activity.id === rule.activityId)?.name ??
        'Tracked activity';
      const frequency = 'frequency' in rule && rule.frequency === 'daily' ? 'daily' : 'weekly';
      const periods = frequency === 'daily' ? dailyPeriods : weeklyPeriods;
      return periods.flatMap((period) => {
        if (period.startMs < startWeek.startMs) return [];
        const contributionMs = intervalDuration(
          intervals,
          rule.activityId,
          Math.max(runStartMs, period.startMs),
          Math.min(runEndMs, period.endMs)
        );
        if (contributionMs <= 0) return [];
        const periodTotalMs = intervalDuration(
          intervals,
          rule.activityId,
          period.startMs,
          period.endMs
        );
        return [
          {
            goalId: goal.id,
            goalTitle: goal.title,
            activityName,
            comparison: rule.comparison,
            frequency,
            periodLabel: period.label,
            contributionMs,
            periodTotalMs,
            targetMs: rule.targetMs,
          },
        ];
      });
    });
  });
}

function routineGoalImpactText(impact: RoutineGoalImpact): string {
  const contribution = formatDuration(impact.contributionMs);
  const total = formatDuration(impact.periodTotalMs);
  const target = formatDuration(impact.targetMs);
  if (impact.comparison === 'at-least') {
    return `+${contribution} toward ${impact.activityName} · ${total} of ${target} ${
      impact.frequency === 'daily' ? 'daily' : 'weekly'
    } on ${impact.periodLabel}`;
  }
  if (impact.periodTotalMs > impact.targetMs) {
    return `Added ${contribution} more ${impact.activityName}; total is ${total}, ${formatDuration(
      impact.periodTotalMs - impact.targetMs
    )} over its less-is-better ${target} ${impact.frequency} limit on ${impact.periodLabel}.`;
  }
  return `Added ${contribution} more ${impact.activityName} against its less-is-better ${
    impact.frequency
  } limit; total is ${total} of ${target} on ${impact.periodLabel}.`;
}

function shortTime(timestamp: string | null): string {
  return timestamp
    ? new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : 'unknown time';
}

function ChooserError({ message, children }: { message: string | null; children?: ReactNode }) {
  const { colors } = useAppTheme();
  if (!message) return null;
  return (
    <Column
      spacing={6}
      style={{
        backgroundColor: colors.danger.background,
        borderColor: colors.danger.foreground,
        borderRadius: 14,
        borderWidth: 1,
        padding: 16,
        width: '100%',
      }}
    >
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 16, fontWeight: '700' }}>
        Chooser unavailable
      </Text>
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{message}</Text>
      {children}
    </Column>
  );
}

export function NextActivityChooserScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const [runtime, setRuntime] = useState<RoutineRuntime | null>(null);
  const [active, setActive] = useState<ActiveRoutine | null>(null);
  const [catalog, setCatalog] = useState<CatalogCollection | null>(null);
  const [completionInsights, setCompletionInsights] = useState<RoutineCompletionInsights | null>(
    null
  );
  const [folderId, setFolderId] = useState<UUID | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastChoice = useRef<UUID | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setError(null);
    void loadRoutineRuntime()
      .then(async (nextRuntime) => {
        const restored = await nextRuntime.routineService.recover();
        const nextCatalog = await nextRuntime.catalogService.read();
        let insights: RoutineCompletionInsights | null = null;
        if (restored?.status === 'awaiting-next-activity') {
          const run = await nextRuntime.routineService.history('completed');
          let comparison: RoutineDurationComparison | null = null;
          try {
            comparison = await nextRuntime.routineService.durationComparison(run);
          } catch {
            // Historical comparisons are optional; keep the completion flow available.
          }
          let goalImpacts: RoutineGoalImpact[] = [];
          try {
            const goals = await nextRuntime.goalService.listGoals();
            const startingWeek = nextRuntime.goalService.week(run.startedAt);
            const week = nextRuntime.goalService.week(run.completedAt);
            const query = await nextRuntime.trackerService.query(
              {
                startMs: startingWeek.startMs,
                endMs: week.endMs,
              },
              Date.now()
            );
            goalImpacts = routineGoalImpacts(
              run,
              goals,
              nextCatalog,
              query.intervals,
              week,
              (value) => nextRuntime.goalService.week(value),
              nextRuntime.settings.logicalDayRolloverHour
            );
          } catch {
            // Goal insights are optional; the routine chooser remains usable if goal data is unavailable.
          }
          insights = { comparison, goalImpacts };
        }
        return { nextRuntime, restored, nextCatalog, insights };
      })
      .then(({ nextRuntime, restored, nextCatalog, insights }) => {
        if (cancelled) return;
        setRuntime(nextRuntime);
        setCatalog(nextCatalog);
        setCompletionInsights(insights);
        if (!restored) {
          setError('There is no routine awaiting a next activity.');
        } else if (restored.status !== 'awaiting-next-activity') {
          router.replace(`/routine/${restored.routineId}`);
        } else {
          setActive(restored);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(errorText(loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void Promise.resolve().then(() => {
      if (!disposed) cleanup = load();
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [load]);

  const choose = async (activityId: UUID) => {
    if (!runtime) return;
    lastChoice.current = activityId;
    setBusy(true);
    setError(null);
    try {
      await runtime.routineService.selectNextActivity(activityId);
      router.replace('/(tabs)');
    } catch (choiceError) {
      setError(errorText(choiceError));
    } finally {
      setBusy(false);
    }
  };

  if (!active || !catalog) {
    return (
      <Screen onBack={() => router.replace('/(tabs)')} title="Choose activity" scrollable={false}>
        <Column alignment="center" spacing={16} style={{ width: '100%' }}>
          <ChooserError message={error ?? 'Restoring the next-activity chooser...'}>
            <RecoveryActions
              onClose={() => router.replace('/(tabs)')}
              onRetry={load}
              testID="chooser-recovery"
            />
          </ChooserError>
        </Column>
      </Screen>
    );
  }

  const folders = [...catalog.folders]
    .filter((folder) => folder.archivedAt === null)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
  const items = [...catalog.activities, ...catalog.routines]
    .filter((item) => item.archivedAt === null && item.folderId === folderId)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
  const visibleFolders = folderId === null ? folders : [];
  const currentFolder = folderId ? folders.find((folder) => folder.id === folderId) : null;
  const title = currentFolder?.name ?? 'Choose activity';

  return (
    <Screen
      onBack={() => (folderId === null ? router.replace('/(tabs)') : setFolderId(null))}
      title={title}
    >
      <Column spacing={ROW_SURFACE_LIST_GAP} style={{ width: '100%' }}>
        <Column
          spacing={8}
          style={{ paddingBottom: 14, width: '100%' }}
          testID="routine-completion-insights"
        >
          <Text textStyle={{ color: colors.text, fontSize: 21, fontWeight: '800' }}>
            {`${active.routineSnapshot.name} complete`}
          </Text>
          <Text textStyle={{ color: colors.textMuted, fontSize: 15, lineHeight: 21 }}>
            {`Finished at ${shortTime(active.completedAt)}. Choose what to track next.`}
          </Text>
          {completionInsights?.comparison ? (
            <Text
              textStyle={{ color: colors.text, fontSize: 15, lineHeight: 21 }}
              testID="routine-duration-comparison"
            >
              {completedRoutineDurationComparison(completionInsights.comparison)}
            </Text>
          ) : null}
          {completionInsights && completionInsights.goalImpacts.length > 0 ? (
            <Column spacing={8} style={{ width: '100%' }} testID="routine-goal-impact">
              <Text textStyle={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>
                Goal activity
              </Text>
              {completionInsights.goalImpacts.map((impact, index) => (
                <Column
                  key={`${impact.goalId}-${impact.activityName}-${index}`}
                  spacing={2}
                  style={{ width: '100%' }}
                >
                  <Text textStyle={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>
                    {impact.goalTitle}
                  </Text>
                  <Text textStyle={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
                    {routineGoalImpactText(impact)}
                  </Text>
                </Column>
              ))}
            </Column>
          ) : null}
        </Column>
        {visibleFolders.map((folder) => (
          <FolderRow
            key={folder.id}
            disabled={busy}
            folder={folder}
            onPress={() => setFolderId(folder.id)}
            testID={`chooser-folder-${folder.id}`}
          />
        ))}
        {items.map((item) => (
          <ActivityRow
            key={item.id}
            active={false}
            color={resolveCatalogItem(catalog, item.id, colors.primary)?.displayColor}
            disabled={busy}
            item={item}
            onPress={() => void choose(item.id)}
            testID={`chooser-item-${item.id}`}
          />
        ))}
        {visibleFolders.length === 0 && items.length === 0 ? (
          <Column
            spacing={6}
            style={{
              backgroundColor: colors.surfaceMuted,
              borderColor: colors.border,
              borderRadius: 14,
              borderWidth: 1,
              padding: 16,
              width: '100%',
            }}
          >
            <Text textStyle={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>
              Nothing available here
            </Text>
            <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
              Add an activity or routine to the catalog before choosing it.
            </Text>
          </Column>
        ) : null}
        <ChooserError message={error}>
          <RecoveryActions
            onClose={() => router.replace('/(tabs)')}
            onRetry={() => {
              if (lastChoice.current) void choose(lastChoice.current);
              else load();
            }}
            testID="chooser-action-recovery"
          />
        </ChooserError>
        <AppButton
          disabled={busy}
          label="Decide later"
          onPress={() => router.replace('/(tabs)')}
          style={{ height: 48, width: '100%' }}
          variant="outlined"
          testID="chooser-decide-later"
        />
      </Column>
    </Screen>
  );
}
