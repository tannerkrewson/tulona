import { AsyncStorageDatabase } from '../src/data/database';
import { CatalogRepository } from '../src/data/catalog-repository';
import { DatasetManager } from '../src/data/namespaces';
import { RoutineRepository } from '../src/data/routine-repository';
import { TrackerRepository } from '../src/data/tracker-repository';
import { CatalogService } from '../src/catalog/catalog-service';
import { createRoutineService } from '../src/routine/routine-service';
import { createTrackerService } from '../src/tracker/tracker-service';
import type { AsyncStorageLike } from '../src/data';

const datasetId = '11111111-1111-4111-8111-111111111111';
const routineId = '22222222-2222-4222-8222-222222222222';
const activityId = '33333333-3333-4333-8333-333333333333';
const secondActivityId = '88888888-8888-4888-8888-888888888888';
const runId = '44444444-4444-4444-8444-444444444444';
const transitionId = '55555555-5555-4555-8555-555555555555';
const startedAt = '2026-08-30T00:00:00.000Z';

function at(offsetMs: number): string {
  return new Date(Date.parse(startedAt) + offsetMs).toISOString();
}

class MemoryStorage implements AsyncStorageLike {
  readonly values = new Map<string, string>();
  failTrackerWrites = false;
  failNextKey: string | null = null;
  failNextRemoveKey: string | null = null;

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    if (this.failTrackerWrites && key.includes(':tracker:')) throw new Error('tracker unavailable');
    if (this.failNextKey && key.includes(this.failNextKey)) {
      this.failNextKey = null;
      throw new Error(`write unavailable for ${key}`);
    }
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    if (this.failNextRemoveKey && key.includes(this.failNextRemoveKey)) {
      this.failNextRemoveKey = null;
      throw new Error(`remove unavailable for ${key}`);
    }
    this.values.delete(key);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function rejects(action: () => Promise<unknown>, message: string): Promise<void> {
  try {
    await action();
  } catch {
    return;
  }
  throw new Error(message);
}

async function createServices(
  storage: MemoryStorage,
  trackingMode: 'overall' | 'steps' = 'overall'
) {
  let currentNow = startedAt;
  const database = new AsyncStorageDatabase(storage);
  const manager = new DatasetManager(database);
  const namespace = await manager.create('Routine test', datasetId);
  await manager.activate(datasetId);
  const catalogRepository = new CatalogRepository(database, namespace);
  const catalogService = new CatalogService(catalogRepository, { now: () => startedAt });
  await catalogService.createActivity({ id: activityId, name: 'Focus' });
  await catalogService.createActivity({ id: secondActivityId, name: 'Reset' });
  await catalogService.createRoutine({
    id: routineId,
    name: 'Focus block',
    trackingMode,
    steps: [{ activityId, durationMs: 60_000, endBehavior: 'overtime', notes: 'Deep work' }],
  });
  const trackerRepository = new TrackerRepository(database, namespace);
  const trackerService = createTrackerService(trackerRepository, { now: () => currentNow });
  const routineRepository = new RoutineRepository(database, namespace);
  const routineService = createRoutineService(routineRepository, catalogService, trackerService, {
    now: () => currentNow,
  });
  return {
    database,
    catalogService,
    routineRepository,
    routineService,
    trackerService,
    setNow(value: string) {
      currentNow = value;
    },
  };
}

async function run(): Promise<void> {
  const storage = new MemoryStorage();
  const services = await createServices(storage);
  const firstStep = (await services.catalogService.getRoutine(routineId)).steps[0];
  assert(firstStep, 'routine fixture has a step');
  const createdStep = await services.catalogService.createRoutineStep(routineId, {
    id: '66666666-6666-4666-8666-666666666666',
    activityId,
    durationMs: 30_000,
    name: 'Second step',
    endBehavior: 'autoAdvance',
    notes: 'A note',
  });
  assert(
    createdStep.endBehavior === 'auto-advance',
    'step create normalizes auto-advance behavior'
  );
  const updatedStep = await services.catalogService.updateRoutineStep(routineId, createdStep.id, {
    durationMs: 45_000,
    notes: 'Updated note',
  });
  assert(updatedStep.durationMs === 45_000, 'step update persists duration');
  const captured = await services.catalogService.snapshotRoutine(routineId, startedAt);
  await services.catalogService.updateRoutineStep(routineId, createdStep.id, {
    name: 'Edited later',
  });
  assert(
    captured.steps.find((step) => step.id === createdStep.id)?.name === 'Second step',
    'routine snapshots do not alias later definition edits'
  );
  const duplicateStep = await services.catalogService.duplicateRoutineStep(
    routineId,
    createdStep.id,
    {
      id: '77777777-7777-4777-8777-777777777777',
    }
  );
  assert(duplicateStep.id !== createdStep.id, 'step duplicate receives a new ID');
  await services.catalogService.deleteRoutineStep(routineId, duplicateStep.id);
  assert(
    (await services.catalogService.getRoutine(routineId)).steps.every(
      (step) => step.sortOrder >= 0
    ),
    'step CRUD keeps normalized ordering'
  );
  const started = await services.routineService.startRoutine(routineId, {
    id: runId,
    transitionId,
    startedAt,
  });
  assert(started.id === runId, 'start returns the persisted active run');
  assert(
    (await services.routineRepository.readActive())?.id === runId,
    'start persists active state'
  );
  assert(
    (await services.trackerService.getActiveTransition(startedAt))?.activityId === routineId,
    'start records a top-level routine transition through the tracker service'
  );

  services.setNow(at(120_000));
  await services.routineService.skip(at(30_000));
  const completed = await services.routineService.done(at(60_000));
  assert(completed.status === 'awaiting-next-activity', 'last step enters the chooser state');
  await services.routineService.finalizeCompletion(at(90_000));
  await services.routineService.finalizeCompletion(at(100_000));
  assert(
    (await services.routineRepository.readHistory('2026-08')).runs.length === 1,
    'completion finalization is idempotent'
  );
  const completionMarker = await services.trackerService.getActiveTransition(at(60_000));
  assert(
    completionMarker?.activityId === null,
    'completion stops routine attribution at completionAt'
  );
  await services.routineService.selectNextActivity(activityId);
  assert(
    (await services.routineRepository.readActive()) === null,
    'chooser selection clears active state'
  );
  assert(
    (await services.trackerService.getActiveTransition(at(90_000)))?.activityId === activityId,
    'chooser selection is recorded at completionAt'
  );

  const secondRun = await services.routineService.startRoutine(routineId, {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    startedAt: at(120_000),
  });
  services.setNow(at(130_000));
  await services.routineService.cancelAndFinalize(at(130_000));
  assert(
    (await services.routineRepository.readActive()) === null,
    'cancellation clears active state'
  );
  assert(
    (await services.routineRepository.readHistory('2026-08')).runs.some(
      (run) => run.id === secondRun.id && run.status === 'cancelled'
    ),
    'cancellation persists cancelled history'
  );

  services.setNow(at(140_000));
  const exactRun = await services.routineService.startRoutine(routineId, {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    startedAt: at(140_000),
  });
  await services.routineService.done(at(140_000));
  await services.routineService.done(at(140_000));
  await services.routineService.finalizeCompletion(at(140_000));
  assert(
    (await services.trackerService.getActiveTransition(at(140_000)))?.activityId === null,
    'completion at the start timestamp reuses the routine transition'
  );
  await services.routineService.selectNextActivity(activityId);
  assert(
    (await services.routineRepository.readHistory('2026-08')).runs.some(
      (run) => run.id === exactRun.id && run.status === 'completed'
    ),
    'exact-time completion remains in history'
  );

  const failedStorage = new MemoryStorage();
  failedStorage.failTrackerWrites = true;
  const failed = await createServices(failedStorage);
  try {
    await failed.routineService.startRoutine(routineId, { id: runId, startedAt });
    throw new Error('a tracker failure should reject routine start');
  } catch {
    assert(
      (await failed.routineRepository.readActive()) === null,
      'failed start leaves no active object'
    );
  }
  failedStorage.failTrackerWrites = false;
  const recovery = await failed.routineRepository.recoverJournal();
  assert(recovery.recovered.length === 1, 'journal recovery reports interrupted routine start');
  assert(
    (await failed.routineRepository.readActive())?.id === runId,
    'recovery restores active state'
  );
  assert(
    (await failed.trackerService.getActiveTransition(startedAt))?.activityId === routineId,
    'recovery restores the matching tracker transition'
  );

  const interruptedStorage = new MemoryStorage();
  const interrupted = await createServices(interruptedStorage);
  interrupted.setNow(at(150_000));
  const interruptedRun = await interrupted.routineService.startRoutine(routineId, {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    startedAt: at(150_000),
  });
  interruptedStorage.failNextKey = ':active-routine';
  await rejects(
    () => interrupted.routineService.cancelAndFinalize(at(160_000)),
    'a failed cancellation marker write must surface to the caller'
  );
  interruptedStorage.failNextKey = null;
  interrupted.setNow(at(160_000));
  assert(
    (await interrupted.routineRepository.readActive())?.id === interruptedRun.id,
    'an interrupted cancellation remains discoverable instead of disappearing'
  );
  assert(
    (await interrupted.routineService.recover(at(160_000))) === null,
    'routine recovery finishes an interrupted cancellation'
  );
  assert(
    (await interrupted.routineRepository.readActive()) === null,
    'recovered cancellation cannot strand an active routine'
  );
  assert(
    (await interrupted.routineRepository.readHistory('2026-08')).runs.filter(
      (run) => run.id === interruptedRun.id
    ).length === 1,
    'recovered cancellation writes exactly one history record'
  );
  assert(
    (await interrupted.routineService.recover(at(160_000))) === null &&
      (await interrupted.routineRepository.readHistory('2026-08')).runs.filter(
        (run) => run.id === interruptedRun.id
      ).length === 1,
    'repeating recovery does not duplicate cancellation history'
  );

  const chooserFailureStorage = new MemoryStorage();
  const chooserFailure = await createServices(chooserFailureStorage);
  chooserFailure.setNow(at(170_000));
  const chooserRun = await chooserFailure.routineService.startRoutine(routineId, {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    startedAt: at(170_000),
  });
  await chooserFailure.routineService.done(at(170_000));
  await chooserFailure.routineService.finalizeCompletion(at(170_000));
  chooserFailureStorage.failNextRemoveKey = ':active-routine';
  await rejects(
    () => chooserFailure.routineService.selectNextActivity(activityId),
    'a failed finalization clear must surface to the caller'
  );
  chooserFailureStorage.failNextRemoveKey = null;
  const selected = await chooserFailure.routineService.selectNextActivity(activityId);
  assert(selected.activityId === activityId, 'retry must preserve the selected next activity');
  assert(
    (await chooserFailure.routineRepository.readActive()) === null,
    'retry after finalization failure clears the active routine'
  );
  assert(
    (await chooserFailure.routineRepository.readHistory('2026-08')).runs.filter(
      (run) => run.id === chooserRun.id
    ).length === 1,
    'retry after finalization failure does not duplicate history'
  );

  const chooserCrash = await createServices(new MemoryStorage());
  chooserCrash.setNow(at(180_000));
  const chooserCrashRun = await chooserCrash.routineService.startRoutine(routineId, {
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    startedAt: at(180_000),
  });
  const chooserCrashCompleted = await chooserCrash.routineService.done(at(180_000));
  await chooserCrash.routineService.finalizeCompletion(at(180_000));
  assert(chooserCrashCompleted.completedAt, 'chooser crash fixture has a completion timestamp');
  const chooserCompletionMarker = await chooserCrash.trackerService.getActiveTransition(
    chooserCrashCompleted.completedAt
  );
  assert(chooserCompletionMarker, 'chooser crash fixture has a completion boundary');
  await chooserCrash.trackerService.editTransition(chooserCompletionMarker.id, {
    activityId,
    timestamp: chooserCrashCompleted.completedAt,
    source: 'routine',
    note: 'Next activity after routine',
  });
  assert(
    (await chooserCrash.routineRepository.readActive())?.status === 'awaiting-next-activity',
    'chooser crash fixture retains the awaiting state before recovery'
  );
  assert(
    (await chooserCrash.routineService.recover(at(180_000))) === null,
    'recovery finalizes a next-activity transition written before a crash'
  );
  assert(
    (await chooserCrash.routineRepository.readActive()) === null,
    'chooser recovery clears the stranded awaiting routine'
  );
  assert(
    (await chooserCrash.routineRepository.readHistory('2026-08')).runs.filter(
      (run) => run.id === chooserCrashRun.id
    ).length === 1,
    'chooser crash recovery writes one completion history record'
  );

  const stepTracked = await createServices(new MemoryStorage(), 'steps');
  await stepTracked.catalogService.createRoutineStep(routineId, {
    activityId: secondActivityId,
    durationMs: 30_000,
    name: 'Reset step',
  });
  const stepRun = await stepTracked.routineService.startRoutine(routineId, {
    id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    startedAt,
  });
  assert(
    (await stepTracked.trackerService.getActiveTransition(startedAt))?.activityId === activityId,
    'step-tracked routines start with the first step activity'
  );
  stepTracked.setNow(at(2_000));
  await stepTracked.routineService.skip(at(1_000));
  assert(
    (await stepTracked.trackerService.getActiveTransition(at(1_000)))?.activityId ===
      secondActivityId,
    'step completion switches tracker attribution to the next step'
  );
  const stepCompleted = await stepTracked.routineService.done(at(2_000));
  assert(
    stepCompleted.status === 'awaiting-next-activity',
    'step routine completion awaits chooser'
  );
  assert(
    (await stepTracked.trackerService.getActiveTransition(at(2_000)))?.activityId === null,
    'step routine completion stops step attribution'
  );
  await stepTracked.routineService.finalizeCompletion(at(2_000));
  assert(
    stepRun.id === 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    'step run persists its supplied ID'
  );
}

run().catch((error: unknown) => {
  throw error;
});
