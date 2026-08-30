import { create } from 'zustand';

import {
  logicalDayBounds,
  logicalDayKey,
  type AppSettings,
  type CatalogCollection,
  type TimeInterval,
  type TimeTransition,
} from '@domain';
import { PersistenceError } from '@data/errors';
import type { CatalogRepositoryApi } from '@data/catalog-repository';
import type { CatalogServiceApi } from '../catalog/catalog-service';

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
  updateSettings(settings: Pick<AppSettings, 'logicalDayRolloverHour'>, nowMs?: number): void;
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
  insertMissedSwitch(
    input: Parameters<TrackerServiceApi['insertMissedSwitch']>[0]
  ): Promise<TimeTransition>;
  editTransition(id: string, input: TransitionEditInput): Promise<TimeTransition>;
  reassignTransition(id: string, activityId: string | null): Promise<TimeTransition>;
  deleteTransition(id: string, confirmation: HistoricalConfirmationInput): Promise<TimeTransition>;
  mergeTransition(id: string, confirmation: HistoricalConfirmationInput): Promise<TimeTransition>;
  mergeTransitions(id: string, confirmation: HistoricalConfirmationInput): Promise<TimeTransition>;
}

export interface TrackerStoreOptions {
  initialRange: TrackerRange;
  now?: () => number;
  catalogRepository?: CatalogRepositoryApi;
  catalogService?: Pick<CatalogServiceApi, 'read'>;
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
          const catalog = options.catalogService
            ? await options.catalogService.read()
            : options.catalogRepository
              ? await options.catalogRepository.read()
              : get().catalog;
          const query = await service.query(get().selectedRange, now());
          const activeTransition = await service.getActiveTransition(now());
          set({ catalog, loading: false, ...applyQuery(query), activeTransition });
        } catch (error) {
          set({ loading: false, persistenceError: errorFrom(error) });
          throw error;
        }
      },
      refresh: async (currentNowMs = now()) => {
        set({ loading: true, persistenceError: null });
        try {
          const query = await service.query(get().selectedRange, currentNowMs);
          const activeTransition = await service.getActiveTransition(currentNowMs);
          set({ loading: false, ...applyQuery(query), activeTransition });
        } catch (error) {
          set({ loading: false, persistenceError: errorFrom(error) });
          throw error;
        }
      },
      setRange: (selectedRange) => set({ selectedRange }),
      updateSettings: ({ logicalDayRolloverHour }, currentNowMs = now()) => {
        const day = logicalDayKey(currentNowMs, { rolloverHour: logicalDayRolloverHour });
        const bounds = logicalDayBounds(day, { rolloverHour: logicalDayRolloverHour });
        set({ selectedRange: { startMs: bounds.startMs, endMs: bounds.endMs } });
      },
      setSheet: (sheet) => set({ sheet }),
      switchActivity: (activityId, switchOptions) =>
        runMutation(() => service.switchActivity(activityId, switchOptions)),
      adjustLatestStart: (timestamp) => runMutation(() => service.adjustLatestStart(timestamp)),
      adjustLatest: (timestamp) => runMutation(() => service.adjustLatest(timestamp)),
      insertTransition: (input) => runMutation(() => service.insertTransition(input)),
      insertMissedSwitch: (input) => runMutation(() => service.insertMissedSwitch(input)),
      editTransition: (id, input) => runMutation(() => service.editTransition(id, input)),
      reassignTransition: (id, activityId) =>
        runMutation(() => service.reassignTransition(id, activityId)),
      deleteTransition: (id, confirmation) =>
        runMutation(() => service.deleteTransition(id, confirmation)),
      mergeTransition: (id, confirmation) =>
        runMutation(() => service.mergeTransition(id, confirmation)),
      mergeTransitions: (id, confirmation) =>
        runMutation(() => service.mergeTransitions(id, confirmation)),
    };
  });
}

export type TrackerStore = ReturnType<typeof createTrackerStore>;
