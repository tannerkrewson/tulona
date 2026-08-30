import { create } from 'zustand';

import type { CatalogCollection, TimeInterval, TimeTransition } from '@domain';
import { PersistenceError, type CatalogRepositoryApi } from '@data';

import type {
  HistoricalConfirmationInput,
  SwitchActivityOptions,
  TimestampInput,
  TrackerServiceApi,
  TransitionEditInput,
} from './tracker-service';
import type { TrackerQuery, TrackerRange } from './tracker-engine';

export type TrackerSheet = 'adjust-start' | 'history' | null;

export interface TrackerStoreState {
  catalog: CatalogCollection | null;
  selectedRange: TrackerRange;
  transitions: TimeTransition[];
  intervals: TimeInterval[];
  activeTransition: TimeTransition | null;
  nowMs: number;
  sheet: TrackerSheet;
  loading: boolean;
  persistenceError: PersistenceError | null;
  hydrate(): Promise<void>;
  refresh(nowMs?: number): Promise<void>;
  setRange(range: TrackerRange): void;
  setSheet(sheet: TrackerSheet): void;
  switchActivity(
    activityId: string | null,
    options?: SwitchActivityOptions
  ): Promise<TimeTransition>;
  adjustLatestStart(timestamp: TimestampInput): Promise<TimeTransition>;
  adjustLatest(timestamp: TimestampInput): Promise<TimeTransition>;
  insertTransition(
    input: Parameters<TrackerServiceApi['insertTransition']>[0]
  ): Promise<TimeTransition>;
  editTransition(id: string, input: TransitionEditInput): Promise<TimeTransition>;
  deleteTransition(id: string, confirmation: HistoricalConfirmationInput): Promise<TimeTransition>;
  mergeTransition(id: string, confirmation: HistoricalConfirmationInput): Promise<TimeTransition>;
  mergeTransitions(id: string, confirmation: HistoricalConfirmationInput): Promise<TimeTransition>;
}

export interface TrackerStoreOptions {
  initialRange: TrackerRange;
  now?: () => number;
  catalogRepository?: CatalogRepositoryApi;
}

function errorFrom(error: unknown): PersistenceError {
  return error instanceof PersistenceError
    ? error
    : new PersistenceError(
        'write',
        error instanceof Error ? error.message : String(error),
        undefined,
        error
      );
}

function applyQuery(
  query: TrackerQuery
): Pick<TrackerStoreState, 'transitions' | 'intervals' | 'activeTransition' | 'nowMs'> {
  return {
    transitions: query.transitions,
    intervals: query.intervals,
    activeTransition: query.activeTransition,
    nowMs: query.nowMs,
  };
}

/** Feature state only; durable state remains owned by TrackerService and its repository. */
export function createTrackerStore(service: TrackerServiceApi, options: TrackerStoreOptions) {
  const now = options.now ?? (() => Date.now());
  return create<TrackerStoreState>((set, get) => {
    const runMutation = async <T>(mutation: () => Promise<T>): Promise<T> => {
      set({ persistenceError: null });
      try {
        const result = await mutation();
        await get().refresh();
        return result;
      } catch (error) {
        const persistenceError = errorFrom(error);
        set({ persistenceError, loading: false });
        throw error;
      }
    };

    return {
      catalog: null,
      selectedRange: options.initialRange,
      transitions: [],
      intervals: [],
      activeTransition: null,
      nowMs: now(),
      sheet: null,
      loading: false,
      persistenceError: null,
      hydrate: async () => {
        set({ loading: true, persistenceError: null });
        try {
          const catalog = options.catalogRepository
            ? await options.catalogRepository.read()
            : get().catalog;
          const query = await service.query(get().selectedRange, now());
          set({ catalog, loading: false, ...applyQuery(query) });
        } catch (error) {
          set({ loading: false, persistenceError: errorFrom(error) });
          throw error;
        }
      },
      refresh: async (currentNowMs = now()) => {
        set({ loading: true, persistenceError: null });
        try {
          const query = await service.query(get().selectedRange, currentNowMs);
          set({ loading: false, ...applyQuery(query) });
        } catch (error) {
          set({ loading: false, persistenceError: errorFrom(error) });
          throw error;
        }
      },
      setRange: (selectedRange) => set({ selectedRange }),
      setSheet: (sheet) => set({ sheet }),
      switchActivity: (activityId, switchOptions) =>
        runMutation(() => service.switchActivity(activityId, switchOptions)),
      adjustLatestStart: (timestamp) => runMutation(() => service.adjustLatestStart(timestamp)),
      adjustLatest: (timestamp) => runMutation(() => service.adjustLatest(timestamp)),
      insertTransition: (input) => runMutation(() => service.insertTransition(input)),
      editTransition: (id, input) => runMutation(() => service.editTransition(id, input)),
      deleteTransition: (id, confirmation) =>
        runMutation(() => service.deleteTransition(id, confirmation)),
      mergeTransition: (id, confirmation) =>
        runMutation(() => service.mergeTransition(id, confirmation)),
      mergeTransitions: (id, confirmation) =>
        runMutation(() => service.mergeTransitions(id, confirmation)),
    };
  });
}
