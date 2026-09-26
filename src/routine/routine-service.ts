import {
  timestampMs,
  monthKey,
  toTimestamp,
  type ActiveRoutine,
  type IsoTimestamp,
  type MonthKey,
  type RoutineRunHistory,
  type RoutineStep,
  type RoutineTrackingMode,
  type TimeTransition,
  type UUID,
} from '@domain';
import type {
  CatalogServiceApi,
  CreateRoutineStepInput,
  DuplicateRoutineStepOptions,
  UpdateRoutineStepInput,
} from '../catalog/catalog-service';
import { PersistenceError, type RoutineRepositoryApi } from '@data';
import {
  addRoutineTime as addRoutineTimeState,
  abandonRoutine as abandonRoutineState,
  advanceRoutine as advanceRoutineState,
  cancelRoutine as cancelRoutineState,
  catchUpRoutine,
  completeRoutineStep,
  moveCurrentRoutineStepToEnd,
  jumpToRoutineStep,
  pauseRoutine as pauseRoutineState,
  reorderActiveRoutineStep,
  resetRoutineTime as resetRoutineTimeState,
  resumeRoutine as resumeRoutineState,
  routineRunHistory,
  routineTiming,
  markRoutineAlarmFired,
  setRoutineStepEnabled as setRoutineStepEnabledState,
  skipRoutineStep,
  startRoutine as startRoutineState,
  type RoutineStepAction,
  type RoutineTimestampInput,
} from './routine-engine';
import type { TrackerServiceApi } from '../tracker/tracker-service';

const NEXT_ACTIVITY_NOTE = 'Next activity after routine';
const DURATION_COMPARISON_LOOKBACK_MONTHS = 12;

function routineTrackingMode(active: ActiveRoutine): RoutineTrackingMode {
  return active.routineSnapshot.trackingMode;
}

function routineOwnsActivity(active: ActiveRoutine, activityId: UUID): boolean {
  if (routineTrackingMode(active) === 'overall') return activityId === active.routineId;
  return active.routineSnapshot.steps.some((step) => step.activityId === activityId);
}

function orderedSnapshotSteps(active: ActiveRoutine) {
  return [...active.routineSnapshot.steps].sort((left, right) => left.sortOrder - right.sortOrder);
}

function routineActivityId(active: ActiveRoutine): UUID | null {
  if (routineTrackingMode(active) === 'overall') return active.routineId;
  return orderedSnapshotSteps(active)[active.currentStepIndex]?.activityId ?? null;
}

function monthKeysBetween(start: string, end: string): MonthKey[] {
  const cursor = new Date(timestampMs(start));
  const endDate = new Date(timestampMs(end));
  cursor.setDate(1);
  cursor.setHours(12, 0, 0, 0);
  const months: MonthKey[] = [];
  while (
    cursor.getFullYear() < endDate.getFullYear() ||
    (cursor.getFullYear() === endDate.getFullYear() && cursor.getMonth() <= endDate.getMonth())
  ) {
    months.push(monthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

export interface StartRoutineOptions {
  id?: UUID;
  transitionId?: UUID;
  startedAt?: RoutineTimestampInput;
  note?: string | null;
}

export interface RoutineServiceOptions {
  now?: () => RoutineTimestampInput;
}

export type RoutineFinalizationStatus = 'completed' | 'cancelled';

export interface RoutineFinalizationResult {
  activeRoutine: ActiveRoutine;
  run: RoutineRunHistory;
}

export interface RoutineDurationComparison {
  previousRunCount: number;
  averageDurationMs: number;
  differenceMs: number;
  lookbackMonths: number;
}

export interface RoutineServiceApi {
  getActive(): Promise<ActiveRoutine | null>;
  startRoutine(routineId: UUID, options?: StartRoutineOptions): Promise<ActiveRoutine>;
  switchToActivity(activityId: UUID | null, at?: RoutineTimestampInput): Promise<TimeTransition>;
  pause(at?: RoutineTimestampInput): Promise<ActiveRoutine>;
  resume(at?: RoutineTimestampInput): Promise<ActiveRoutine>;
  addTime(addedTimeMs: number, at?: RoutineTimestampInput): Promise<ActiveRoutine>;
  addRoutineTime(addedTimeMs: number, at?: RoutineTimestampInput): Promise<ActiveRoutine>;
  resetTime(at?: RoutineTimestampInput): Promise<ActiveRoutine>;
  resetRoutineTime(at?: RoutineTimestampInput): Promise<ActiveRoutine>;
  moveCurrentStepToEnd(at?: RoutineTimestampInput): Promise<ActiveRoutine>;
  reorderStep(stepId: UUID, direction: 'up' | 'down'): Promise<ActiveRoutine>;
  jumpToStep(stepId: UUID, at?: RoutineTimestampInput): Promise<ActiveRoutine>;
  done(at?: RoutineTimestampInput): Promise<ActiveRoutine>;
  completeStep(at?: RoutineTimestampInput): Promise<ActiveRoutine>;
  skip(at?: RoutineTimestampInput): Promise<ActiveRoutine>;
  skipAndDisableStep(stepId: UUID, at?: RoutineTimestampInput): Promise<ActiveRoutine>;
  advance(action?: RoutineStepAction, at?: RoutineTimestampInput): Promise<ActiveRoutine>;
  cancel(at?: RoutineTimestampInput): Promise<ActiveRoutine>;
  finalize(
    status?: RoutineFinalizationStatus,
    at?: RoutineTimestampInput
  ): Promise<RoutineFinalizationResult>;
  finalizeCompletion(at?: RoutineTimestampInput): Promise<RoutineFinalizationResult>;
  finalizeCancellation(at?: RoutineTimestampInput): Promise<RoutineFinalizationResult>;
  cancelAndFinalize(at?: RoutineTimestampInput): Promise<RoutineFinalizationResult>;
  cancelAndDiscard(at?: RoutineTimestampInput): Promise<ActiveRoutine>;
  selectNextActivity(activityId: UUID | null): Promise<TimeTransition>;
  markAlarmFired(stepId: UUID): Promise<ActiveRoutine>;
  setStepEnabled(
    stepId: UUID,
    enabled: boolean,
    at?: RoutineTimestampInput
  ): Promise<ActiveRoutine>;
  durationComparison(run: RoutineRunHistory): Promise<RoutineDurationComparison | null>;
  recover(at?: RoutineTimestampInput): Promise<ActiveRoutine | null>;
  getTiming(at?: RoutineTimestampInput): Promise<ReturnType<typeof routineTiming> | null>;
  history(status?: RoutineRunHistory['status']): Promise<RoutineRunHistory>;
  createStep(routineId: UUID, input: CreateRoutineStepInput): Promise<RoutineStep>;
  updateStep(routineId: UUID, stepId: UUID, input: UpdateRoutineStepInput): Promise<RoutineStep>;
  duplicateStep(
    routineId: UUID,
    stepId: UUID,
    options?: DuplicateRoutineStepOptions
  ): Promise<RoutineStep>;
  deleteStep(routineId: UUID, stepId: UUID): Promise<RoutineStep>;
}

function asTimestamp(value: RoutineTimestampInput): IsoTimestamp {
  return toTimestamp(value);
}

function activeRequired(active: ActiveRoutine | null): ActiveRoutine {
  if (!active) throw new Error('No active routine');
  return active;
}

export class RoutineService implements RoutineServiceApi {
  private readonly now: () => RoutineTimestampInput;

  constructor(
    private readonly routineRepository: RoutineRepositoryApi,
    private readonly catalogService: CatalogServiceApi,
    private readonly trackerService: TrackerServiceApi,
    options: RoutineServiceOptions = {}
  ) {
    this.now = options.now ?? (() => Date.now());
  }

  async getActive(): Promise<ActiveRoutine | null> {
    return this.routineRepository.readActive();
  }

  async startRoutine(routineId: UUID, options: StartRoutineOptions = {}): Promise<ActiveRoutine> {
    await this.ensureJournalRecovered();
    const startedAt = options.startedAt ?? this.now();
    let existing = await this.routineRepository.readActive();
    if (existing?.status === 'awaiting-next-activity') {
      // The completion screen may already have stored the user's next activity.
      // Finalize the finished run without rewriting that transition; the new
      // routine will begin at its own start timestamp below.
      await this.routineRepository.finalize(existing, routineRunHistory(existing, 'completed'));
      existing = await this.routineRepository.readActive();
    } else if (existing?.status === 'cancelled' || existing?.status === 'abandoned') {
      await this.recover(startedAt);
      existing = await this.routineRepository.readActive();
    }
    if (existing?.routineId === routineId && existing.status === 'running') return existing;
    if (existing?.routineId === routineId && existing.status === 'paused') {
      return this.resume(startedAt);
    }
    if (existing) {
      throw new Error(
        `Finish or resolve the active "${existing.routineSnapshot.name}" routine before starting another routine`
      );
    }
    const routine = await this.catalogService.getRoutine(routineId);
    if (routine.archivedAt !== null) throw new Error('Cannot start an archived routine');
    const snapshot = await this.catalogService.snapshotRoutine(routineId, asTimestamp(startedAt));
    if (snapshot.steps.length === 0) {
      throw new Error('A routine needs at least one startable step');
    }
    const active = startRoutineState(snapshot, startedAt, { id: options.id });
    const initialActivityId =
      routineTrackingMode(active) === 'overall'
        ? routineId
        : (active.routineSnapshot.steps[active.currentStepIndex]?.activityId ?? null);
    if (initialActivityId === null) {
      throw new Error('Step-tracked routines require an activity for every step');
    }
    const companion = this.routineRepository.prepareActiveWrite?.(active);
    const transitionOptions = {
      id: options.transitionId,
      timestamp: asTimestamp(startedAt),
      source: 'routine' as const,
      note: options.note ?? null,
    };
    if (this.trackerService.switchActivityWithCompanion && companion) {
      await this.trackerService.switchActivityWithCompanion(initialActivityId, transitionOptions, [
        companion,
      ]);
      return active;
    }

    // Older adapters can still leave a clean state if tracker startup fails.
    await this.routineRepository.writeActive(active);
    try {
      await this.trackerService.switchActivity(initialActivityId, transitionOptions);
    } catch (error) {
      await this.routineRepository.clearActive();
      throw error;
    }
    return active;
  }

  /** Pauses a routine at the tracker switch boundary before starting another activity. */
  async switchToActivity(
    activityId: UUID | null,
    at: RoutineTimestampInput = this.now()
  ): Promise<TimeTransition> {
    await this.ensureJournalRecovered();
    const current = await this.routineRepository.readActive();
    if (!current) {
      return this.trackerService.switchActivity(activityId, {
        timestamp: asTimestamp(at),
      });
    }
    if (current.status === 'awaiting-next-activity') {
      return this.selectNextActivity(activityId);
    }
    if (current.status !== 'running' && current.status !== 'paused') {
      await this.recover(at);
      return this.trackerService.switchActivity(activityId, {
        timestamp: asTimestamp(at),
      });
    }
    const next = current.status === 'running' ? pauseRoutineState(current, at) : current;
    return this.writeRoutineAndSwitchActivity(current, next, activityId, at, 'manual');
  }

  async pause(at: RoutineTimestampInput = this.now()): Promise<ActiveRoutine> {
    await this.ensureJournalRecovered();
    const previous = activeRequired(await this.routineRepository.readActive());
    const next = pauseRoutineState(previous, at);
    await this.writeRoutineAndSwitchActivity(previous, next, null, at, 'routine', 'Routine paused');
    return next;
  }

  async resume(at: RoutineTimestampInput = this.now()): Promise<ActiveRoutine> {
    await this.ensureJournalRecovered();
    const previous = activeRequired(await this.routineRepository.readActive());
    const next = resumeRoutineState(previous, at);
    await this.writeRoutineAndSwitchActivity(
      previous,
      next,
      routineActivityId(next),
      at,
      'routine',
      'Routine resumed'
    );
    return next;
  }

  async addTime(
    addedTimeMs: number,
    at: RoutineTimestampInput = this.now()
  ): Promise<ActiveRoutine> {
    return this.mutate((active) => addRoutineTimeState(active, addedTimeMs, at));
  }

  async addRoutineTime(
    addedTimeMs: number,
    at: RoutineTimestampInput = this.now()
  ): Promise<ActiveRoutine> {
    return this.addTime(addedTimeMs, at);
  }

  async resetTime(at: RoutineTimestampInput = this.now()): Promise<ActiveRoutine> {
    return this.mutate((active) => resetRoutineTimeState(active, at));
  }

  async resetRoutineTime(at: RoutineTimestampInput = this.now()): Promise<ActiveRoutine> {
    return this.resetTime(at);
  }

  async moveCurrentStepToEnd(at: RoutineTimestampInput = this.now()): Promise<ActiveRoutine> {
    return this.mutate((active) => moveCurrentRoutineStepToEnd(active, at));
  }

  async reorderStep(stepId: UUID, direction: 'up' | 'down'): Promise<ActiveRoutine> {
    return this.mutate((active) => reorderActiveRoutineStep(active, stepId, direction));
  }

  async jumpToStep(stepId: UUID, at: RoutineTimestampInput = this.now()): Promise<ActiveRoutine> {
    return this.mutate((active) => jumpToRoutineStep(active, stepId, at));
  }

  async done(at: RoutineTimestampInput = this.now()): Promise<ActiveRoutine> {
    return this.mutate((active) => completeRoutineStep(active, at));
  }

  async completeStep(at: RoutineTimestampInput = this.now()): Promise<ActiveRoutine> {
    return this.done(at);
  }

  async skip(at: RoutineTimestampInput = this.now()): Promise<ActiveRoutine> {
    return this.mutate((active) => skipRoutineStep(active, at));
  }

  /** Skips the current run's step and permanently disables it for later runs. */
  async skipAndDisableStep(
    stepId: UUID,
    at: RoutineTimestampInput = this.now()
  ): Promise<ActiveRoutine> {
    await this.ensureJournalRecovered();
    const previous = activeRequired(await this.routineRepository.readActive());
    if (previous.status !== 'running') {
      throw new Error('Skip and disable future requires a running routine');
    }
    const currentStep = orderedSnapshotSteps(previous)[previous.currentStepIndex];
    if (!currentStep || currentStep.id !== stepId) {
      throw new Error('Only the current routine step can be skipped and disabled');
    }
    const configuredRoutine = await this.catalogService.getRoutine(previous.routineId);
    const configuredStep = configuredRoutine.steps.find((step) => step.id === stepId);
    if (!configuredStep) throw new Error(`Unknown routine step "${stepId}"`);
    const wasEnabled = configuredStep.enabled !== false;
    const next = skipRoutineStep(previous, at);
    const activityId = next.status === 'awaiting-next-activity' ? null : routineActivityId(next);
    const switchAt = next.completedAt ?? next.currentStepStartedAt ?? asTimestamp(at);

    if (wasEnabled) {
      await this.catalogService.updateRoutineStep(previous.routineId, stepId, { enabled: false });
    }
    try {
      await this.writeRoutineAndSwitchActivity(previous, next, activityId, switchAt, 'routine');
    } catch (error) {
      if (wasEnabled) {
        try {
          await this.catalogService.updateRoutineStep(previous.routineId, stepId, {
            enabled: true,
          });
        } catch (rollbackError) {
          throw new PersistenceError(
            'write',
            `The step was not advanced cleanly and its future disable could not be rolled back: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
            undefined,
            new AggregateError([error, rollbackError])
          );
        }
      }
      throw error;
    }
    if (next.status === 'awaiting-next-activity') {
      await this.persistAwaitingCompletion(next);
    }
    return next;
  }

  async advance(
    action: RoutineStepAction = 'done',
    at: RoutineTimestampInput = this.now()
  ): Promise<ActiveRoutine> {
    return this.mutate((active) => advanceRoutineState(active, action, at));
  }

  async cancel(at: RoutineTimestampInput = this.now()): Promise<ActiveRoutine> {
    return this.mutate((active) => cancelRoutineState(active, at));
  }

  async finalize(
    status: RoutineFinalizationStatus = 'completed',
    at: RoutineTimestampInput = this.now()
  ): Promise<RoutineFinalizationResult> {
    return status === 'completed' ? this.finalizeCompletion(at) : this.finalizeCancellation(at);
  }

  async finalizeCompletion(
    at: RoutineTimestampInput = this.now()
  ): Promise<RoutineFinalizationResult> {
    const active = await this.recover(at);
    if (!active) throw new Error('No active routine');
    if (active.status !== 'awaiting-next-activity') {
      throw new Error(`Routine is not complete: ${active.status}`);
    }
    return this.persistAwaitingCompletion(active);
  }

  async finalizeCancellation(
    at: RoutineTimestampInput = this.now()
  ): Promise<RoutineFinalizationResult> {
    await this.ensureJournalRecovered();
    const current = activeRequired(await this.routineRepository.readActive());
    const active = current.status === 'cancelled' ? current : cancelRoutineState(current, at);
    if (active.status !== 'cancelled' || !active.completedAt) {
      throw new Error(`Routine is not cancellable: ${active.status}`);
    }
    const run = routineRunHistory(active, 'cancelled');
    if (active !== current) {
      if (this.routineRepository.persistCancellation) {
        await this.routineRepository.persistCancellation(active, run);
      } else {
        await this.routineRepository.writeActive(active);
      }
    }
    return this.finalizePersistedCancellation(active, run);
  }

  private async finalizePersistedCancellation(
    active: ActiveRoutine,
    run: RoutineRunHistory
  ): Promise<RoutineFinalizationResult> {
    await this.stopRoutineAt(active, 'Routine cancelled');
    await this.routineRepository.finalize(active, run);
    return { activeRoutine: active, run };
  }

  async cancelAndFinalize(
    at: RoutineTimestampInput = this.now()
  ): Promise<RoutineFinalizationResult> {
    return this.finalizeCancellation(at);
  }

  async cancelAndDiscard(at: RoutineTimestampInput = this.now()): Promise<ActiveRoutine> {
    await this.ensureJournalRecovered();
    const current = activeRequired(await this.routineRepository.readActive());
    const active = current.status === 'abandoned' ? current : abandonRoutineState(current, at);
    if (active !== current) await this.routineRepository.writeActive(active);
    await this.stopRoutineAt(active, 'Routine discarded');
    await this.routineRepository.clearActive();
    return active;
  }

  async selectNextActivity(activityId: UUID | null): Promise<TimeTransition> {
    await this.ensureJournalRecovered();
    const currentActive = await this.routineRepository.readActive();
    if (!currentActive) {
      const current = await this.trackerService.getActiveTransition(this.now());
      if (current?.activityId === activityId) return current;
      throw new Error('No active routine');
    }
    const existingAtCompletion =
      currentActive?.status === 'awaiting-next-activity' && currentActive.completedAt
        ? await this.transitionAt(currentActive.completedAt)
        : null;
    const active =
      currentActive?.status === 'awaiting-next-activity' &&
      existingAtCompletion !== null &&
      existingAtCompletion.activityId !== null &&
      (!routineOwnsActivity(currentActive, existingAtCompletion.activityId) ||
        existingAtCompletion.note === NEXT_ACTIVITY_NOTE)
        ? {
            activeRoutine: currentActive,
            run: routineRunHistory(currentActive, 'completed'),
          }
        : await this.finalizeCompletion(this.now());
    const completedAt = active.activeRoutine.completedAt;
    if (!completedAt) throw new Error('Completed routine has no completion timestamp');
    const completionMs = timestampMs(completedAt);
    const current = await this.trackerService.getActiveTransition(completedAt);
    let transition: TimeTransition;
    if (current && timestampMs(current.timestamp) === completionMs) {
      if (current.activityId === null) {
        transition =
          activityId === null
            ? current
            : await this.trackerService.editTransition(current.id, {
                activityId,
                timestamp: completedAt,
                source: 'routine',
                note: NEXT_ACTIVITY_NOTE,
              });
      } else if (current.activityId === activityId) {
        transition = current;
      } else {
        throw new Error('A next activity was already recorded for this routine');
      }
    } else {
      transition = await this.trackerService.switchActivity(activityId, {
        id: active.activeRoutine.id,
        timestamp: completedAt,
        source: 'routine',
        note: NEXT_ACTIVITY_NOTE,
      });
    }
    await this.routineRepository.finalize(
      active.activeRoutine,
      routineRunHistory(active.activeRoutine, 'completed')
    );
    return transition;
  }

  async markAlarmFired(stepId: UUID): Promise<ActiveRoutine> {
    return this.mutate((active) => markRoutineAlarmFired(active, stepId));
  }

  async setStepEnabled(
    stepId: UUID,
    enabled: boolean,
    at: RoutineTimestampInput = this.now()
  ): Promise<ActiveRoutine> {
    await this.ensureJournalRecovered();
    const previous = activeRequired(await this.routineRepository.readActive());
    const configuredRoutine = await this.catalogService.getRoutine(previous.routineId);
    const configuredStep = configuredRoutine.steps.find((step) => step.id === stepId);
    if (!configuredStep) throw new Error(`Unknown routine step "${stepId}"`);
    const wasConfiguredEnabled = configuredStep.enabled !== false;
    const next = setRoutineStepEnabledState(previous, stepId, enabled, at);
    try {
      await this.routineRepository.writeActive(next);
    } catch (activeWriteError) {
      try {
        await this.routineRepository.writeActive(previous);
      } catch (rollbackError) {
        throw new PersistenceError(
          'write',
          `The routine step toggle could not be saved, and the active run rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
          undefined,
          new AggregateError([activeWriteError, rollbackError])
        );
      }
      throw activeWriteError;
    }

    try {
      await this.catalogService.updateRoutineStep(previous.routineId, stepId, { enabled });
    } catch (configurationError) {
      const rollbackErrors: unknown[] = [];
      try {
        const persistedRoutine = await this.catalogService.getRoutine(previous.routineId);
        const persistedStep = persistedRoutine.steps.find((step) => step.id === stepId);
        if (persistedStep && (persistedStep.enabled !== false) !== wasConfiguredEnabled) {
          await this.catalogService.updateRoutineStep(previous.routineId, stepId, {
            enabled: wasConfiguredEnabled,
          });
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
      try {
        await this.routineRepository.writeActive(previous);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
      if (rollbackErrors.length > 0) {
        const detail = rollbackErrors
          .map((error) => (error instanceof Error ? error.message : String(error)))
          .join('; ');
        throw new PersistenceError(
          'write',
          `The routine step toggle could not be saved, and rollback was incomplete: ${detail}`,
          undefined,
          new AggregateError([configurationError, ...rollbackErrors])
        );
      }
      throw configurationError;
    }

    await this.synchronizeStepTracking(previous, next);
    return next;
  }

  async durationComparison(run: RoutineRunHistory): Promise<RoutineDurationComparison | null> {
    const routine = await this.catalogService.getRoutine(run.routineId);
    const completedMonth = new Date(timestampMs(run.completedAt));
    completedMonth.setDate(1);
    completedMonth.setHours(12, 0, 0, 0);
    completedMonth.setMonth(completedMonth.getMonth() - (DURATION_COMPARISON_LOOKBACK_MONTHS - 1));
    const earliestHistoryDate = Math.max(timestampMs(routine.createdAt), completedMonth.getTime());
    const months = monthKeysBetween(new Date(earliestHistoryDate).toISOString(), run.completedAt);
    const history = await Promise.all(
      months.map((month) => this.routineRepository.readHistory(month))
    );
    const previousRuns = history
      .flatMap((collection) => collection.runs)
      .filter(
        (candidate) =>
          candidate.routineId === run.routineId &&
          candidate.id !== run.id &&
          candidate.status === 'completed' &&
          timestampMs(candidate.completedAt) < timestampMs(run.completedAt)
      );
    if (previousRuns.length < 2) return null;
    const averageDurationMs =
      previousRuns.reduce((total, candidate) => total + candidate.durationMs, 0) /
      previousRuns.length;
    return {
      previousRunCount: previousRuns.length,
      averageDurationMs,
      differenceMs: run.durationMs - averageDurationMs,
      lookbackMonths: DURATION_COMPARISON_LOOKBACK_MONTHS,
    };
  }

  async recover(at: RoutineTimestampInput = this.now()): Promise<ActiveRoutine | null> {
    try {
      const recovery = await this.routineRepository.recoverJournal();
      if (recovery.failed.length > 0) throw recovery.failed[0].error;
      const active = await this.routineRepository.readActive();
      if (!active) return null;
      const result = catchUpRoutine(active, at);
      if (JSON.stringify(result.activeRoutine) !== JSON.stringify(active))
        await this.routineRepository.writeActive(result.activeRoutine);

      let trackerMovedPastCompletion = false;
      if (result.activeRoutine.status === 'awaiting-next-activity') {
        const completedAt = result.activeRoutine.completedAt;
        if (!completedAt) throw new Error('Completed routine has no completion timestamp');
        const completionTransition = await this.transitionAt(completedAt);
        const latestTransition = await this.trackerService.getActiveTransition(at);
        const completionActivityWasSelected =
          completionTransition !== null &&
          completionTransition.activityId !== null &&
          (!routineOwnsActivity(result.activeRoutine, completionTransition.activityId) ||
            completionTransition.note === NEXT_ACTIVITY_NOTE);
        if (completionActivityWasSelected) {
          const run = routineRunHistory(result.activeRoutine, 'completed');
          await this.routineRepository.finalize(result.activeRoutine, run);
          return null;
        }

        trackerMovedPastCompletion =
          latestTransition !== null &&
          timestampMs(latestTransition.timestamp) > timestampMs(completedAt);
      }

      // Step synchronization writes at or before completion, preserving a later tracker event.
      await this.synchronizeStepTracking(active, result.activeRoutine);
      if (result.activeRoutine.status === 'awaiting-next-activity') {
        if (trackerMovedPastCompletion) {
          const run = routineRunHistory(result.activeRoutine, 'completed');
          await this.routineRepository.finalize(result.activeRoutine, run);
          return null;
        }
        await this.persistAwaitingCompletion(result.activeRoutine);
      }
      if (result.activeRoutine.status === 'abandoned') {
        await this.stopRoutineAt(result.activeRoutine, 'Routine discarded');
        await this.routineRepository.clearActive();
        return null;
      }
      if (result.activeRoutine.status === 'cancelled') {
        const run = routineRunHistory(result.activeRoutine, 'cancelled');
        await this.finalizePersistedCancellation(result.activeRoutine, run);
        return null;
      }
      return result.activeRoutine;
    } catch (error) {
      throw new PersistenceError(
        'routine-recovery',
        `Routine recovery failed: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        error
      );
    }
  }

  async getTiming(
    at: RoutineTimestampInput = this.now()
  ): Promise<ReturnType<typeof routineTiming> | null> {
    const active = await this.routineRepository.readActive();
    return active ? routineTiming(active, at) : null;
  }

  async history(status?: RoutineRunHistory['status']): Promise<RoutineRunHistory> {
    const active = activeRequired(await this.routineRepository.readActive());
    return routineRunHistory(active, status);
  }

  async createStep(routineId: UUID, input: CreateRoutineStepInput): Promise<RoutineStep> {
    return this.catalogService.createRoutineStep(routineId, input);
  }

  async updateStep(
    routineId: UUID,
    stepId: UUID,
    input: UpdateRoutineStepInput
  ): Promise<RoutineStep> {
    return this.catalogService.updateRoutineStep(routineId, stepId, input);
  }

  async duplicateStep(
    routineId: UUID,
    stepId: UUID,
    options?: DuplicateRoutineStepOptions
  ): Promise<RoutineStep> {
    return this.catalogService.duplicateRoutineStep(routineId, stepId, options);
  }

  async deleteStep(routineId: UUID, stepId: UUID): Promise<RoutineStep> {
    return this.catalogService.deleteRoutineStep(routineId, stepId);
  }

  private async mutate(
    transform: (active: ActiveRoutine) => ActiveRoutine
  ): Promise<ActiveRoutine> {
    await this.ensureJournalRecovered();
    const active = activeRequired(await this.routineRepository.readActive());
    const next = transform(active);
    await this.routineRepository.writeActive(next);
    await this.synchronizeStepTracking(active, next);
    return next;
  }

  private async writeRoutineAndSwitchActivity(
    previous: ActiveRoutine,
    next: ActiveRoutine,
    activityId: UUID | null,
    at: RoutineTimestampInput,
    source: 'routine' | 'manual',
    note?: string
  ): Promise<TimeTransition> {
    const options = {
      timestamp: asTimestamp(at),
      source,
      ...(note ? { note } : {}),
    };
    const companion = this.routineRepository.prepareActiveWrite?.(next);
    if (companion && this.trackerService.switchActivityWithCompanion) {
      return this.trackerService.switchActivityWithCompanion(activityId, options, [companion]);
    }

    if (previous !== next) await this.routineRepository.writeActive(next);
    try {
      return await this.trackerService.switchActivity(activityId, options);
    } catch (error) {
      if (previous !== next) {
        try {
          await this.routineRepository.writeActive(previous);
        } catch (rollbackError) {
          throw new PersistenceError(
            'write',
            `The activity transition failed and the routine rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
            undefined,
            new AggregateError([error, rollbackError])
          );
        }
      }
      throw error;
    }
  }

  private async synchronizeStepTracking(
    previous: ActiveRoutine,
    next: ActiveRoutine
  ): Promise<void> {
    if (routineTrackingMode(next) !== 'steps') return;
    const previousSessions = new Map(
      previous.stepSessions.map((session) => [session.stepId, session.completedAt])
    );
    const steps = orderedSnapshotSteps(next);
    const completed = next.stepSessions
      .filter(
        (session) =>
          session.completedAt !== null &&
          previousSessions.get(session.stepId) !== session.completedAt
      )
      .sort((left, right) => timestampMs(left.completedAt!) - timestampMs(right.completedAt!));

    for (const session of completed) {
      const stepIndex = steps.findIndex((step) => step.id === session.stepId);
      const nextStep =
        stepIndex < 0
          ? undefined
          : steps.slice(stepIndex + 1).find((step) => step.enabled !== false);
      const activityId = next.status === 'cancelled' ? null : (nextStep?.activityId ?? null);
      await this.switchRoutineActivity(activityId, session.completedAt!, previous);
    }

    if (
      (next.status === 'running' || next.status === 'paused') &&
      next.currentStepStartedAt !== null
    ) {
      const currentStep = steps[next.currentStepIndex];
      if (currentStep?.activityId !== null && currentStep?.activityId !== undefined) {
        await this.switchRoutineActivity(currentStep.activityId, next.currentStepStartedAt, next);
      }
    } else if (
      (next.status === 'awaiting-next-activity' || next.status === 'cancelled') &&
      next.completedAt !== null
    ) {
      await this.switchRoutineActivity(null, next.completedAt, next);
    }
  }

  private async switchRoutineActivity(
    activityId: UUID | null,
    timestamp: IsoTimestamp,
    previous: ActiveRoutine
  ): Promise<void> {
    const current = await this.trackerService.getActiveTransition(timestamp);
    if (current?.activityId === activityId) return;
    if (
      current &&
      timestampMs(current.timestamp) === timestampMs(timestamp) &&
      (current.activityId === null || routineOwnsActivity(previous, current.activityId))
    ) {
      await this.trackerService.editTransition(current.id, {
        activityId,
        source: 'routine',
        timestamp,
      });
      return;
    }
    await this.trackerService.switchActivity(activityId, {
      source: 'routine',
      timestamp,
    });
  }

  private async persistAwaitingCompletion(
    active: ActiveRoutine
  ): Promise<RoutineFinalizationResult> {
    const run = routineRunHistory(active, 'completed');
    if (this.routineRepository.persistAwaiting) {
      await this.routineRepository.persistAwaiting(active, run);
    } else {
      await this.routineRepository.appendHistory(run);
      await this.routineRepository.writeActive(active);
    }
    await this.stopRoutineAt(active, 'Routine completed; awaiting next activity');
    return { activeRoutine: active, run };
  }

  private async stopRoutineAt(active: ActiveRoutine, note: string): Promise<TimeTransition> {
    if (!active.completedAt) throw new Error('Routine has no completion timestamp');
    const completionMs = timestampMs(active.completedAt);
    const current = await this.trackerService.getActiveTransition(active.completedAt);
    // A paused routine can be cancelled after the user has switched to a
    // separate tracker activity. Ending the routine must leave that activity
    // running instead of replacing it with a stop marker.
    if (
      current &&
      current.activityId !== null &&
      (current.source !== 'routine' || !routineOwnsActivity(active, current.activityId))
    ) {
      return current;
    }
    if (current && timestampMs(current.timestamp) === completionMs) {
      if (current.activityId === null) return current;
      return this.trackerService.editTransition(current.id, {
        activityId: null,
        timestamp: active.completedAt,
        source: 'routine',
        note,
      });
    }
    return this.trackerService.switchActivity(null, {
      id: active.id,
      timestamp: active.completedAt,
      source: 'routine',
      note,
    });
  }

  private async ensureJournalRecovered(): Promise<void> {
    const recovery = await this.routineRepository.recoverJournal();
    if (recovery.failed.length > 0) {
      throw new PersistenceError(
        'journal',
        `Routine journal recovery failed: ${recovery.failed
          .map(({ id, error }) => `${id}: ${error.message}`)
          .join('; ')}`,
        undefined,
        recovery.failed
      );
    }
  }

  private async transitionAt(timestamp: IsoTimestamp): Promise<TimeTransition | null> {
    const transition = await this.trackerService.getActiveTransition(timestamp);
    return transition && timestampMs(transition.timestamp) === timestampMs(timestamp)
      ? transition
      : null;
  }
}

export function createRoutineService(
  routineRepository: RoutineRepositoryApi,
  catalogService: CatalogServiceApi,
  trackerService: TrackerServiceApi,
  options?: RoutineServiceOptions
): RoutineService {
  return new RoutineService(routineRepository, catalogService, trackerService, options);
}
