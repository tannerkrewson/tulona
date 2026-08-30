import { Button, Column, Row, Text } from '@expo/ui';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { formatCountdownMs, type ActiveRoutine, type RoutineStepStatus } from '@domain';
import { AppIcon, type IconName } from '@icons';
import { useAppTheme, type ThemeColors } from '@theme';
import { errorText, Screen } from '@ui';
import { RecoveryActions } from '../orchestration/RecoveryActions';

import { routineTiming } from './routine-engine';
import { loadRoutineRuntime, type RoutineRuntime } from './routine-runtime';

export interface RoutineRunnerScreenProps {
  routineId: string;
}

function absoluteTime(timestamp: string | null): string {
  if (!timestamp) return 'No deadline';
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function statusLabel(active: ActiveRoutine, isOvertime: boolean): string {
  if (active.status === 'paused') return 'Paused';
  if (isOvertime) return 'Overtime';
  return 'In progress';
}

function statusColor(status: RoutineStepStatus, colors: ThemeColors): string {
  if (status === 'completed') return colors.success.foreground;
  if (status === 'skipped') return colors.textMuted;
  if (status === 'active') return colors.primary;
  return colors.border;
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
        {title}
      </Text>
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{message}</Text>
      {children}
    </Column>
  );
}

export function RoutineRunnerScreen({ routineId }: RoutineRunnerScreenProps) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const [runtime, setRuntime] = useState<RoutineRuntime | null>(null);
  const [active, setActive] = useState<ActiveRoutine | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [addTimeOpen, setAddTimeOpen] = useState(false);
  const recovering = useRef(false);
  const lastAction = useRef<
    ((nextRuntime: RoutineRuntime) => Promise<ActiveRoutine | void>) | null
  >(null);

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
          // Retry the finalization itself if the process loses the durable write window.
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
      <Screen scrollable={false}>
        <Column alignment="center" spacing={16} style={{ width: '100%' }}>
          <AppIcon name="timer" color={colors.primary} size={40} />
          <Text textStyle={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>
            Routine runner
          </Text>
          <RunnerError message={loadError ?? 'Restoring the persisted routine...'}>
            <RecoveryActions
              onBack={() => router.replace('/(tabs)')}
              onRetry={restore}
              testID="routine-recovery"
            />
          </RunnerError>
        </Column>
      </Screen>
    );
  }

  const timing = routineTiming(active, nowMs);
  const currentStep = active.routineSnapshot.steps[active.currentStepIndex];
  if (!currentStep) {
    return (
      <Screen scrollable={false}>
        <RunnerError message="The active routine has no current step.">
          <RecoveryActions
            onBack={() => router.replace('/(tabs)')}
            testID="routine-step-recovery"
          />
        </RunnerError>
      </Screen>
    );
  }
  const countdown = timing.remainingMs === null ? '—' : formatCountdownMs(timing.remainingMs);
  const isOvertime = timing.isOvertime;
  const actionErrorMessage = actionError;

  return (
    <Screen>
      <Column spacing={18} style={{ width: '100%' }}>
        <Row alignment="center" spacing={12}>
          <Column
            style={{
              backgroundColor: colors.active.background,
              borderRadius: 12,
              padding: 10,
            }}
          >
            <AppIcon name="repeat" color={colors.active.foreground} size={22} />
          </Column>
          <Column spacing={3} style={{ width: '100%' }}>
            <Text textStyle={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>
              {active.routineSnapshot.name}
            </Text>
            <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
              {`Step ${active.currentStepIndex + 1} of ${active.routineSnapshot.steps.length}`}
            </Text>
          </Column>
        </Row>
        <Row alignment="center" spacing={10}>
          <Button
            disabled={busy}
            label="Steps"
            onPress={() => setStepsOpen(true)}
            variant="outlined"
            testID="open-routine-steps"
          />
          <Button
            disabled={busy}
            label="Cancel routine"
            onPress={() =>
              void runAction(
                (nextRuntime) =>
                  nextRuntime.routineService.cancelAndFinalize().then(() => undefined),
                () => router.replace('/(tabs)')
              )
            }
            variant="text"
            testID="cancel-routine"
          />
        </Row>
        <Column
          alignment="center"
          spacing={18}
          style={{
            backgroundColor: isOvertime ? colors.warning.background : colors.surface,
            borderColor: isOvertime ? colors.warning.foreground : colors.border,
            borderRadius: 24,
            borderWidth: 1,
            paddingHorizontal: 20,
            paddingVertical: 30,
            width: '100%',
          }}
          testID="current-routine-step"
        >
          <AppIcon
            name={(currentStep.iconName || 'timer') as IconName}
            color={isOvertime ? colors.warning.foreground : colors.primary}
            size={84}
          />
          <Text
            textStyle={{
              color: isOvertime ? colors.warning.foreground : colors.text,
              fontSize: 30,
              fontWeight: '700',
              textAlign: 'center',
            }}
          >
            {currentStep.name || 'Current step'}
          </Text>
          <Text
            textStyle={{
              color: isOvertime ? colors.warning.foreground : colors.textMuted,
              fontSize: 16,
              fontWeight: '700',
            }}
          >
            {statusLabel(active, isOvertime)}
          </Text>
          <Text
            textStyle={{
              color: isOvertime ? colors.warning.foreground : colors.text,
              fontSize: 58,
              fontWeight: '700',
              textAlign: 'center',
            }}
            testID="routine-countdown"
          >
            {isOvertime ? `+${formatCountdownMs(timing.overtimeMs)}` : countdown}
          </Text>
          <Text
            textStyle={{
              color: isOvertime ? colors.warning.foreground : colors.textMuted,
              fontSize: 15,
            }}
          >
            {active.status === 'paused'
              ? isOvertime
                ? `Paused · over by ${formatCountdownMs(timing.overtimeMs)}`
                : `Paused · ${countdown} remaining`
              : timing.deadlineAt
                ? `Ends at ${absoluteTime(timing.deadlineAt)}`
                : 'No deadline'}
          </Text>
        </Column>
        <RunnerError message={actionErrorMessage} title="Routine action failed">
          <RecoveryActions
            onBack={() => router.replace('/(tabs)')}
            onRetry={retry}
            testID="routine-action-recovery"
          />
        </RunnerError>
        <Column spacing={12} style={{ width: '100%' }}>
          <Button
            disabled={busy || active.status === 'paused'}
            label="Done"
            onPress={() => void runAction((nextRuntime) => nextRuntime.routineService.done())}
            testID="routine-done"
          />
          <Row alignment="center" spacing={10}>
            <Button
              disabled={busy}
              label={active.status === 'paused' ? 'Resume' : 'Pause'}
              onPress={() =>
                void runAction((nextRuntime) =>
                  active.status === 'paused'
                    ? nextRuntime.routineService.resume()
                    : nextRuntime.routineService.pause()
                )
              }
              variant="outlined"
              testID={active.status === 'paused' ? 'routine-resume' : 'routine-pause'}
            />
            <Button
              disabled={busy || active.status === 'paused'}
              label="Skip"
              onPress={() => void runAction((nextRuntime) => nextRuntime.routineService.skip())}
              variant="outlined"
              testID="routine-skip"
            />
          </Row>
          <Button
            disabled={busy}
            label="Add time"
            onPress={() => setAddTimeOpen((open) => !open)}
            variant="outlined"
            testID="open-add-time"
          />
        </Column>
        {addTimeOpen ? (
          <AddTimeSheet
            busy={busy}
            onClose={() => setAddTimeOpen(false)}
            onAdd={(addedTimeMs) =>
              void runAction(
                (nextRuntime) => nextRuntime.routineService.addTime(addedTimeMs),
                () => setAddTimeOpen(false)
              )
            }
          />
        ) : null}
        {stepsOpen ? <StepsSheet active={active} onClose={() => setStepsOpen(false)} /> : null}
      </Column>
    </Screen>
  );
}

function AddTimeSheet({
  busy,
  onClose,
  onAdd,
}: {
  busy: boolean;
  onClose: () => void;
  onAdd: (addedTimeMs: number) => void;
}) {
  const { colors } = useAppTheme();
  const options = [
    { label: '+1 min', value: 60_000 },
    { label: '+5 min', value: 300_000 },
    { label: '+10 min', value: 600_000 },
    { label: '+30 min', value: 1_800_000 },
  ];
  return (
    <Column
      spacing={10}
      style={{
        backgroundColor: colors.surfaceMuted,
        borderColor: colors.border,
        borderRadius: 16,
        borderWidth: 1,
        padding: 14,
        width: '100%',
      }}
      testID="add-time-sheet"
    >
      <Text textStyle={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>Add time</Text>
      <Text textStyle={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
        Additions extend the persisted deadline without resetting the current countdown or overtime
        position.
      </Text>
      <Row alignment="center" spacing={8}>
        {options.map((option) => (
          <Button
            key={option.value}
            disabled={busy}
            label={option.label}
            onPress={() => onAdd(option.value)}
            testID={`add-time-${option.value}`}
          />
        ))}
      </Row>
      <Button disabled={busy} label="Close" onPress={onClose} variant="text" />
    </Column>
  );
}

function StepsSheet({ active, onClose }: { active: ActiveRoutine; onClose: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Column
      spacing={12}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.primary,
        borderRadius: 18,
        borderWidth: 1,
        padding: 16,
        width: '100%',
      }}
      testID="routine-steps-sheet"
    >
      <Row alignment="center" spacing={10}>
        <AppIcon name="list-checks" color={colors.primary} size={24} />
        <Column spacing={2} style={{ width: '100%' }}>
          <Text textStyle={{ color: colors.text, fontSize: 19, fontWeight: '700' }}>Steps</Text>
          <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>Read-only progress</Text>
        </Column>
      </Row>
      {active.routineSnapshot.steps.map((step, index) => {
        const session = active.stepSessions.find((candidate) => candidate.stepId === step.id);
        const status = session?.status ?? 'pending';
        return (
          <Row key={step.id} alignment="center" spacing={10}>
            <AppIcon
              name={
                status === 'completed'
                  ? 'check-circle-2'
                  : status === 'skipped'
                    ? 'skip-forward'
                    : 'circle'
              }
              color={statusColor(status, colors)}
              size={20}
            />
            <Text
              textStyle={{
                color: colors.text,
                fontSize: 15,
                fontWeight: index === active.currentStepIndex ? '700' : '400',
              }}
            >
              {`${index + 1}. ${step.name || 'Untitled step'}${index === active.currentStepIndex ? ' · Current' : ''}`}
            </Text>
          </Row>
        );
      })}
      <Button
        label="Close steps"
        onPress={onClose}
        variant="outlined"
        testID="close-routine-steps"
      />
    </Column>
  );
}
