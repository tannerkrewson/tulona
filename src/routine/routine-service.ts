import {
  toTimestamp,
  type ActiveRoutine,
  type IsoTimestamp,
  type RoutineRunHistory,
  type RoutineStep,
  type UUID,
} from '@domain';
import type {
  CatalogServiceApi,
  CreateRoutineStepInput,
  DuplicateRoutineStepOptions,
  UpdateRoutineStepInput,
} from '../catalog/catalog-service';
import type { RoutineRepositoryApi } from '@data';
import {
  addRoutineTime as addRoutineTimeState,
  advanceRoutine as advanceRoutineState,
  cancelRoutine as cancelRoutineState,
  catchUpRoutine,
  completeRoutineStep,
  pauseRoutine as pauseRoutineState,
  resumeRoutine as resumeRoutineState,
  routineRunHistory,
  routineTiming,
  markRoutineAlarmFired,
  skipRoutineStep,
  startRoutine as startRoutineState,
  type RoutineStepAction,
  type RoutineTimestampInput,
} from './routine-engine';
import type { TrackerServiceApi } from '../tracker/tracker-service';

export interface StartRoutineOptions {
  id?: UUID;
  transitionId?: UUID;
  startedAt?: RoutineTimestampInput;
  note?: string | null;
}

export interface RoutineServiceOptions {
  now?: () => RoutineTimestampInput;
}

export interface RoutineServiceApi {
  getActive(): Promise<ActiveRoutine | null>;
  startRoutine(routineId: UUID, options?: StartRoutineOptions): Promise<ActiveRoutine>;
  pause(at?: RoutineTimestampInput): Promise<ActiveRoutine>;
  resume(at?: RoutineTimestampInput): Promise<ActiveRoutine>;
  addTime(addedTimeMs: number, at?: RoutineTimestampInput): Promise<ActiveRoutine>;
  addRoutineTime(addedTimeMs: number, at?: RoutineTimestampInput): Promise<ActiveRoutine>;
  done(at?: RoutineTimestampInput): Promise<ActiveRoutine>;
  completeStep(at?: RoutineTimestampInput): Promise<ActiveRoutine>;
  skip(at?: RoutineTimestampInput): Promise<ActiveRoutine>;
  advance(action?: RoutineStepAction, at?: RoutineTimestampInput): Promise<ActiveRoutine>;
  cancel(at?: RoutineTimestampInput): Promise<ActiveRoutine>;
  markAlarmFired(stepId: UUID): Promise<ActiveRoutine>;
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
    const existing = await this.routineRepository.readActive();
    if (existing) throw new Error('Cannot start a routine while another routine is active');
    const routine = await this.catalogService.getRoutine(routineId);
    if (routine.archivedAt !== null) throw new Error('Cannot start an archived routine');
    const startedAt = options.startedAt ?? this.now();
    const snapshot = await this.catalogService.snapshotRoutine(routineId, asTimestamp(startedAt));
    if (snapshot.steps.length === 0) {
      throw new Error('A routine needs at least one startable step');
    }
    const active = startRoutineState(snapshot, startedAt, { id: options.id });
    const companion = this.routineRepository.prepareActiveWrite?.(active);
    const transitionOptions = {
      id: options.transitionId,
      timestamp: asTimestamp(startedAt),
      source: 'routine' as const,
      note: options.note ?? null,
    };
    if (this.trackerService.switchActivityWithCompanion && companion) {
      await this.trackerService.switchActivityWithCompanion(routineId, transitionOptions, [
        companion,
      ]);
      return active;
    }

    // Older adapters can still leave a clean state if tracker startup fails.
    await this.routineRepository.writeActive(active);
    try {
      await this.trackerService.switchActivity(routineId, transitionOptions);
    } catch (error) {
      await this.routineRepository.clearActive();
      throw error;
    }
    return active;
  }

  async pause(at: RoutineTimestampInput = this.now()): Promise<ActiveRoutine> {
    return this.mutate((active) => pauseRoutineState(active, at));
  }

  async resume(at: RoutineTimestampInput = this.now()): Promise<ActiveRoutine> {
    return this.mutate((active) => resumeRoutineState(active, at));
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

  async done(at: RoutineTimestampInput = this.now()): Promise<ActiveRoutine> {
    return this.mutate((active) => completeRoutineStep(active, at));
  }

  async completeStep(at: RoutineTimestampInput = this.now()): Promise<ActiveRoutine> {
    return this.done(at);
  }

  async skip(at: RoutineTimestampInput = this.now()): Promise<ActiveRoutine> {
    return this.mutate((active) => skipRoutineStep(active, at));
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

  async markAlarmFired(stepId: UUID): Promise<ActiveRoutine> {
    return this.mutate((active) => markRoutineAlarmFired(active, stepId));
  }

  async recover(at: RoutineTimestampInput = this.now()): Promise<ActiveRoutine | null> {
    const recovery = await this.routineRepository.recoverJournal();
    if (recovery.failed.length > 0) throw recovery.failed[0].error;
    const active = await this.routineRepository.readActive();
    if (!active) return null;
    const result = catchUpRoutine(active, at);
    if (JSON.stringify(result.activeRoutine) !== JSON.stringify(active)) {
      await this.routineRepository.writeActive(result.activeRoutine);
    }
    return result.activeRoutine;
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
    const active = activeRequired(await this.routineRepository.readActive());
    const next = transform(active);
    await this.routineRepository.writeActive(next);
    return next;
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
