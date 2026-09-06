import { Column, Row, Text } from '@expo/ui';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Circle, Svg } from 'react-native-svg';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatCountdownMs, type ActiveRoutine, type RoutineStepStatus } from '@domain';
import { AppIcon } from '@icons';
import { errorText, IconButton, Screen } from '@ui';
import { RecoveryActions } from '../orchestration/RecoveryActions';

import { routineTiming } from './routine-engine';
import { loadRoutineRuntime, type RoutineRuntime } from './routine-runtime';

export interface RoutineRunnerScreenProps {
  routineId: string;
}

const RUNNER = {
  background: '#070707',
  circle: '#111111',
  surface: '#171717',
  border: '#292929',
  text: '#F7F7F7',
  muted: '#969696',
  accent: '#B7F36B',
  accentText: '#101400',
  danger: '#FF9898',
};

function absoluteTime(timestamp: string | null): string {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function statusColor(status: RoutineStepStatus): string {
  if (status === 'completed' || status === 'active') return RUNNER.accent;
  if (status === 'skipped') return RUNNER.muted;
  return RUNNER.border;
}

function stepStatusLabel(status: RoutineStepStatus): string {
  if (status === 'completed') return 'Completed';
  if (status === 'skipped') return 'Skipped';
  if (status === 'active') return 'Current';
  return 'Not started';
}

function orderedSteps(active: ActiveRoutine) {
  return [...active.routineSnapshot.steps].sort((left, right) => left.sortOrder - right.sortOrder);
}

function RunnerError({
  message,
  title = 'Routine unavailable',
  children,
}: {
  message: string | null;
  title?: string;
  children?: ReactNode;
}) {
  if (!message) return null;
  return (
    <View style={styles.errorCard}>
      <Text textStyle={{ color: RUNNER.danger, fontSize: 16, fontWeight: '700' }}>{title}</Text>
      <Text textStyle={{ color: RUNNER.danger, fontSize: 14 }}>{message}</Text>
      {children}
    </View>
  );
}

export function RoutineRunnerScreen({ routineId }: RoutineRunnerScreenProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [runtime, setRuntime] = useState<RoutineRuntime | null>(null);
  const [active, setActive] = useState<ActiveRoutine | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [routineMenuOpen, setRoutineMenuOpen] = useState(false);
  const [addTimeOpen, setAddTimeOpen] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const recovering = useRef(false);
  const lastAction = useRef<
    ((nextRuntime: RoutineRuntime) => Promise<ActiveRoutine | void>) | null
  >(null);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);

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
        router.replace('/routine-chooser');
        return false;
      }
      if (next.status !== 'running' && next.status !== 'paused') {
        setLoadError(`This routine is ${next.status}.`);
        return false;
      }
      setActive(next);
      setLoadError(null);
      return true;
    },
    [router, routineId]
  );

  const restore = useCallback(() => {
    let cancelled = false;
    setLoadError(null);
    void loadRoutineRuntime()
      .then(async (nextRuntime) => {
        const restored = await nextRuntime.routineService.recover();
        return { nextRuntime, restored };
      })
      .then(({ nextRuntime, restored }) => {
        if (cancelled) return;
        setNowMs(Date.now());
        setRuntime(nextRuntime);
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

  const finalizeCompletion = async (nextRuntime: RoutineRuntime): Promise<void> => {
    await nextRuntime.routineService.finalizeCompletion();
    router.replace('/routine-chooser');
  };

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
      if (result) {
        if (result.status === 'awaiting-next-activity') {
          lastAction.current = finalizeCompletion;
          await finalizeCompletion(runtime);
        } else {
          setActive(result);
        }
      }
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
        backgroundColor={RUNNER.background}
        onBack={goBack}
        scrollable={false}
        title="Routine"
      >
        <Column alignment="center" spacing={16} style={{ width: '100%' }}>
          <AppIcon name="timer" color={RUNNER.accent} size={40} />
          <Text textStyle={{ color: RUNNER.text, fontSize: 24, fontWeight: '700' }}>
            Routine runner
          </Text>
          <RunnerError message={loadError ?? 'Restoring the persisted routine...'}>
            <RecoveryActions onBack={goBack} onRetry={restore} testID="routine-recovery" />
          </RunnerError>
        </Column>
      </Screen>
    );
  }

  const timing = routineTiming(active, nowMs);
  const steps = orderedSteps(active);
  const currentStep = steps[active.currentStepIndex];
  if (!currentStep) {
    return (
      <Screen
        backgroundColor={RUNNER.background}
        onBack={goBack}
        scrollable={false}
        title="Routine"
      >
        <RunnerError message="The active routine has no current step.">
          <RecoveryActions onBack={goBack} testID="routine-step-recovery" />
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
  const nextStep = steps[active.currentStepIndex + 1];
  const circleSize = Math.min(Math.max(width - 56, 268), 352);
  const totalCurrentMs = currentStep.durationMs + (currentSession?.addedTimeMs ?? 0);
  const progress =
    timing.remainingMs === null ? 0 : Math.min(1, Math.max(0, timing.remainingMs / totalCurrentMs));

  return (
    <Screen backgroundColor={RUNNER.background} scrollable testID="routine-runner">
      <Column spacing={18} style={styles.runnerContent}>
        <Row alignment="center" spacing={10} style={styles.headerRow}>
          <IconButton
            accessibilityHint="Returns to the previous screen"
            color={RUNNER.text}
            icon="arrow-left"
            label="Back"
            onPress={goBack}
            variant="plain"
          />
          <View style={styles.headerText}>
            <Column spacing={2}>
              <Text
                numberOfLines={1}
                textStyle={{ color: RUNNER.muted, fontSize: 13, fontWeight: '600' }}
              >
                {active.routineSnapshot.name}
              </Text>
              <Text
                numberOfLines={2}
                textStyle={{ color: RUNNER.text, fontSize: 30, fontWeight: '800', lineHeight: 34 }}
              >
                {currentStep.name || 'Current step'}
              </Text>
            </Column>
          </View>
          <Pressable
            accessibilityLabel="Stop routine"
            accessibilityRole="button"
            disabled={busy}
            onPress={() => setStopOpen(true)}
            style={({ pressed }) => [styles.stopButton, { opacity: pressed || busy ? 0.65 : 1 }]}
            testID="stop-routine"
          >
            <Text textStyle={{ color: RUNNER.muted, fontSize: 14, fontWeight: '700' }}>Stop</Text>
          </Pressable>
        </Row>

        <Row alignment="center" spacing={10} style={styles.timeRange}>
          <Text textStyle={{ color: RUNNER.muted, fontSize: 15 }}>
            {absoluteTime(currentSession?.startedAt ?? active.currentStepStartedAt)}
          </Text>
          <Text textStyle={{ color: RUNNER.muted, fontSize: 17 }}>→</Text>
          <Text textStyle={{ color: RUNNER.muted, fontSize: 15 }}>
            {absoluteTime(timing.deadlineAt)}
          </Text>
        </Row>

        <View style={[styles.timerWrap, { height: circleSize, width: circleSize }]}>
          <View
            style={[
              styles.timerCircle,
              { height: circleSize, width: circleSize, borderRadius: circleSize / 2 },
            ]}
            testID="current-routine-step"
          >
            <Pressable
              accessibilityLabel={`Open routine steps, step ${active.currentStepIndex + 1} of ${steps.length}`}
              accessibilityRole="button"
              onPress={() => setRoutineMenuOpen(true)}
              style={({ pressed }) => [styles.stepToggle, { opacity: pressed ? 0.7 : 1 }]}
              testID="open-routine-steps"
            >
              <AppIcon name="list-checks" color={RUNNER.accent} size={17} />
              <Text textStyle={{ color: RUNNER.muted, fontSize: 12, fontWeight: '700' }}>
                {`Step ${active.currentStepIndex + 1} of ${steps.length}`}
              </Text>
              <AppIcon name="chevron-down" color={RUNNER.muted} size={16} />
            </Pressable>
            <AppIcon name={currentStep.iconName || 'timer'} color={RUNNER.accent} size={70} />
            <Text
              textStyle={{
                color: timing.isOvertime ? RUNNER.danger : RUNNER.text,
                fontSize: Math.min(60, Math.max(46, circleSize / 6)),
                fontWeight: '800',
                letterSpacing: -1,
                textAlign: 'center',
              }}
              testID="routine-countdown"
            >
              {displayCountdown}
            </Text>
          </View>
          <ProgressRing progress={progress} size={circleSize} />
        </View>

        {actionError ? (
          <RunnerError message={actionError} title="Routine action failed">
            <RecoveryActions onBack={goBack} onRetry={retry} testID="routine-action-recovery" />
          </RunnerError>
        ) : null}

        <Row alignment="center" style={styles.controlRow}>
          <RoundControl
            disabled={busy}
            icon="clock"
            label="Add time"
            onPress={() => setAddTimeOpen(true)}
            size={52}
            testID="open-add-time"
          />
          <RoundControl
            disabled={busy}
            icon={active.status === 'paused' ? 'play' : 'pause'}
            label={active.status === 'paused' ? 'Resume routine' : 'Pause routine'}
            onPress={() =>
              void runAction((nextRuntime) =>
                active.status === 'paused'
                  ? nextRuntime.routineService.resume()
                  : nextRuntime.routineService.pause()
              )
            }
            size={58}
            testID={active.status === 'paused' ? 'routine-resume' : 'routine-pause'}
          />
          <RoundControl
            disabled={busy || active.status === 'paused'}
            emphasis
            icon="check"
            label="Complete current step"
            onPress={() => void runAction((nextRuntime) => nextRuntime.routineService.done())}
            size={78}
            testID="routine-done"
          />
          <RoundControl
            disabled={busy || active.status === 'paused'}
            icon="skip-forward"
            label="Skip or move current step"
            onPress={() => setSkipOpen(true)}
            size={58}
            testID="routine-skip"
          />
          <RoundControl
            disabled={busy}
            icon="list-checks"
            label="Rearrange routine steps"
            onPress={() => setRoutineMenuOpen(true)}
            size={52}
            testID="open-routine-rearrange"
          />
        </Row>

        {nextStep ? (
          <Row alignment="center" spacing={10} style={styles.nextRow}>
            <Text textStyle={{ color: RUNNER.muted, fontSize: 11, fontWeight: '700' }}>Next</Text>
            <AppIcon name={nextStep.iconName || 'timer'} color={RUNNER.muted} size={17} />
            <Text numberOfLines={1} textStyle={{ color: RUNNER.muted, fontSize: 15 }}>
              {nextStep.name || 'Untitled step'}
            </Text>
          </Row>
        ) : null}
      </Column>

      <RoutineStepsModal
        active={active}
        busy={busy}
        onClose={() => setRoutineMenuOpen(false)}
        onJump={(stepId) =>
          void runAction(
            (nextRuntime) => nextRuntime.routineService.jumpToStep(stepId),
            () => setRoutineMenuOpen(false)
          )
        }
        onMove={(stepId, direction) =>
          void runAction((nextRuntime) => nextRuntime.routineService.reorderStep(stepId, direction))
        }
        visible={routineMenuOpen}
      />
      <AddTimeModal
        busy={busy}
        onAdd={(addedTimeMs) =>
          void runAction(
            (nextRuntime) => nextRuntime.routineService.addTime(addedTimeMs),
            () => setAddTimeOpen(false)
          )
        }
        onClose={() => setAddTimeOpen(false)}
        visible={addTimeOpen}
      />
      <SkipModal
        busy={busy}
        onClose={() => setSkipOpen(false)}
        onMoveToEnd={() =>
          void runAction(
            (nextRuntime) => nextRuntime.routineService.moveCurrentStepToEnd(),
            () => setSkipOpen(false)
          )
        }
        onSkip={() =>
          void runAction(
            (nextRuntime) => nextRuntime.routineService.skip(),
            () => setSkipOpen(false)
          )
        }
        visible={skipOpen}
      />
      <StopModal
        busy={busy}
        onClose={() => setStopOpen(false)}
        onStop={() =>
          void runAction(
            async (nextRuntime) => {
              await nextRuntime.routineService.cancelAndFinalize();
              router.replace('/(tabs)');
            },
            () => setStopOpen(false)
          )
        }
        visible={stopOpen}
      />
    </Screen>
  );
}

function ProgressRing({ progress, size }: { progress: number; size: number }) {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <Svg
      height={size}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      viewBox={`0 0 ${size} ${size}`}
      width={size}
    >
      <Circle
        cx={size / 2}
        cy={size / 2}
        fill="none"
        opacity={0.22}
        r={radius}
        stroke={RUNNER.border}
        strokeWidth={strokeWidth}
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        fill="none"
        origin={`${size / 2}, ${size / 2}`}
        r={radius}
        rotation="-90"
        stroke={RUNNER.accent}
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={circumference * (1 - progress)}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
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
  size,
  testID,
}: {
  disabled: boolean;
  emphasis?: boolean;
  icon: 'check' | 'clock' | 'list-checks' | 'pause' | 'play' | 'skip-forward';
  label: string;
  onPress: () => void;
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
        backgroundColor: emphasis ? RUNNER.accent : RUNNER.surface,
        borderColor: emphasis ? RUNNER.accent : RUNNER.border,
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
        color={emphasis ? RUNNER.accentText : RUNNER.text}
        name={icon}
        size={emphasis ? 30 : 22}
        strokeWidth={2.6}
      />
    </Pressable>
  );
}

function RunnerModal({
  children,
  onClose,
  visible,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  visible: boolean;
  title: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable accessibilityLabel="Close modal" onPress={onClose} style={styles.modalScrim} />
        <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          <Row alignment="center" style={styles.modalHeader}>
            <Text textStyle={{ color: RUNNER.text, fontSize: 20, fontWeight: '800' }}>{title}</Text>
            <Pressable accessibilityLabel="Close modal" onPress={onClose} style={styles.modalClose}>
              <Text textStyle={{ color: RUNNER.muted, fontSize: 24 }}>×</Text>
            </Pressable>
          </Row>
          {children}
        </View>
      </View>
    </Modal>
  );
}

function ModalAction({
  disabled = false,
  icon,
  label,
  onPress,
  testID,
}: {
  disabled?: boolean;
  icon: 'arrow-left' | 'check' | 'chevron-down' | 'skip-forward';
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.modalAction, { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}
      testID={testID}
    >
      <AppIcon color={RUNNER.accent} name={icon} size={20} />
      <Text textStyle={{ color: RUNNER.text, fontSize: 16, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

function AddTimeModal({
  busy,
  onAdd,
  onClose,
  visible,
}: {
  busy: boolean;
  onAdd: (addedTimeMs: number) => void;
  onClose: () => void;
  visible: boolean;
}) {
  const options = [
    { label: '+1 minute', value: 60_000 },
    { label: '+3 minutes', value: 180_000 },
    { label: '+5 minutes', value: 300_000 },
    { label: '+10 minutes', value: 600_000 },
    { label: '+30 minutes', value: 1_800_000 },
  ];
  return (
    <RunnerModal onClose={onClose} title="Add time" visible={visible}>
      <View style={styles.modalOptions}>
        {options.map((option) => (
          <Pressable
            key={option.value}
            accessibilityLabel={option.label}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => onAdd(option.value)}
            style={({ pressed }) => [
              styles.presetButton,
              { opacity: busy ? 0.4 : pressed ? 0.7 : 1 },
            ]}
            testID={`add-time-${option.value}`}
          >
            <Text textStyle={{ color: RUNNER.text, fontSize: 16, fontWeight: '700' }}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </RunnerModal>
  );
}

function SkipModal({
  busy,
  onClose,
  onMoveToEnd,
  onSkip,
  visible,
}: {
  busy: boolean;
  onClose: () => void;
  onMoveToEnd: () => void;
  onSkip: () => void;
  visible: boolean;
}) {
  return (
    <RunnerModal onClose={onClose} title="Next step" visible={visible}>
      <ModalAction
        disabled={busy}
        icon="chevron-down"
        label="Move step to end"
        onPress={onMoveToEnd}
        testID="routine-move-step-to-end"
      />
      <ModalAction
        disabled={busy}
        icon="skip-forward"
        label="Skip step"
        onPress={onSkip}
        testID="routine-skip-step"
      />
    </RunnerModal>
  );
}

function RoutineStepsModal({
  active,
  busy,
  onClose,
  onJump,
  onMove,
  visible,
}: {
  active: ActiveRoutine;
  busy: boolean;
  onClose: () => void;
  onJump: (stepId: string) => void;
  onMove: (stepId: string, direction: 'up' | 'down') => void;
  visible: boolean;
}) {
  const steps = orderedSteps(active);
  return (
    <RunnerModal onClose={onClose} title="Routine steps" visible={visible}>
      <Column spacing={10} style={{ width: '100%' }}>
        {steps.map((step, index) => {
          const session = active.stepSessions.find((candidate) => candidate.stepId === step.id);
          const status = session?.status ?? 'pending';
          const icon =
            status === 'completed'
              ? 'check-circle-2'
              : status === 'skipped'
                ? 'skip-forward'
                : status === 'active'
                  ? 'circle-dot'
                  : 'circle';
          return (
            <Row key={step.id} alignment="center" spacing={8} style={styles.rearrangeRow}>
              <Pressable
                accessibilityLabel={`Open ${step.name || 'step'}`}
                accessibilityRole="button"
                disabled={busy}
                onPress={() => onJump(step.id)}
                style={({ pressed }) => [styles.stepTouchable, { opacity: pressed ? 0.7 : 1 }]}
                testID={`routine-jump-step-${step.id}`}
              >
                <AppIcon color={statusColor(status)} name={icon} size={21} />
                <View style={styles.stepText}>
                  <Column spacing={2}>
                    <Text textStyle={{ color: RUNNER.text, fontSize: 15, fontWeight: '700' }}>
                      {`${index + 1}. ${step.name || 'Untitled step'}`}
                    </Text>
                    <Text textStyle={{ color: RUNNER.muted, fontSize: 13 }}>
                      {stepStatusLabel(status)}
                    </Text>
                  </Column>
                </View>
              </Pressable>
              <Pressable
                accessibilityLabel={`Move ${step.name || 'step'} up`}
                accessibilityRole="button"
                disabled={busy || index === 0}
                onPress={() => onMove(step.id, 'up')}
                style={({ pressed }) => [
                  styles.reorderIcon,
                  { opacity: busy || index === 0 ? 0.25 : pressed ? 0.7 : 1 },
                ]}
                testID={`routine-reorder-up-${step.id}`}
              >
                <AppIcon color={RUNNER.text} name="chevron-up" size={18} />
              </Pressable>
              <Pressable
                accessibilityLabel={`Move ${step.name || 'step'} down`}
                accessibilityRole="button"
                disabled={busy || index === steps.length - 1}
                onPress={() => onMove(step.id, 'down')}
                style={({ pressed }) => [
                  styles.reorderIcon,
                  { opacity: busy || index === steps.length - 1 ? 0.25 : pressed ? 0.7 : 1 },
                ]}
                testID={`routine-reorder-down-${step.id}`}
              >
                <AppIcon color={RUNNER.text} name="chevron-down" size={18} />
              </Pressable>
            </Row>
          );
        })}
      </Column>
    </RunnerModal>
  );
}

function StopModal({
  busy,
  onClose,
  onStop,
  visible,
}: {
  busy: boolean;
  onClose: () => void;
  onStop: () => void;
  visible: boolean;
}) {
  return (
    <RunnerModal onClose={onClose} title="Stop routine" visible={visible}>
      <ModalAction
        disabled={busy}
        icon="check"
        label="Stop and save"
        onPress={onStop}
        testID="confirm-stop-routine"
      />
      <ModalAction disabled={busy} icon="arrow-left" label="Keep running" onPress={onClose} />
    </RunnerModal>
  );
}

const styles = StyleSheet.create({
  controlRow: {
    justifyContent: 'space-between',
    width: '100%',
  },
  errorCard: {
    backgroundColor: '#271616',
    borderColor: '#653232',
    borderRadius: 14,
    borderWidth: 1,
    gap: 7,
    padding: 14,
    width: '100%',
  },
  headerRow: {
    width: '100%',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  modalAction: {
    alignItems: 'center',
    backgroundColor: RUNNER.surface,
    borderColor: RUNNER.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 54,
    paddingHorizontal: 16,
    width: '100%',
  },
  modalClose: {
    alignItems: 'center',
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  modalHeader: {
    justifyContent: 'space-between',
    width: '100%',
  },
  modalOptions: {
    gap: 10,
    marginTop: 4,
    width: '100%',
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalScrim: {
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.72)',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  modalSheet: {
    backgroundColor: '#0D0D0D',
    borderColor: RUNNER.border,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 18,
    width: '100%',
  },
  nextRow: {
    justifyContent: 'center',
    width: '100%',
  },
  presetButton: {
    alignItems: 'center',
    backgroundColor: RUNNER.surface,
    borderColor: RUNNER.border,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 50,
    justifyContent: 'center',
    width: '100%',
  },
  rearrangeRow: {
    alignItems: 'center',
    backgroundColor: RUNNER.surface,
    borderColor: RUNNER.border,
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 62,
    paddingHorizontal: 10,
    width: '100%',
  },
  reorderIcon: {
    alignItems: 'center',
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  runnerContent: {
    width: '100%',
  },
  stepText: {
    flex: 1,
    minWidth: 0,
  },
  stepTouchable: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    gap: 11,
    minWidth: 0,
  },
  stepToggle: {
    alignItems: 'center',
    backgroundColor: '#202020',
    borderColor: RUNNER.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  stopButton: {
    alignItems: 'center',
    backgroundColor: RUNNER.surface,
    borderColor: RUNNER.border,
    borderRadius: 15,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 53,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  timerCircle: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: RUNNER.circle,
    borderColor: RUNNER.border,
    borderWidth: 1,
    gap: 13,
    justifyContent: 'center',
    padding: 22,
  },
  timerWrap: {
    alignSelf: 'center',
    position: 'relative',
  },
  timeRange: {
    justifyContent: 'center',
    width: '100%',
  },
});
