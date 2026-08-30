import {
  AsyncStorageDatabase,
  CatalogRepository,
  DatasetManager,
  RoutineRepository,
  TrackerRepository,
} from '../src/data';
import { CatalogService } from '../src/catalog/catalog-service';
import { createRoutineService } from '../src/routine';
import { createTrackerService } from '../src/tracker';
import type { AsyncStorageLike } from '../src/data';

const datasetId = '11111111-1111-4111-8111-111111111111';
const routineId = '22222222-2222-4222-8222-222222222222';
const activityId = '33333333-3333-4333-8333-333333333333';
const runId = '44444444-4444-4444-8444-444444444444';
const transitionId = '55555555-5555-4555-8555-555555555555';
const startedAt = '2026-08-30T00:00:00.000Z';

class MemoryStorage implements AsyncStorageLike {
  readonly values = new Map<string, string>();
  failTrackerWrites = false;

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    if (this.failTrackerWrites && key.includes(':tracker:')) throw new Error('tracker unavailable');
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function createServices(storage: MemoryStorage) {
  const database = new AsyncStorageDatabase(storage);
  const manager = new DatasetManager(database);
  const namespace = await manager.create('Routine test', datasetId);
  await manager.activate(datasetId);
  const catalogRepository = new CatalogRepository(database, namespace);
  const catalogService = new CatalogService(catalogRepository, { now: () => startedAt });
  await catalogService.createActivity({ id: activityId, name: 'Focus' });
  await catalogService.createRoutine({
    id: routineId,
    name: 'Focus block',
    steps: [{ activityId, durationMs: 60_000, endBehavior: 'overtime', notes: 'Deep work' }],
  });
  const trackerRepository = new TrackerRepository(database, namespace);
  const trackerService = createTrackerService(trackerRepository, { now: () => startedAt });
  const routineRepository = new RoutineRepository(database, namespace);
  const routineService = createRoutineService(routineRepository, catalogService, trackerService, {
    now: () => startedAt,
  });
  return { database, catalogService, routineRepository, routineService, trackerService };
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
}

run().catch((error: unknown) => {
  throw error;
});
