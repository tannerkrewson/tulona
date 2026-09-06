import { create } from 'zustand';

import type {
  AppSettings,
  CatalogCollection,
  Habit,
  HabitDayOutcome,
  HabitDayState,
  LogicalDayKey,
} from '@domain';
import { logicalDayKey, shiftLogicalDay } from '@domain';
import { PersistenceError } from '@data';
import type { CatalogServiceApi } from '../catalog/catalog-service';

import type { CreateHabitInput, HabitServiceApi, UpdateHabitInput } from './habit-service';

export interface HabitStoreOptions {
  now?: () => Date | number | string;
  catalogService?: Pick<CatalogServiceApi, 'read'>;
  logicalDayRolloverHour?: number;
  weekStartsOn?: number;
}

export interface HabitStoreState {
  habits: Habit[];
  states: HabitDayState[];
  catalog: CatalogCollection | null;
  today: LogicalDayKey;
  selectedDay: LogicalDayKey;
  logicalDayRolloverHour: number;
  weekStartsOn: number;
  loading: boolean;
  saving: boolean;
  persistenceError: PersistenceError | null;
  updateSettings(settings: Pick<AppSettings, 'logicalDayRolloverHour' | 'weekStartsOn'>): void;
  hydrate(): Promise<void>;
  refresh(): Promise<void>;
  toggleManual(habitId: string, logicalDay?: LogicalDayKey): Promise<HabitDayState>;
  setManualCompletion(
    habitId: string,
    logicalDay: LogicalDayKey,
    completed: boolean | null
  ): Promise<HabitDayState>;
  setOutcome(
    habitId: string,
    logicalDay: LogicalDayKey,
    outcome: HabitDayOutcome | null
  ): Promise<HabitDayState>;
  selectDay(logicalDay: LogicalDayKey): Promise<void>;
  shiftSelectedDay(amount: number): Promise<void>;
  createHabit(input: CreateHabitInput): Promise<Habit>;
  updateHabit(id: string, input: UpdateHabitInput): Promise<Habit>;
  archiveHabit(id: string): Promise<Habit>;
  restoreHabit(id: string): Promise<Habit>;
}

interface HabitStoreSnapshot {
  habits: Habit[];
  states: HabitDayState[];
  catalog: CatalogCollection | null;
  today: LogicalDayKey;
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

function dayFor(value: Date | number | string, rolloverHour: number): LogicalDayKey {
  return logicalDayKey(value, { rolloverHour });
}

function historyStart(
  habits: readonly Habit[],
  today: LogicalDayKey,
  rolloverHour: number
): LogicalDayKey {
  const createdDays = habits
    .map((habit) => dayFor(habit.createdAt, rolloverHour))
    .filter((day) => day <= today);
  return createdDays.sort()[0] ?? today;
}

/** Feature state only; durable habit state remains owned by HabitService. */
export function createHabitStore(service: HabitServiceApi, options: HabitStoreOptions = {}) {
  const now = options.now ?? (() => Date.now());
  let logicalDayRolloverHour = options.logicalDayRolloverHour ?? 0;
  let weekStartsOn = options.weekStartsOn ?? 0;

  return create<HabitStoreState>((set, get) => {
    const readSnapshot = async (): Promise<HabitStoreSnapshot> => {
      const habits = await service.read();
      const today = dayFor(now(), logicalDayRolloverHour);
      const selectedDay = get().selectedDay;
      const start = [historyStart(habits, today, logicalDayRolloverHour), selectedDay].sort()[0];
      const states = habits.length === 0 ? [] : await service.readStates(start, today);
      const catalog = options.catalogService ? await options.catalogService.read() : null;
      return { habits, states, catalog, today };
    };

    const runMutation = async <T>(mutation: () => Promise<T>): Promise<T> => {
      set({ saving: true, persistenceError: null });
      try {
        const result = await mutation();
        await get().refresh();
        return result;
      } catch (error) {
        set({ persistenceError: errorFrom(error) });
        throw error;
      } finally {
        set({ saving: false });
      }
    };

    return {
      habits: [],
      states: [],
      catalog: null,
      today: dayFor(now(), logicalDayRolloverHour),
      selectedDay: dayFor(now(), logicalDayRolloverHour),
      logicalDayRolloverHour,
      weekStartsOn,
      loading: false,
      saving: false,
      persistenceError: null,
      hydrate: async () => {
        set({ loading: true, persistenceError: null });
        try {
          set({ ...(await readSnapshot()), loading: false });
        } catch (error) {
          set({ loading: false, persistenceError: errorFrom(error) });
          throw error;
        }
      },
      refresh: async () => {
        set({ loading: true, persistenceError: null });
        try {
          set({ ...(await readSnapshot()), loading: false });
        } catch (error) {
          set({ loading: false, persistenceError: errorFrom(error) });
          throw error;
        }
      },
      updateSettings: (settings) => {
        const previousToday = get().today;
        logicalDayRolloverHour = settings.logicalDayRolloverHour;
        weekStartsOn = settings.weekStartsOn;
        const nextToday = dayFor(now(), logicalDayRolloverHour);
        set({
          logicalDayRolloverHour,
          weekStartsOn,
          today: nextToday,
          selectedDay: get().selectedDay === previousToday ? nextToday : get().selectedDay,
        });
      },
      toggleManual: (habitId, logicalDay = get().today) => {
        const existing = get().states.find(
          (state) => state.habitId === habitId && state.logicalDay === logicalDay
        );
        return get().setManualCompletion(
          habitId,
          logicalDay,
          existing?.manual === true ? null : true
        );
      },
      setManualCompletion: (habitId, logicalDay, completed) =>
        runMutation(() => service.setManualCompletion(habitId, logicalDay, completed)),
      setOutcome: (habitId, logicalDay, outcome) =>
        runMutation(() => service.setOutcome(habitId, logicalDay, outcome)),
      selectDay: async (logicalDay) => {
        dayFor(logicalDay, logicalDayRolloverHour);
        set({ selectedDay: logicalDay });
        await get().refresh();
      },
      shiftSelectedDay: async (amount) => {
        if (!Number.isInteger(amount))
          throw new RangeError('Selected-day shift must be an integer');
        const next = shiftLogicalDay(get().selectedDay, amount, {
          rolloverHour: logicalDayRolloverHour,
        });
        set({ selectedDay: next });
        await get().refresh();
      },
      createHabit: (input) => runMutation(() => service.createHabit(input)),
      updateHabit: (id, input) => runMutation(() => service.updateHabit(id, input)),
      archiveHabit: (id) => runMutation(() => service.archiveHabit(id)),
      restoreHabit: (id) => runMutation(() => service.restoreHabit(id)),
    };
  });
}

export type HabitStore = ReturnType<typeof createHabitStore>;
