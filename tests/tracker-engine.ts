import {
  createTrackerService,
  createTrackerStore,
  latestValidTransition,
  materializeTransitionIntervals,
  queryTransitions,
  type TrackerServiceApi,
} from '../src/tracker';
import { PersistenceError, type TrackerRepositoryApi } from '../src/data';
import type { MonthKey, TimeTransition, TrackerMonthCollection, Transition } from '../src/domain';

const ids = {
  july: '11111111-1111-4111-8111-111111111111',
  august: '22222222-2222-4222-8222-222222222222',
  inserted: '33333333-3333-4333-8333-333333333333',
  edited: '44444444-4444-4444-8444-444444444444',
  switched: '55555555-5555-4555-8555-555555555555',
  future: '66666666-6666-4666-8666-666666666666',
};
const now = '2026-08-04T12:00:00.000Z';

function transition(
  id: string,
  timestamp: string,
  activityId: string | null,
  status: Transition['status'] = 'recorded'
): TimeTransition {
  return {
    id,
    activityId,
    timestamp,
    source: 'manual',
    status,
    createdAt: timestamp,
    correctionOfId: null,
    note: null,
  };
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

function cloneCollection(collection: TrackerMonthCollection): TrackerMonthCollection {
  return {
    month: collection.month,
    transitions: [...collection.transitions],
    latestTransitions: [...collection.latestTransitions],
  };
}

class MemoryTrackerRepository implements TrackerRepositoryApi {
  readonly months = new Map<MonthKey, TrackerMonthCollection>();
  readonly operations: string[] = [];
  readonly operationKinds: string[] = [];
  failWrites = false;

  async readMonth(month: MonthKey): Promise<TrackerMonthCollection> {
    return cloneCollection(
      this.months.get(month) ?? { month, transitions: [], latestTransitions: [] }
    );
  }

  async readMonths(start: MonthKey, end: MonthKey): Promise<Transition[]> {
    return [...this.months.entries()]
      .filter(([month]) => month >= start && month <= end)
      .flatMap(([, collection]) => collection.transitions);
  }

  async readRange(_startMs: number, endMs: number): Promise<Transition[]> {
    return [...this.months.values()]
      .flatMap((collection) => collection.transitions)
      .filter((candidate) => Date.parse(candidate.timestamp) <= endMs);
  }

  async writeMonth(collection: TrackerMonthCollection): Promise<void> {
    await this.writeCrossMonth([collection], `month-${collection.month}`);
  }

  async upsertTransitions(transitions: readonly Transition[], operationId?: string): Promise<void> {
    const byMonth = new Map<MonthKey, Transition[]>();
    for (const candidate of transitions) {
      const month = candidate.timestamp.slice(0, 7) as MonthKey;
      byMonth.set(month, [...(byMonth.get(month) ?? []), candidate]);
    }
    const collections = await Promise.all(
      [...byMonth.entries()].map(async ([month, additions]) => {
        const current = await this.readMonth(month);
        const byId = new Map(current.transitions.map((candidate) => [candidate.id, candidate]));
        additions.forEach((candidate) => byId.set(candidate.id, candidate));
        return { month, transitions: [...byId.values()], latestTransitions: [] };
      })
    );
    await this.writeCrossMonth(collections, operationId ?? 'upsert');
  }

  async writeCrossMonth(
    collections: readonly TrackerMonthCollection[],
    operationId: string,
    operationKind = 'tracker-month-write'
  ): Promise<void> {
    if (this.failWrites) throw new PersistenceError('write', 'simulated tracker write failure');
    this.operations.push(operationId);
    this.operationKinds.push(operationKind);
    collections.forEach((collection) =>
      this.months.set(collection.month, cloneCollection(collection))
    );
  }

  async recoverJournal(): Promise<{ recovered: string[]; failed: never[] }> {
    return { recovered: [], failed: [] };
  }
}

function range(startMs: number, endMs: number) {
  return { startMs, endMs };
}

async function run(): Promise<void> {
  const raw = [
    transition(ids.july, '2026-07-20T10:00:00.000Z', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    transition(ids.august, '2026-08-02T10:00:00.000Z', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
    transition(ids.switched, '2026-08-03T10:00:00.000Z', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
    transition(ids.future, '2026-08-05T10:00:00.000Z', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
    transition(
      ids.edited,
      '2026-08-03T11:00:00.000Z',
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      'superseded'
    ),
  ];
  const nowMs = Date.parse(now);
  const startMs = Date.parse('2026-08-03T06:00:00.000Z');
  const endMs = Date.parse('2026-08-04T00:00:00.000Z');

  assert(
    latestValidTransition(raw, nowMs)?.id === ids.switched,
    'latest active state must ignore future and superseded records'
  );
  const intervals = materializeTransitionIntervals(raw, { startMs, endMs, nowMs });
  assert(intervals.length === 2, 'range materialization must carry prior state and stop at now');
  assert(intervals[0]?.startMs === startMs, 'first interval must be clipped to range start');
  assert(
    intervals[0]?.endMs === Date.parse('2026-08-03T10:00:00.000Z'),
    'intervals must abut the next transition'
  );
  assert(intervals[1]?.endMs === endMs, 'historical ranges must end at their requested boundary');
  assert(
    intervals.every(
      (interval, index) => index === 0 || intervals[index - 1].endMs <= interval.startMs
    ),
    'derived intervals must never overlap'
  );
  assert(
    queryTransitions(raw, range(startMs, nowMs + 1), nowMs).activeTransition?.id === ids.switched,
    'query result must expose the derived active transition'
  );

  const repository = new MemoryTrackerRepository();
  await repository.upsertTransitions(raw);
  const service = createTrackerService(repository, { now: () => now });
  const operationCount = repository.operations.length;
  assert(
    (await service.switchActivity('cccccccc-cccc-4ccc-8ccc-cccccccccccc')).id === ids.switched,
    'switching to the active item must return the existing transition'
  );
  assert(repository.operations.length === operationCount, 'duplicate switch must not write');
  const switched = await service.switchActivity(null);
  assert(switched.activityId === null, 'switch must persist the stopped state');
  assert(
    (await service.getActiveTransition())?.id === switched.id,
    'switch success must be read back from durable state'
  );

  repository.failWrites = true;
  await rejects(
    () => service.switchActivity('ffffffff-ffff-4fff-8fff-ffffffffffff'),
    'failed switch writes must be visible to the caller'
  );
  repository.failWrites = false;
  assert(
    (await service.getActiveTransition())?.id === switched.id,
    'failed switch must not change the derived active state'
  );

  const correctionRepository = new MemoryTrackerRepository();
  await correctionRepository.upsertTransitions([
    transition(ids.july, '2026-07-20T10:00:00.000Z', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    transition(ids.august, '2026-08-02T10:00:00.000Z', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  ]);
  const correctionService = createTrackerService(correctionRepository, { now: () => now });
  const corrected = await correctionService.adjustLatestStart('2026-07-31T10:00:00.000Z');
  assert(corrected.id === ids.august, 'adjust latest must edit one transition');
  assert(
    correctionRepository.operations.at(-1)?.includes('adjust-latest') === true,
    'adjust must be journaled'
  );
  assert(
    (await correctionRepository.readMonth('2026-08')).transitions.length === 0 &&
      (await correctionRepository.readMonth('2026-07')).transitions.some(
        (candidate) => candidate.id === ids.august
      ),
    'adjust latest must move records across month buckets atomically'
  );
  await rejects(
    () => correctionService.adjustLatestStart('2026-07-19T00:00:00.000Z'),
    'adjust latest must not cross the preceding transition'
  );

  const historyRepository = new MemoryTrackerRepository();
  await historyRepository.upsertTransitions([
    transition(ids.july, '2026-07-20T10:00:00.000Z', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    transition(ids.august, '2026-07-31T10:00:00.000Z', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  ]);
  const historyService = createTrackerService(historyRepository, { now: () => now });
  const inserted = await historyService.insertMissedSwitch({
    id: ids.inserted,
    activityId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    timestamp: '2026-07-25T10:00:00.000Z',
  });
  const edited = await historyService.editTransition(inserted.id, {
    activityId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    timestamp: '2026-07-26T10:00:00.000Z',
  });
  assert(
    edited.activityId === 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'historical edit must reassign a transition'
  );
  await rejects(
    () => historyService.deleteTransition(edited.id),
    'historical delete must require confirmation'
  );
  await historyService.deleteTransition(edited.id, { confirm: true });
  const mergeCandidate = await historyService.insertTransition({
    id: ids.edited,
    activityId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    timestamp: '2026-07-27T10:00:00.000Z',
  });
  await historyService.mergeTransition(mergeCandidate.id, { confirm: true });
  assert(
    !(await historyRepository.readMonth('2026-07')).transitions.some(
      (candidate) => candidate.id === mergeCandidate.id
    ),
    'merge must delete the selected boundary so the preceding activity continues'
  );
  assert(
    historyRepository.operations.some((operation) =>
      operation.includes('tracker-transition-edit')
    ) &&
      historyRepository.operations.some((operation) =>
        operation.includes('tracker-transition-delete')
      ) &&
      historyRepository.operationKinds.includes('tracker-transition-edit') &&
      historyRepository.operationKinds.includes('tracker-transition-delete') &&
      historyRepository.operationKinds.includes('tracker-transition-merge'),
    'historical edit, delete, and merge must use repository writes'
  );

  const storeService: TrackerServiceApi = createTrackerService(historyRepository, {
    now: () => now,
  });
  const store = createTrackerStore(storeService, {
    initialRange: range(startMs, nowMs),
    now: () => nowMs,
  });
  await store.getState().hydrate();
  const storeSwitch = await store.getState().switchActivity('ffffffff-ffff-4fff-8fff-ffffffffffff');
  assert(
    store.getState().activeTransition?.id === storeSwitch.id,
    'store must publish state after a durable successful mutation'
  );
  const beforeFailure = store.getState().activeTransition?.id;
  historyRepository.failWrites = true;
  await rejects(
    () => store.getState().switchActivity('99999999-9999-4999-8999-999999999999'),
    'store must surface service persistence failures'
  );
  assert(
    store.getState().activeTransition?.id === beforeFailure,
    'store must update visible state after durable success only'
  );
  assert(
    store.getState().persistenceError !== null,
    'store must retain persistence errors for UI recovery'
  );
}

run().catch((error: unknown) => {
  throw error;
});
