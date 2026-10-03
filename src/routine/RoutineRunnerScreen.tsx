import { DragHandle, ReorderableList } from '@ui/ReorderableList';
import { Column, Row, Text } from '@ui/primitives';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Circle, Svg } from 'react-native-svg';
import { Pressable, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import {
  formatCountdownMs,
  timestampMs,
  type ActiveRoutine,
  type CatalogCollection,
  type RoutineStepStatus,
} from '@domain';
import { AppIcon } from '@icons';
import { getAccessibleTextColor, useAppTheme } from '@theme';
import {
  AppButton,
  chooseAction,
  errorText,
  FormRow,
  FormSection,
  FormSheet,
  HeaderTextButton,
  Screen,
} from '@ui';
import { RecoveryActions } from '../orchestration/RecoveryActions';
import { goBackInAppStack, goHomeInAppStack } from '../navigation/app-back';

import { routineTiming } from './routine-engine';
import { orderedSteps, routineStepVisual, routineStyle, validHexColor } from './routine-visuals';
import { loadRoutineRuntime, type RoutineRuntime } from './routine-runtime';

export interface RoutineRunnerScreenProps {
  routineId: string;
}

interface RunnerPalette {
  background: string;
  circle: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  danger: string;
  errorCard: string;
  modalSheet: string;
}

const RUNNER_DARK: RunnerPalette = {
  background: '#070707',
  circle: '#111111',
  surface: '#171717',
  border: '#292929',
  text: '#F7F7F7',
  muted: '#969696',
  accent: '#B7F36B',
  accentText: '#101400',
  danger: '#FF9898',
  errorCard: '#271616',
  modalSheet: '#0D0D0D',
};

const RUNNER_LIGHT: RunnerPalette = {
  background: '#F5F5F5',
  circle: '#FFFFFF',
  surface: '#FFFFFF',
  border: '#D4D4D4',
  text: '#171717',
  muted: '#666666',
  accent: '#2F7A1F',
  accentText: '#FFFFFF',
  danger: '#B3261E',
  errorCard: '#F7E4E4',
  modalSheet: '#FFFFFF',
};

function runnerPalette(colorScheme: 'light' | 'dark'): RunnerPalette {
  return colorScheme === 'dark' ? RUNNER_DARK : RUNNER_LIGHT;
}

function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function elapsedLabel(durationMs: number): string {
  const minutes = Math.floor(durationMs / 60_000);
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

function stepStatusLabel(status: RoutineStepStatus): string {
  if (status === 'completed') return 'Completed';
  if (status === 'skipped') return 'Skipped';
  if (status === 'active') return 'Current';
  return 'Not started';
}

function compactDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function RunnerError({
  message,
  palette,
  title = 'Routine unavailable',
  children,
}: {
  message: string | null;
  palette: RunnerPalette;
  title?: string;
  children?: ReactNode;
}) {
  if (!message) return null;
  return (
    <View
      style={[
        styles.errorCard,
        { backgroundColor: palette.errorCard, borderColor: palette.border },
      ]}
    >
      <Text textStyle={{ color: palette.danger, fontSize: 16, fontWeight: '700' }}>{title}</Text>
      <Text textStyle={{ color: palette.danger, fontSize: 14 }}>{message}</Text>
      {children}
    </View>
  );
}

export function RoutineRunnerScreen({ routineId }: RoutineRunnerScreenProps) {
  const router = useRouter();
  const { colorScheme, colors } = useAppTheme();
  const BASE_RUNNER = runnerPalette(colorScheme);
  const { width } = useWindowDimensions();
  const [runtime, setRuntime] = useState<RoutineRuntime | null>(null);
  const [active, setActive] = useState<ActiveRoutine | null>(null);
  const [catalog, setCatalog] = useState<CatalogCollection | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [routineMenuOpen, setRoutineMenuOpen] = useState(false);
  const [timerAreaHeight, setTimerAreaHeight] = useState(0);
  const [adjustingTime, setAdjustingTime] = useState(false);
  const recovering = useRef(false);
  const reviewedHabitsForRun = useRef<string | null>(null);
  const lastAction = useRef<
    ((nextRuntime: RoutineRuntime) => Promise<ActiveRoutine | void>) | null
  >(null);

  const goBack = useCallback(() => goBackInAppStack(router, '/'), [router]);
  const goHome = useCallback(() => goHomeInAppStack(router), [router]);

  const routeRecovered = useCallback(
    (next: ActiveRoutine | null): boolean => {
      if (!next) {
        setLoadError('There is no active routine to resume.');
        return false;
      }
      if (next.routineId !== routineId) {
        setLoadError('The requested routine is not the persisted active routine.');
        return false;
      }
      if (next.status === 'awaiting-next-activity') {
        setActive(next);
        setLoadError(null);
        return true;
      }
      if (next.status !== 'running' && next.status !== 'paused') {
        setLoadError(`This routine is ${next.status}.`);
        return false;
      }
      setActive(next);
      setLoadError(null);
      return true;
    },
    [routineId]
  );

  const restore = useCallback(() => {
    let cancelled = false;
    setLoadError(null);
    void loadRoutineRuntime()
      .then(async (nextRuntime) => {
        const [restored, nextCatalog] = await Promise.all([
          nextRuntime.routineService.recover(),
          nextRuntime.catalogService.read(),
        ]);
        return { nextRuntime, nextCatalog, restored };
      })
      .then(({ nextRuntime, nextCatalog, restored }) => {
        if (cancelled) return;
        setNowMs(Date.now());
        setRuntime(nextRuntime);
        setCatalog(nextCatalog);
        routeRecovered(restored);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(errorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, [routeRecovered]);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void Promise.resolve().then(() => {
      if (!disposed) cleanup = restore();
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [restore]);

  useEffect(() => {
    if (!runtime) return undefined;
    const timer = setInterval(() => {
      setNowMs(Date.now());
      if (recovering.current || busy) return;
      recovering.current = true;
      void runtime.routineService
        .recover()
        .then(async (next) => {
          if (!next || !routeRecovered(next)) return;
          const alarm = await runtime.routineAlarmService.foregroundResume(next, Date.now());
          if (alarm.fired && alarm.stepId) {
            const persisted = await runtime.routineService.markAlarmFired(alarm.stepId);
            if (persisted.routineId === routineId) setActive(persisted);
          }
        })
        .catch((error: unknown) => setActionError(errorText(error)))
        .finally(() => {
          recovering.current = false;
        });
    }, 1000);
    return () => clearInterval(timer);
  }, [runtime, busy, routeRecovered, routineId]);

  const reviewHabitsAtEnd =
    catalog?.routines.find((routine) => routine.id === routineId)?.reviewHabitsAtEnd === true;
  useEffect(() => {
    if (!active || active.status !== 'awaiting-next-activity' || !reviewHabitsAtEnd) return;
    if (reviewedHabitsForRun.current === active.id) return;
    reviewedHabitsForRun.current = active.id;
    router.push('/habit-review?afterRoutine=1');
  }, [active, reviewHabitsAtEnd, router]);

  const runAction = async (
    action: (nextRuntime: RoutineRuntime) => Promise<ActiveRoutine | void>,
    onComplete?: (result: ActiveRoutine | void) => void
  ) => {
    if (!runtime) return;
    lastAction.current = action;
    setBusy(true);
    setActionError(null);
    try {
      if (runtime.settings.alarmSettings.enabled && runtime.settings.alarmSettings.sound) {
        try {
          await runtime.routineAlarmService.prepare();
        } catch (alarmError) {
          setActionError(`Routine alarm could not be prepared: ${errorText(alarmError)}`);
        }
      }
      const result = await action(runtime);
      if (result) setActive(result);
      onComplete?.(result);
    } catch (error) {
      setActionError(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const retry = () => {
    const action = lastAction.current;
    if (action) void runAction(action);
    else restore();
  };

  if (!active || !runtime) {
    return (
      <Screen
        backgroundColor={BASE_RUNNER.background}
        testID="routine-runner-screen"
        title="Routine"
      >
        <Column alignment="center" spacing={16} style={{ width: '100%' }}>
          <AppIcon name="timer" color={BASE_RUNNER.accent} size={40} />
          <Text textStyle={{ color: BASE_RUNNER.text, fontSize: 24, fontWeight: '700' }}>
            Routine runner
          </Text>
          {loadError ? (
            <RunnerError message={loadError} palette={BASE_RUNNER}>
              <RecoveryActions onClose={goBack} onRetry={restore} testID="routine-recovery" />
            </RunnerError>
          ) : (
            <Text
              testID="routine-runner-restoring"
              textStyle={{ color: BASE_RUNNER.muted, fontSize: 15 }}
            >
              Restoring routine…
            </Text>
          )}
        </Column>
      </Screen>
    );
  }

  if (active.status === 'awaiting-next-activity') {
    const steps = orderedSteps(active);
    const finishedMs = Math.max(
      0,
      (active.completedAt ? timestampMs(active.completedAt) : nowMs) -
        timestampMs(active.startedAt) -
        active.pausedDurationMs
    );
    const doneCount = active.stepSessions.filter(
      (session) => session.status === 'completed'
    ).length;
    const skippedCount = active.stepSessions.filter(
      (session) => session.status === 'skipped'
    ).length;
    const routineVisual = routineStyle(active, catalog, colors.primary);
    const finish = (destination: 'chooser' | 'tracker') =>
      void runAction(async (nextRuntime) => {
        if (destination === 'tracker') {
          await nextRuntime.routineService.selectNextActivity(null);
        } else {
          await nextRuntime.routineService.finalizeCompletion();
        }
        router.replace(destination === 'chooser' ? '/routine-chooser' : '/');
      });
    return (
      <Screen
        backgroundColor={BASE_RUNNER.background}
        onBack={goBack}
        scrollable={false}
        testID="routine-runner-screen"
      >
        <View style={styles.completionBody} testID="routine-completion">
          <View style={styles.completionHero}>
            <View style={[styles.completionBadge, { backgroundColor: routineVisual.accent }]}>
              <AppIcon
                color={getAccessibleTextColor(routineVisual.accent)}
                name="check"
                size={44}
                strokeWidth={3}
              />
            </View>
            <Text
              textStyle={{
                color: BASE_RUNNER.text,
                fontSize: 28,
                fontWeight: '800',
                textAlign: 'center',
              }}
            >
              {active.routineSnapshot.name}
            </Text>
            <Text
              testID="routine-completion-summary"
              textStyle={{ color: BASE_RUNNER.muted, fontSize: 17, textAlign: 'center' }}
            >
              {`Finished in ${elapsedLabel(finishedMs)} · ${doneCount} done${skippedCount > 0 ? `, ${skippedCount} skipped` : ''}`}
            </Text>
          </View>
          <View
            style={[
              styles.completionSteps,
              { backgroundColor: BASE_RUNNER.surface, borderColor: BASE_RUNNER.border },
            ]}
          >
            {steps
              .filter((step) => step.enabled !== false)
              .map((step, index, enabledSteps) => {
                const session = active.stepSessions.find(
                  (candidate) => candidate.stepId === step.id
                );
                const visual = routineStepVisual(
                  step,
                  active.routineSnapshot.trackingMode,
                  catalog,
                  colors.primary
                );
                const skipped = session?.status === 'skipped';
                const spentMs =
                  session?.startedAt && session.completedAt
                    ? timestampMs(session.completedAt) - timestampMs(session.startedAt)
                    : null;
                return (
                  <View key={step.id}>
                    <View style={styles.completionStep}>
                      <AppIcon
                        color={skipped ? BASE_RUNNER.muted : routineVisual.accent}
                        name={skipped ? 'skip-forward' : 'check-circle-2'}
                        size={20}
                      />
                      <Text
                        numberOfLines={1}
                        style={{ flex: 1 }}
                        textStyle={{
                          color: skipped ? BASE_RUNNER.muted : BASE_RUNNER.text,
                          fontSize: 16,
                          fontWeight: '600',
                        }}
                      >
                        {visual.name || 'Untitled step'}
                      </Text>
                      <Text
                        textStyle={{
                          color: BASE_RUNNER.muted,
                          fontSize: 15,
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        {skipped ? 'Skipped' : spentMs === null ? '—' : compactDuration(spentMs)}
                      </Text>
                    </View>
                    {index < enabledSteps.length - 1 ? (
                      <View style={[styles.hairline, { backgroundColor: BASE_RUNNER.border }]} />
                    ) : null}
                  </View>
                );
              })}
          </View>
          <View style={styles.flexSpacer} />
          {actionError ? (
            <RunnerError message={actionError} palette={BASE_RUNNER} title="Routine action failed">
              <RecoveryActions onClose={goBack} onRetry={retry} testID="routine-action-recovery" />
            </RunnerError>
          ) : null}
          <View style={styles.completionActions}>
            <AppButton
              disabled={busy}
              label="Start Next Activity"
              onPress={() => finish('chooser')}
              style={{ height: 56, width: '100%' }}
              testID="routine-completion-continue"
            />
            <AppButton
              disabled={busy}
              label="Done"
              onPress={() => finish('tracker')}
              style={{ height: 52, width: '100%' }}
              testID="routine-completion-done"
              variant="outlined"
            />
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => setRoutineMenuOpen(true)}
              style={({ pressed }) => [styles.completionLink, { opacity: pressed ? 0.6 : 1 }]}
              testID="routine-completion-review-steps"
            >
              <Text textStyle={{ color: BASE_RUNNER.muted, fontSize: 15, fontWeight: '600' }}>
                Redo a Step
              </Text>
            </Pressable>
          </View>
        </View>
        <RoutineStepsSheet
          active={active}
          baseColor={routineVisual.accent}
          busy={busy}
          catalog={catalog}
          onClose={() => setRoutineMenuOpen(false)}
          onJump={(stepId) =>
            void runAction(
              (nextRuntime) => nextRuntime.routineService.jumpToStep(stepId),
              () => setRoutineMenuOpen(false)
            )
          }
          onReorder={(ids) =>
            runAction((nextRuntime) => nextRuntime.routineService.reorderSteps(ids))
          }
          onToggle={(stepId, enabled) =>
            void runAction((nextRuntime) =>
              nextRuntime.routineService.setStepEnabled(stepId, enabled)
            )
          }
          visible={routineMenuOpen}
        />
      </Screen>
    );
  }

  const timing = routineTiming(active, nowMs);
  const steps = orderedSteps(active);
  const currentStep = steps[active.currentStepIndex];
  if (!currentStep) {
    return (
      <Screen
        backgroundColor={BASE_RUNNER.background}
        onBack={goBack}
        testID="routine-runner-screen"
        title={active.routineSnapshot.name}
      >
        <RunnerError message="The active routine has no current step." palette={BASE_RUNNER}>
          <RecoveryActions onClose={goBack} testID="routine-step-recovery" />
        </RunnerError>
      </Screen>
    );
  }

  const currentSession = active.stepSessions.find((session) => session.stepId === currentStep.id);
  const displayCountdown = timing.isOvertime
    ? `+${formatCountdownMs(timing.overtimeMs)}`
    : timing.remainingMs === null
      ? '—'
      : formatCountdownMs(timing.remainingMs);
  const runnableSteps = steps.filter((step) => step.enabled !== false);
  const runnableStepIndex = runnableSteps.findIndex((step) => step.id === currentStep.id);
  const upcomingSteps = steps
    .slice(active.currentStepIndex + 1)
    .filter(
      (step) =>
        step.enabled !== false &&
        active.stepSessions.find((session) => session.stepId === step.id)?.status === 'pending'
    );
  const nextStep = upcomingSteps[0];
  const upcomingMs = upcomingSteps.reduce(
    (total, step) =>
      total +
      step.durationMs +
      (active.stepSessions.find((session) => session.stepId === step.id)?.addedTimeMs ?? 0),
    0
  );
  const estimatedEndMs = nowMs + Math.max(0, timing.remainingMs ?? 0) + upcomingMs;
  const routineElapsedMs = Math.max(0, nowMs - timestampMs(active.startedAt));
  const circleSize = Math.max(
    0,
    Math.min(width - 56, 352, timerAreaHeight > 0 ? timerAreaHeight : width - 56)
  );
  const totalCurrentMs = currentStep.durationMs + (currentSession?.addedTimeMs ?? 0);
  const progress =
    timing.remainingMs === null ? 0 : Math.min(1, Math.max(0, timing.remainingMs / totalCurrentMs));
  const isPaused = active.status === 'paused';
  const pausedElapsedMs =
    isPaused && active.pausedAt ? Math.max(0, nowMs - timestampMs(active.pausedAt)) : 0;
  const isStepTracked = active.routineSnapshot.trackingMode === 'steps';
  const currentVisual = routineStepVisual(
    currentStep,
    active.routineSnapshot.trackingMode,
    catalog,
    colors.primary
  );
  const nextVisual = nextStep
    ? routineStepVisual(nextStep, active.routineSnapshot.trackingMode, catalog, colors.primary)
    : null;
  const routineVisual = routineStyle(active, catalog, colors.primary);
  const RUNNER: RunnerPalette = {
    ...BASE_RUNNER,
    accent: isStepTracked
      ? (validHexColor(currentVisual.color) ?? colors.primary)
      : routineVisual.accent,
    accentText: getAccessibleTextColor(
      isStepTracked ? (validHexColor(currentVisual.color) ?? colors.primary) : routineVisual.accent
    ),
  };
  const fallbackIcon = isStepTracked ? 'activity' : routineVisual.iconName;
  const currentIcon = currentVisual.iconName || fallbackIcon;
  const nextIcon = nextVisual?.iconName || fallbackIcon;
  const nextIconColor = isStepTracked
    ? (validHexColor(nextVisual?.color) ?? colors.primary)
    : RUNNER.accent;
  const controlSizes =
    width < 380
      ? { stop: 50, addTime: 52, complete: 74, pause: 52, skip: 52 }
      : { stop: 54, addTime: 56, complete: 80, pause: 56, skip: 56 };
  const currentName = currentVisual.name || 'Current step';

  const skipStep = () =>
    void chooseAction({
      actions: [
        { label: 'Skip Step' },
        { label: 'Do It Last' },
        { destructive: true, label: 'Skip and Turn Off for Future Runs' },
      ],
      title: `Skip ${currentName}?`,
    }).then((index) => {
      if (index === 0) void runAction((nextRuntime) => nextRuntime.routineService.skip());
      if (index === 1)
        void runAction((nextRuntime) => nextRuntime.routineService.moveCurrentStepToEnd());
      if (index === 2)
        void runAction((nextRuntime) =>
          nextRuntime.routineService.skipAndDisableStep(currentStep.id)
        );
    });

  const stopRoutine = () => {
    const allowReplace = active.routineSnapshot.trackingMode === 'overall';
    void chooseAction({
      actions: [
        { label: 'Back to Home, Keep Running' },
        { destructive: true, label: 'Stop and Choose Next Activity' },
        ...(allowReplace ? [{ label: 'Log Whole Run as Something Else' }] : []),
      ],
      message: 'Stopping keeps the time tracked so far.',
      title: active.routineSnapshot.name,
    }).then((index) => {
      if (index === 0) {
        goHome();
      } else if (index === 1) {
        void runAction(async (nextRuntime) => {
          const boundary = await nextRuntime.routineService.stopAndSwitch();
          router.replace(
            `/activity-session/activity-chooser?transitionId=${encodeURIComponent(boundary.id)}&returnToTracker=1`
          );
        });
      } else if (index === 2) {
        router.push(
          `/activity-session/activity-chooser?routineId=${encodeURIComponent(active.routineId)}`
        );
      }
    });
  };

  return (
    <Screen backgroundColor={RUNNER.background} scrollable={false} testID="routine-runner-screen">
      <View style={styles.runnerBody}>
        <View style={styles.stats} testID="routine-run-stats">
          <RunStat
            label="Elapsed"
            palette={RUNNER}
            testID="routine-elapsed"
            value={elapsedLabel(routineElapsedMs)}
          />
          <View style={[styles.statDivider, { backgroundColor: RUNNER.border }]} />
          <RunStat
            label="Ends around"
            palette={RUNNER}
            testID="routine-estimated-end"
            value={clockTime(estimatedEndMs)}
          />
        </View>

        <View
          onLayout={(event) => setTimerAreaHeight(Math.floor(event.nativeEvent.layout.height))}
          style={styles.timerArea}
        >
          {circleSize > 0 ? (
            <View style={[styles.timerWrap, { height: circleSize, width: circleSize }]}>
              <View
                style={[
                  styles.timerCircle,
                  isPaused && styles.timerCirclePaused,
                  {
                    backgroundColor: RUNNER.circle,
                    borderColor: RUNNER.border,
                    borderRadius: circleSize / 2,
                    gap: circleSize < 300 ? 8 : 13,
                    height: circleSize,
                    width: circleSize,
                  },
                ]}
                testID="current-routine-step"
              >
                {!isPaused ? (
                  <>
                    <View style={[styles.currentStepName, { maxWidth: circleSize - 88 }]}>
                      <Text
                        numberOfLines={2}
                        textStyle={{
                          color: RUNNER.text,
                          fontSize: 22,
                          fontWeight: '700',
                          lineHeight: 26,
                          textAlign: 'center',
                        }}
                        testID="routine-current-step-name"
                      >
                        {currentName}
                      </Text>
                    </View>
                    <AppIcon
                      name={currentIcon}
                      color={RUNNER.accent}
                      size={Math.round(Math.min(62, circleSize / 5.5))}
                    />
                    <Text
                      textStyle={{
                        color: timing.isOvertime ? RUNNER.danger : RUNNER.text,
                        fontSize: Math.min(60, Math.max(40, circleSize / 6)),
                        fontVariant: ['tabular-nums'],
                        fontWeight: '800',
                        letterSpacing: -1,
                        textAlign: 'center',
                      }}
                      testID="routine-countdown"
                    >
                      {displayCountdown}
                    </Text>
                  </>
                ) : null}
              </View>
              {isPaused ? (
                <View style={styles.pausedOverlay} testID="routine-paused-state">
                  <View style={{ maxWidth: circleSize - 88 }}>
                    <Text
                      numberOfLines={2}
                      textStyle={{
                        color: RUNNER.text,
                        fontSize: 21,
                        fontWeight: '700',
                        lineHeight: 25,
                        textAlign: 'center',
                      }}
                    >
                      {currentName}
                    </Text>
                  </View>
                  <Text textStyle={{ color: RUNNER.muted, fontSize: 14, fontWeight: '700' }}>
                    Paused for
                  </Text>
                  <Text
                    textStyle={{
                      color: RUNNER.text,
                      fontSize: Math.min(56, Math.max(40, circleSize / 6.5)),
                      fontVariant: ['tabular-nums'],
                      fontWeight: '800',
                      letterSpacing: -1,
                    }}
                    testID="routine-paused-elapsed"
                  >
                    {formatCountdownMs(pausedElapsedMs)}
                  </Text>
                  <View style={styles.pausedRemaining} testID="routine-paused-remaining">
                    <Text textStyle={{ color: RUNNER.muted, fontSize: 12, fontWeight: '700' }}>
                      Step time remaining
                    </Text>
                    <Text textStyle={{ color: RUNNER.muted, fontSize: 17, fontWeight: '700' }}>
                      {displayCountdown}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel="Resume routine"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: busy }}
                    disabled={busy}
                    onPress={() =>
                      void runAction((nextRuntime) => nextRuntime.routineService.resume())
                    }
                    style={({ pressed }) => [
                      styles.resumeButton,
                      {
                        backgroundColor: RUNNER.accent,
                        opacity: busy ? 0.4 : pressed ? 0.75 : 1,
                      },
                    ]}
                    testID="routine-resume"
                  >
                    <AppIcon color={RUNNER.accentText} name="play" size={18} strokeWidth={2.8} />
                    <Text textStyle={{ color: RUNNER.accentText, fontSize: 15, fontWeight: '800' }}>
                      Resume
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              <ProgressRing palette={RUNNER} progress={progress} size={circleSize} />
            </View>
          ) : null}
        </View>

        {actionError ? (
          <RunnerError message={actionError} palette={RUNNER} title="Routine action failed">
            <RecoveryActions onClose={goBack} onRetry={retry} testID="routine-action-recovery" />
          </RunnerError>
        ) : null}

        {adjustingTime && !isPaused ? (
          <TimeAdjustPanel
            addedTimeMs={currentSession?.addedTimeMs ?? 0}
            busy={busy}
            onAdd={(deltaMs) =>
              void runAction((nextRuntime) => nextRuntime.routineService.addTime(deltaMs))
            }
            onClose={() => setAdjustingTime(false)}
            onReset={() => void runAction((nextRuntime) => nextRuntime.routineService.resetTime())}
            originalDurationMs={currentStep.durationMs}
            palette={RUNNER}
            stepName={currentName}
          />
        ) : (
          <>
            <View style={styles.nextRow} testID="routine-next-step">
              {nextStep ? (
                <>
                  <Text textStyle={{ color: RUNNER.muted, fontSize: 15, fontWeight: '500' }}>
                    Up next
                  </Text>
                  <AppIcon name={nextIcon} color={nextIconColor} size={18} />
                  <Text
                    numberOfLines={1}
                    style={{ flexShrink: 1 }}
                    textStyle={{ color: RUNNER.text, fontSize: 16, fontWeight: '600' }}
                  >
                    {nextVisual?.name || 'Untitled step'}
                  </Text>
                  <Text textStyle={{ color: RUNNER.muted, fontSize: 15 }}>
                    {compactDuration(nextStep.durationMs)}
                  </Text>
                </>
              ) : (
                <Text textStyle={{ color: RUNNER.muted, fontSize: 15, fontWeight: '600' }}>
                  Last step
                </Text>
              )}
            </View>

            <Row alignment="center" style={styles.controlRow}>
              <RoundControl
                disabled={busy}
                icon="square"
                label="Stop routine"
                onPress={stopRoutine}
                palette={RUNNER}
                size={controlSizes.stop}
                testID="stop-routine"
              />
              <RoundControl
                disabled={busy || isPaused}
                icon="pause"
                label="Pause routine"
                onPress={() => void runAction((nextRuntime) => nextRuntime.routineService.pause())}
                palette={RUNNER}
                size={controlSizes.pause}
                testID="routine-pause"
              />
              <RoundControl
                disabled={busy || isPaused}
                emphasis
                icon="arrow-right"
                label="Complete current step"
                onPress={() => void runAction((nextRuntime) => nextRuntime.routineService.done())}
                palette={RUNNER}
                size={controlSizes.complete}
                testID="routine-done"
              />
              <RoundControl
                disabled={busy || isPaused}
                icon="clock"
                label="Adjust time"
                onPress={() => setAdjustingTime(true)}
                palette={RUNNER}
                size={controlSizes.addTime}
                testID="open-add-time"
              />
              <RoundControl
                disabled={busy || isPaused}
                icon="skip-forward"
                label="Skip or move current step"
                onPress={skipStep}
                palette={RUNNER}
                size={controlSizes.skip}
                testID="routine-skip"
              />
            </Row>

            <Pressable
              accessibilityLabel={`Open ${active.routineSnapshot.name} steps, step ${runnableStepIndex + 1} of ${runnableSteps.length}`}
              accessibilityRole="button"
              onPress={() => setRoutineMenuOpen(true)}
              style={({ pressed }) => [
                styles.stepCounter,
                {
                  backgroundColor: RUNNER.surface,
                  borderColor: RUNNER.border,
                  opacity: pressed ? 0.68 : 1,
                },
              ]}
              testID="open-routine-steps"
            >
              <AppIcon name="list-checks" color={RUNNER.accent} size={18} />
              <Text
                numberOfLines={1}
                style={{ flexShrink: 1 }}
                testID="routine-runner-name"
                textStyle={{ color: RUNNER.muted, fontSize: 15, fontWeight: '600' }}
              >
                {active.routineSnapshot.name}
              </Text>
              <View style={[styles.stepCounterDivider, { backgroundColor: RUNNER.border }]} />
              <Text textStyle={{ color: RUNNER.text, fontSize: 16, fontWeight: '700' }}>
                {`Step ${runnableStepIndex + 1} of ${runnableSteps.length}`}
              </Text>
              <AppIcon name="chevron-up" color={RUNNER.muted} size={16} />
            </Pressable>
          </>
        )}
      </View>

      <RoutineStepsSheet
        active={active}
        baseColor={routineVisual.accent}
        busy={busy}
        catalog={catalog}
        onClose={() => setRoutineMenuOpen(false)}
        onJump={(stepId) =>
          void runAction(
            (nextRuntime) => nextRuntime.routineService.jumpToStep(stepId),
            () => setRoutineMenuOpen(false)
          )
        }
        onReorder={(ids) =>
          runAction((nextRuntime) => nextRuntime.routineService.reorderSteps(ids))
        }
        onToggle={(stepId, enabled) =>
          void runAction((nextRuntime) =>
            nextRuntime.routineService.setStepEnabled(stepId, enabled)
          )
        }
        visible={routineMenuOpen}
      />
    </Screen>
  );
}

function RunStat({
  label,
  palette,
  testID,
  value,
}: {
  label: string;
  palette: RunnerPalette;
  testID: string;
  value: string;
}) {
  return (
    <View accessible accessibilityLabel={`${label}, ${value}`} style={styles.stat} testID={testID}>
      <Text textStyle={{ color: palette.muted, fontSize: 14, fontWeight: '500' }}>{label}</Text>
      <Text
        textStyle={{
          color: palette.text,
          fontSize: 19,
          fontVariant: ['tabular-nums'],
          fontWeight: '700',
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function ProgressRing({
  progress,
  size,
  palette,
}: {
  progress: number;
  size: number;
  palette: RunnerPalette;
}) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <Svg
      height={size}
      style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}
      viewBox={`0 0 ${size} ${size}`}
      width={size}
    >
      <Circle
        cx={size / 2}
        cy={size / 2}
        fill="none"
        opacity={0.22}
        r={radius}
        stroke={palette.border}
        strokeWidth={strokeWidth}
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        fill="none"
        r={radius}
        stroke={palette.accent}
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={circumference * (1 - progress)}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

function RoundControl({
  disabled,
  emphasis = false,
  icon,
  label,
  onPress,
  palette,
  size,
  testID,
}: {
  disabled: boolean;
  emphasis?: boolean;
  icon:
    | 'arrow-right'
    | 'check'
    | 'clock'
    | 'list-checks'
    | 'pause'
    | 'play'
    | 'skip-forward'
    | 'square';
  label: string;
  onPress: () => void;
  palette: RunnerPalette;
  size: number;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        backgroundColor: emphasis ? palette.accent : palette.surface,
        borderColor: emphasis ? palette.accent : palette.border,
        borderRadius: size / 2,
        borderWidth: 1,
        height: size,
        justifyContent: 'center',
        opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
        width: size,
      })}
      testID={testID}
    >
      <AppIcon
        color={emphasis ? palette.accentText : palette.text}
        name={icon}
        size={emphasis ? 32 : 24}
        strokeWidth={2.6}
      />
    </Pressable>
  );
}

const TIME_ADJUSTMENTS = [
  { label: '−1 min', value: -60_000 },
  { label: '+1 min', value: 60_000 },
  { label: '+5 min', value: 300_000 },
  { label: '+10 min', value: 600_000 },
] as const;

function TimeAdjustPanel({
  addedTimeMs,
  busy,
  onAdd,
  onClose,
  onReset,
  originalDurationMs,
  palette,
  stepName,
}: {
  addedTimeMs: number;
  busy: boolean;
  onAdd: (deltaMs: number) => void;
  onClose: () => void;
  onReset: () => void;
  originalDurationMs: number;
  palette: RunnerPalette;
  stepName: string;
}) {
  const totalMs = originalDurationMs + addedTimeMs;
  return (
    <Animated.View
      entering={FadeInDown.duration(180)}
      style={[styles.timePanel, { backgroundColor: palette.surface, borderColor: palette.border }]}
      testID="routine-time-panel"
    >
      <View style={styles.timePanelHeader}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text textStyle={{ color: palette.text, fontSize: 17, fontWeight: '700' }}>
            Adjust time
          </Text>
          <Text numberOfLines={1} textStyle={{ color: palette.muted, fontSize: 14 }}>
            {`${stepName} · ${compactDuration(totalMs)}${
              addedTimeMs === 0
                ? ''
                : ` (${addedTimeMs > 0 ? '+' : '−'}${compactDuration(Math.abs(addedTimeMs))})`
            }`}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={onClose}
          style={({ pressed }) => [
            styles.timePanelDone,
            { backgroundColor: palette.accent, opacity: pressed ? 0.75 : 1 },
          ]}
          testID="routine-time-panel-done"
        >
          <Text textStyle={{ color: palette.accentText, fontSize: 15, fontWeight: '700' }}>
            Done
          </Text>
        </Pressable>
      </View>
      <View style={styles.timePanelButtons}>
        {TIME_ADJUSTMENTS.map((option) => {
          const disabled = busy || (option.value < 0 && addedTimeMs < 60_000);
          return (
            <Pressable
              key={option.value}
              accessibilityLabel={
                option.value < 0
                  ? 'Remove 1 minute'
                  : `Add ${option.value / 60_000} minute${option.value === 60_000 ? '' : 's'}`
              }
              accessibilityRole="button"
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => onAdd(option.value)}
              style={({ pressed }) => [
                styles.timePanelButton,
                {
                  backgroundColor: palette.background,
                  borderColor: palette.border,
                  opacity: disabled ? 0.35 : pressed ? 0.6 : 1,
                },
              ]}
              testID={`add-time-${option.value}`}
            >
              <Text
                textStyle={{
                  color: palette.text,
                  fontSize: 17,
                  fontVariant: ['tabular-nums'],
                  fontWeight: '700',
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={busy || addedTimeMs === 0}
        onPress={onReset}
        style={({ pressed }) => [
          styles.timePanelReset,
          { opacity: addedTimeMs === 0 ? 0.35 : pressed ? 0.6 : 1 },
        ]}
        testID="reset-time-original"
      >
        <Text textStyle={{ color: palette.muted, fontSize: 15, fontWeight: '600' }}>
          {`Reset to ${compactDuration(originalDurationMs)}`}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function RoutineStepsSheet({
  active,
  baseColor,
  busy,
  catalog,
  onClose,
  onJump,
  onReorder,
  onToggle,
  visible,
}: {
  active: ActiveRoutine;
  baseColor: string;
  busy: boolean;
  catalog: CatalogCollection | null;
  onClose: () => void;
  onJump: (stepId: string) => void;
  onReorder: (ids: string[]) => Promise<unknown>;
  onToggle: (stepId: string, enabled: boolean) => void;
  visible: boolean;
}) {
  const { colors } = useAppTheme();
  const [editing, setEditing] = useState(false);
  const steps = orderedSteps(active);
  const enabledSteps = steps.filter((step) => step.enabled !== false);
  const finishedCount = enabledSteps.filter((step) => {
    const status = active.stepSessions.find((session) => session.stepId === step.id)?.status;
    return status === 'completed' || status === 'skipped';
  }).length;
  return (
    <FormSheet
      onClose={() => {
        setEditing(false);
        onClose();
      }}
      testID="routine-steps-sheet"
      title="Steps"
      visible={visible}
    >
      <FormSection
        footer={
          editing
            ? 'Steps you turn off are skipped in this run and future runs.'
            : 'Tap a step to go to it.'
        }
        headerAction={
          <HeaderTextButton
            compact
            label={editing ? 'Done Editing' : 'Edit'}
            onPress={() => setEditing((current) => !current)}
            testID="routine-steps-edit"
          />
        }
        title={`${finishedCount} of ${enabledSteps.length} finished`}
      >
        <ReorderableList
          items={steps}
          getId={(step) => step.id}
          enabled={editing && !busy}
          onReorder={onReorder}
          renderItem={(step) => {
            const visual = routineStepVisual(
              step,
              active.routineSnapshot.trackingMode,
              catalog,
              baseColor
            );
            const session = active.stepSessions.find((candidate) => candidate.stepId === step.id);
            const status = session?.status ?? 'pending';
            const enabled = step.enabled !== false;
            const current = status === 'active';
            const stepColor = validHexColor(visual.color) ?? baseColor;
            const name = visual.name || 'Untitled step';
            const leading =
              status === 'completed' ? (
                <AppIcon color={stepColor} name="check-circle-2" size={22} />
              ) : status === 'skipped' ? (
                <AppIcon color={colors.textMuted} name="skip-forward" size={20} />
              ) : (
                <AppIcon
                  color={current ? stepColor : colors.textMuted}
                  name={visual.iconName || 'circle'}
                  size={21}
                />
              );
            return (
              <FormRow
                key={step.id}
                accessibilityLabel={`${name}, ${enabled ? stepStatusLabel(status) : 'Turned off'}`}
                label={name}
                leading={leading}
                muted={!enabled || status === 'skipped'}
                onPress={
                  !editing && enabled && !current && !busy ? () => onJump(step.id) : undefined
                }
                subtitle={`${compactDuration(step.durationMs + (session?.addedTimeMs ?? 0))}${
                  enabled
                    ? status === 'pending' || current
                      ? ''
                      : ` · ${stepStatusLabel(status)}`
                    : ' · Off'
                }`}
                testID={`routine-jump-step-${step.id}`}
                trailing={
                  editing ? (
                    <View style={styles.stepEditActions}>
                      <Switch
                        accessibilityLabel={`${enabled ? 'Turn off' : 'Turn on'} ${name}`}
                        disabled={busy || current}
                        onValueChange={(next) => onToggle(step.id, next)}
                        testID={`routine-toggle-step-${step.id}`}
                        value={enabled}
                      />
                      <DragHandle
                        disabled={busy}
                        label={`Reorder ${name}`}
                        testID={`routine-reorder-drag-${step.id}`}
                      />
                    </View>
                  ) : current ? (
                    <Text textStyle={{ color: stepColor, fontSize: 15, fontWeight: '700' }}>
                      Now
                    </Text>
                  ) : undefined
                }
              />
            );
          }}
        />
      </FormSection>
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  runnerBody: { flex: 1, gap: 16, minHeight: 0, width: '100%' },
  stats: { flexDirection: 'row', width: '100%' },
  stat: { alignItems: 'center', flex: 1, gap: 2 },
  statDivider: { width: StyleSheet.hairlineWidth },
  timerArea: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 0,
    width: '100%',
  },
  timerWrap: { position: 'relative' },
  timerCircle: {
    alignItems: 'center',
    borderWidth: 1,
    justifyContent: 'center',
    padding: 22,
  },
  timerCirclePaused: { opacity: 0.45 },
  currentStepName: { alignItems: 'center', width: '100%' },
  pausedOverlay: {
    alignItems: 'center',
    bottom: 0,
    gap: 10,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  pausedRemaining: { alignItems: 'center', gap: 2, marginBottom: 2 },
  resumeButton: {
    alignItems: 'center',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 20,
  },
  nextRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 24,
    width: '100%',
  },
  controlRow: { justifyContent: 'space-between', width: '100%' },
  stepCounter: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    maxWidth: '100%',
    minHeight: 46,
    paddingHorizontal: 16,
  },
  stepCounterDivider: { height: 18, width: StyleSheet.hairlineWidth * 2 },
  errorCard: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 7,
    padding: 14,
    width: '100%',
  },
  stepEditActions: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  completionBody: { flex: 1, gap: 20, minHeight: 0, paddingTop: 8, width: '100%' },
  completionHero: { alignItems: 'center', gap: 10, width: '100%' },
  completionBadge: {
    alignItems: 'center',
    borderRadius: 44,
    height: 88,
    justifyContent: 'center',
    marginBottom: 6,
    width: 88,
  },
  completionSteps: {
    borderRadius: 16,
    borderWidth: 1,
    flexShrink: 1,
    overflow: 'hidden',
    width: '100%',
  },
  completionStep: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 50,
    paddingHorizontal: 16,
  },
  hairline: { height: StyleSheet.hairlineWidth, marginLeft: 48 },
  flexSpacer: { flex: 1 },
  completionActions: { gap: 10, width: '100%' },
  completionLink: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  timePanel: { borderRadius: 24, borderWidth: 1, gap: 14, padding: 16, width: '100%' },
  timePanelHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  timePanelDone: {
    alignItems: 'center',
    borderRadius: 18,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 16,
  },
  timePanelButtons: { flexDirection: 'row', gap: 8 },
  timePanelButton: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 54,
  },
  timePanelReset: { alignItems: 'center', justifyContent: 'center', minHeight: 32 },
});
