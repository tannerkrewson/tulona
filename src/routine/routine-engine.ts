import {
  createId,
  timestampMs,
  toTimestamp,
  type ActiveRoutine,
  type IsoTimestamp,
  type RoutineRunHistory,
  type RoutineSnapshot,
  type RoutineStepEndBehavior,
  type RoutineStepSession,
  type UUID,
} from '@domain';

export type RoutineTimestampInput = Date | number | string;
export type RoutineStepAction = 'done' | 'skipped';

export interface RoutineTiming {
  status: ActiveRoutine['status'];
  stepId: UUID | null;
  deadlineAt: IsoTimestamp | null;
  remainingMs: number | null;
  overtimeMs: number;
  isOvertime: boolean;
}

export interface RoutineCatchUpResult {
  activeRoutine: ActiveRoutine;
  completedStepIds: UUID[];
  completedAt: IsoTimestamp | null;
}

export interface StartRoutineStateOptions {
  id?: UUID;
}

function atMs(value: RoutineTimestampInput): number {
  const result = timestampMs(value);
  if (!Number.isFinite(result)) throw new RangeError('Routine timestamps must be finite');
  return result;
}

function timestamp(value: RoutineTimestampInput): IsoTimestamp {
  return toTimestamp(atMs(value));
}

function assertDuration(durationMs: number): void {
  if (!Number.isInteger(durationMs) || durationMs <= 0) {
    throw new RangeError('Routine step duration must be a positive integer in milliseconds');
  }
}

function endBehavior(value: RoutineStepEndBehavior | undefined): RoutineStepEndBehavior {
  return value === 'autoAdvance' ? 'auto-advance' : (value ?? 'overtime');
}

function cloneSnapshot(snapshot: RoutineSnapshot): RoutineSnapshot {
  return {
    ...snapshot,
    steps: snapshot.steps.map((step) => ({
      ...step,
      endBehavior: endBehavior(step.endBehavior),
      notes: step.notes ?? null,
    })),
  };
}

function cloneSession(session: RoutineStepSession): RoutineStepSession {
  return { ...session };
}

function cloneRoutine(activeRoutine: ActiveRoutine): ActiveRoutine {
  return {
    ...activeRoutine,
    routineSnapshot: cloneSnapshot(activeRoutine.routineSnapshot),
    stepSessions: activeRoutine.stepSessions.map(cloneSession),
    alarmFiredStepIds: [...(activeRoutine.alarmFiredStepIds ?? [])],
  };
}

function orderedSteps(snapshot: RoutineSnapshot) {
  return [...snapshot.steps].sort((left, right) => left.sortOrder - right.sortOrder);
}

function currentStep(activeRoutine: ActiveRoutine) {
  return orderedSteps(activeRoutine.routineSnapshot)[activeRoutine.currentStepIndex];
}

function currentSession(activeRoutine: ActiveRoutine): RoutineStepSession | undefined {
  const step = currentStep(activeRoutine);
  return step
    ? activeRoutine.stepSessions.find((session) => session.stepId === step.id)
    : undefined;
}

function derivedDeadlineMs(activeRoutine: ActiveRoutine): number | null {
  const step = currentStep(activeRoutine);
  const session = currentSession(activeRoutine);
  if (!step || !session?.startedAt) return null;
  return (
    atMs(session.startedAt) + step.durationMs + session.addedTimeMs + activeRoutine.pausedDurationMs
  );
}

function runningDeadlineMs(activeRoutine: ActiveRoutine): number | null {
  return activeRoutine.currentStepDeadlineAt
    ? atMs(activeRoutine.currentStepDeadlineAt)
    : derivedDeadlineMs(activeRoutine);
}

function pausedRemainingMs(activeRoutine: ActiveRoutine): number | null {
  if (
    activeRoutine.remainingMsWhenPaused !== undefined &&
    activeRoutine.remainingMsWhenPaused !== null
  ) {
    return activeRoutine.remainingMsWhenPaused;
  }
  const deadlineMs = runningDeadlineMs(activeRoutine);
  return activeRoutine.pausedAt && deadlineMs !== null
    ? deadlineMs - atMs(activeRoutine.pausedAt)
    : null;
}

function setCurrentDeadline(activeRoutine: ActiveRoutine, deadlineMs: number | null): void {
  activeRoutine.currentStepDeadlineAt = deadlineMs === null ? null : toTimestamp(deadlineMs);
}

function assertActiveStep(activeRoutine: ActiveRoutine): RoutineStepSession {
  if (activeRoutine.status !== 'running' && activeRoutine.status !== 'paused') {
    throw new Error(`Routine is not active: ${activeRoutine.status}`);
  }
  const step = currentStep(activeRoutine);
  const session = currentSession(activeRoutine);
  const activeSessions = activeRoutine.stepSessions.filter(
    (candidate) => candidate.status === 'active'
  );
  if (!step || !session || session.status !== 'active' || activeSessions.length !== 1) {
    throw new Error('Routine must have exactly one active step');
  }
  assertDuration(step.durationMs);
  return session;
}

function initializeNextStep(
  activeRoutine: ActiveRoutine,
  nextIndex: number,
  startedAtMs: number
): ActiveRoutine {
  const next = cloneRoutine(activeRoutine);
  const step = orderedSteps(next.routineSnapshot)[nextIndex];
  if (!step) {
    next.status = 'awaiting-next-activity';
    next.completedAt = toTimestamp(startedAtMs);
    next.currentStepIndex = orderedSteps(next.routineSnapshot).length;
    next.currentStepStartedAt = null;
    next.pausedAt = null;
    next.remainingMsWhenPaused = null;
    setCurrentDeadline(next, null);
    return next;
  }
  const session = next.stepSessions.find((candidate) => candidate.stepId === step.id);
  if (!session || session.status !== 'pending')
    throw new Error('Routine step history is not contiguous');
  session.status = 'active';
  session.plannedDurationMs = step.durationMs;
  session.startedAt = toTimestamp(startedAtMs);
  session.completedAt = null;
  session.outcome = undefined;
  next.status = 'running';
  next.completedAt = null;
  next.pausedAt = null;
  next.remainingMsWhenPaused = null;
  next.currentStepIndex = nextIndex;
  next.currentStepStartedAt = session.startedAt;
  setCurrentDeadline(next, startedAtMs + step.durationMs + session.addedTimeMs);
  return next;
}

function completeCurrentStep(
  activeRoutine: ActiveRoutine,
  completedAtMs: number,
  action: RoutineStepAction | 'autoAdvanced'
): ActiveRoutine {
  const next = cloneRoutine(activeRoutine);
  if (next.status !== 'running') throw new Error('Routine step actions require a running routine');
  const steps = orderedSteps(next.routineSnapshot);
  const step = steps[next.currentStepIndex];
  const session = assertActiveStep(next);
  session.status = action === 'skipped' ? 'skipped' : 'completed';
  session.completedAt = toTimestamp(completedAtMs);
  session.outcome = action === 'autoAdvanced' ? 'autoAdvanced' : action;
  next.currentStepStartedAt = null;
  next.currentStepDeadlineAt = null;
  next.remainingMsWhenPaused = null;
  if (!step || next.currentStepIndex >= steps.length - 1) {
    next.status = 'awaiting-next-activity';
    next.completedAt = session.completedAt;
    next.currentStepIndex = steps.length;
    next.pausedAt = null;
    return next;
  }
  return initializeNextStep(next, next.currentStepIndex + 1, completedAtMs);
}

/** Creates the sole persisted active object for a new routine run. */
export function startRoutine(
  routineSnapshot: RoutineSnapshot,
  startedAt: RoutineTimestampInput,
  options: StartRoutineStateOptions = {}
): ActiveRoutine {
  const steps = orderedSteps(routineSnapshot);
  if (steps.length === 0) throw new RangeError('A routine needs at least one startable step');
  steps.forEach((step) => assertDuration(step.durationMs));
  const startedAtTimestamp = timestamp(startedAt);
  const sessions: RoutineStepSession[] = steps.map((step, index) => ({
    stepId: step.id,
    status: index === 0 ? 'active' : 'pending',
    startedAt: index === 0 ? startedAtTimestamp : null,
    completedAt: null,
    addedTimeMs: 0,
    plannedDurationMs: step.durationMs,
  }));
  return {
    id: options.id ?? createId(),
    routineId: routineSnapshot.id,
    routineSnapshot: cloneSnapshot({ ...routineSnapshot, steps }),
    status: 'running',
    startedAt: startedAtTimestamp,
    pausedAt: null,
    completedAt: null,
    currentStepIndex: 0,
    currentStepStartedAt: startedAtTimestamp,
    pausedDurationMs: 0,
    stepSessions: sessions,
    currentStepDeadlineAt: toTimestamp(atMs(startedAt) + steps[0].durationMs),
    remainingMsWhenPaused: null,
    alarmFiredStepIds: [],
  };
}

/** Derives countdown/overtime values from persisted timestamps at render time. */
export function routineTiming(
  activeRoutine: ActiveRoutine,
  at: RoutineTimestampInput = Date.now()
): RoutineTiming {
  const now = atMs(at);
  if (activeRoutine.status === 'paused') {
    const remainingMs = pausedRemainingMs(activeRoutine);
    return {
      status: activeRoutine.status,
      stepId: currentStep(activeRoutine)?.id ?? null,
      deadlineAt: activeRoutine.currentStepDeadlineAt ?? null,
      remainingMs,
      overtimeMs: remainingMs === null ? 0 : Math.max(0, -remainingMs),
      isOvertime: remainingMs !== null && remainingMs < 0,
    };
  }
  if (activeRoutine.status !== 'running') {
    return {
      status: activeRoutine.status,
      stepId: null,
      deadlineAt: null,
      remainingMs: null,
      overtimeMs: 0,
      isOvertime: false,
    };
  }
  const deadlineMs = runningDeadlineMs(activeRoutine);
  const remainingMs = deadlineMs === null ? null : deadlineMs - now;
  return {
    status: activeRoutine.status,
    stepId: currentStep(activeRoutine)?.id ?? null,
    deadlineAt: deadlineMs === null ? null : toTimestamp(deadlineMs),
    remainingMs,
    overtimeMs: remainingMs === null ? 0 : Math.max(0, -remainingMs),
    isOvertime: remainingMs !== null && remainingMs < 0,
  };
}

export const getRoutineTiming = routineTiming;

/** Pauses the current step without changing its persisted remaining time. */
export function pauseRoutine(
  activeRoutine: ActiveRoutine,
  at: RoutineTimestampInput = Date.now()
): ActiveRoutine {
  const atTimestamp = timestamp(at);
  const recovered = catchUpRoutine(activeRoutine, at).activeRoutine;
  if (recovered.status !== 'running' && recovered.status !== 'paused') return recovered;
  const next = cloneRoutine(recovered);
  assertActiveStep(next);
  if (next.status === 'paused') return next;
  const remainingMs = routineTiming(next, at).remainingMs;
  if (remainingMs === null) throw new Error('Cannot pause a routine without a current deadline');
  next.status = 'paused';
  next.pausedAt = atTimestamp;
  next.remainingMsWhenPaused = remainingMs;
  return next;
}

/** Resumes from the exact persisted remaining value, including negative overtime. */
export function resumeRoutine(
  activeRoutine: ActiveRoutine,
  at: RoutineTimestampInput = Date.now()
): ActiveRoutine {
  const atMsValue = atMs(at);
  const next = cloneRoutine(activeRoutine);
  assertActiveStep(next);
  if (next.status !== 'paused' || !next.pausedAt) throw new Error('Routine is not paused');
  const remainingMs = pausedRemainingMs(next);
  if (remainingMs === null) throw new Error('Paused routine has no remaining time');
  const pausedMs = atMsValue - atMs(next.pausedAt);
  if (pausedMs < 0) throw new RangeError('Resume timestamp cannot precede pause timestamp');
  next.pausedDurationMs += pausedMs;
  next.status = 'running';
  next.pausedAt = null;
  next.remainingMsWhenPaused = null;
  setCurrentDeadline(next, atMsValue + remainingMs);
  return next;
}

/** Adds duration to the current deadline or to paused remaining time. */
export function addRoutineTime(
  activeRoutine: ActiveRoutine,
  addedTimeMs: number,
  at: RoutineTimestampInput = Date.now()
): ActiveRoutine {
  atMs(at);
  if (!Number.isInteger(addedTimeMs) || addedTimeMs <= 0) {
    throw new RangeError('Added routine time must be a positive integer in milliseconds');
  }
  const next = cloneRoutine(activeRoutine);
  const session = assertActiveStep(next);
  session.addedTimeMs += addedTimeMs;
  if (next.status === 'paused') {
    const remainingMs = pausedRemainingMs(next);
    if (remainingMs === null) throw new Error('Paused routine has no remaining time');
    next.remainingMsWhenPaused = remainingMs + addedTimeMs;
  } else {
    const deadlineMs = runningDeadlineMs(next);
    if (deadlineMs === null) throw new Error('Cannot add time without a current deadline');
    setCurrentDeadline(next, deadlineMs + addedTimeMs);
  }
  return next;
}

/** Completes the current step at the supplied action time. */
export function completeRoutineStep(
  activeRoutine: ActiveRoutine,
  at: RoutineTimestampInput = Date.now()
): ActiveRoutine {
  return completeCurrentStep(activeRoutine, atMs(at), 'done');
}

export const doneRoutineStep = completeRoutineStep;

/** Skips the current step and starts the next one at the same action time. */
export function skipRoutineStep(
  activeRoutine: ActiveRoutine,
  at: RoutineTimestampInput = Date.now()
): ActiveRoutine {
  return completeCurrentStep(activeRoutine, atMs(at), 'skipped');
}

export const advanceRoutineStep = skipRoutineStep;

export function advanceRoutine(
  activeRoutine: ActiveRoutine,
  action: RoutineStepAction = 'done',
  at: RoutineTimestampInput = Date.now()
): ActiveRoutine {
  return action === 'skipped'
    ? skipRoutineStep(activeRoutine, at)
    : completeRoutineStep(activeRoutine, at);
}

/** Catches up every elapsed auto-advance step and stops at overtime/future work. */
export function catchUpRoutine(
  activeRoutine: ActiveRoutine,
  at: RoutineTimestampInput = Date.now()
): RoutineCatchUpResult {
  const nowMs = atMs(at);
  let next = cloneRoutine(activeRoutine);
  const completedStepIds: UUID[] = [];
  while (next.status === 'running') {
    const step = currentStep(next);
    const deadlineMs = runningDeadlineMs(next);
    if (!step || deadlineMs === null || deadlineMs > nowMs) break;
    if (endBehavior(step.endBehavior) !== 'auto-advance') break;
    completedStepIds.push(step.id);
    next = completeCurrentStep(next, deadlineMs, 'autoAdvanced');
  }
  return {
    activeRoutine: next,
    completedStepIds,
    completedAt: next.status === 'awaiting-next-activity' ? next.completedAt : null,
  };
}

export const recoverRoutine = catchUpRoutine;
export const catchUpActiveRoutine = catchUpRoutine;

/** Marks an alarm attempt once for a step; the guard survives reload in ActiveRoutine. */
export function markRoutineAlarmFired(activeRoutine: ActiveRoutine, stepId: UUID): ActiveRoutine {
  const next = cloneRoutine(activeRoutine);
  if (!next.alarmFiredStepIds?.includes(stepId)) next.alarmFiredStepIds?.push(stepId);
  return next;
}

export function routineAlarmWasFired(activeRoutine: ActiveRoutine, stepId: UUID): boolean {
  return activeRoutine.alarmFiredStepIds?.includes(stepId) ?? false;
}

/** Turns a terminal active object into immutable history input without chooser delay. */
export function routineRunHistory(
  activeRoutine: ActiveRoutine,
  status: RoutineRunHistory['status'] = activeRoutine.status === 'cancelled'
    ? 'cancelled'
    : 'completed',
  id: UUID = activeRoutine.id
): RoutineRunHistory {
  if (!activeRoutine.completedAt) throw new Error('Routine has not completed');
  const completedAtMs = atMs(activeRoutine.completedAt);
  return {
    id,
    routineId: activeRoutine.routineId,
    routineSnapshot: cloneSnapshot(activeRoutine.routineSnapshot),
    status,
    startedAt: activeRoutine.startedAt,
    completedAt: activeRoutine.completedAt,
    durationMs: Math.max(
      0,
      completedAtMs - atMs(activeRoutine.startedAt) - activeRoutine.pausedDurationMs
    ),
    stepSessions: activeRoutine.stepSessions.map(cloneSession),
  };
}

export function cancelRoutine(
  activeRoutine: ActiveRoutine,
  at: RoutineTimestampInput = Date.now()
): ActiveRoutine {
  const next = cloneRoutine(activeRoutine);
  if (next.status !== 'running' && next.status !== 'paused') {
    throw new Error(`Routine is not cancellable: ${next.status}`);
  }
  const atMsValue = atMs(at);
  if (next.status === 'paused' && next.pausedAt) {
    const pausedMs = atMsValue - atMs(next.pausedAt);
    if (pausedMs < 0) throw new RangeError('Cancellation timestamp cannot precede pause timestamp');
    next.pausedDurationMs += pausedMs;
  }
  const session = currentSession(next);
  if (session?.status === 'active') {
    session.status = 'skipped';
    session.completedAt = toTimestamp(atMsValue);
    session.outcome = 'skipped';
  }
  next.status = 'cancelled';
  next.completedAt = toTimestamp(atMsValue);
  next.currentStepIndex = orderedSteps(next.routineSnapshot).length;
  next.currentStepStartedAt = null;
  next.currentStepDeadlineAt = null;
  next.remainingMsWhenPaused = null;
  next.pausedAt = null;
  return next;
}
