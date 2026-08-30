import { habitCollectionSchema, habitDayStateSchema, habitMonthCollectionSchema } from '@domain';
import type { Habit, HabitDayState, HabitMonthCollection, MonthKey } from '@domain';

import type { KeyValueDatabase } from './database';
import { DatasetStore } from './dataset-store';
import { PersistenceError } from './errors';
import type { DatasetNamespace } from './namespaces';

export interface HabitRepositoryApi {
  readHabits(): Promise<Habit[]>;
  writeHabits(habits: readonly Habit[]): Promise<void>;
  readMonth(month: MonthKey): Promise<HabitMonthCollection>;
  writeMonth(collection: HabitMonthCollection): Promise<void>;
  upsertDayState(state: HabitDayState): Promise<void>;
  updateSignals(
    habitId: string,
    logicalDay: string,
    signals: Partial<Pick<HabitDayState, 'manual' | 'automatic'>>,
    updatedAt: string
  ): Promise<HabitDayState>;
}

function emptyMonth(month: MonthKey): HabitMonthCollection {
  return { month, states: [] };
}

function validateMonth(value: string): MonthKey {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))
    throw new RangeError(`Invalid habit month "${value}"`);
  return value as MonthKey;
}

export class HabitRepository implements HabitRepositoryApi {
  private readonly store: DatasetStore;

  constructor(
    database: KeyValueDatabase,
    private readonly namespace: DatasetNamespace
  ) {
    this.store = new DatasetStore(database);
  }

  async readHabits(): Promise<Habit[]> {
    return (await this.store.read(this.namespace, 'habits', habitCollectionSchema))?.habits ?? [];
  }

  async writeHabits(habits: readonly Habit[]): Promise<void> {
    await this.store.write(this.namespace, 'habits', habitCollectionSchema, {
      habits: [...habits],
    });
  }

  async readMonth(month: MonthKey): Promise<HabitMonthCollection> {
    const normalizedMonth = validateMonth(month);
    return (
      (await this.store.read(
        this.namespace,
        'habit-days',
        habitMonthCollectionSchema,
        normalizedMonth
      )) ?? emptyMonth(normalizedMonth)
    );
  }

  async writeMonth(collection: HabitMonthCollection): Promise<void> {
    const month = validateMonth(collection.month);
    if (collection.states.some((state) => state.logicalDay.slice(0, 7) !== month)) {
      throw new PersistenceError(
        'validation',
        `Habit month ${month} contains a state from another month`
      );
    }
    await this.store.write(
      this.namespace,
      'habit-days',
      habitMonthCollectionSchema,
      { ...collection, month },
      month
    );
  }

  async upsertDayState(state: HabitDayState): Promise<void> {
    const parsed = habitDayStateSchema.parse(state);
    const month = parsed.logicalDay.slice(0, 7) as MonthKey;
    const collection = await this.readMonth(month);
    const index = collection.states.findIndex(
      (candidate) =>
        candidate.habitId === parsed.habitId && candidate.logicalDay === parsed.logicalDay
    );
    const states = [...collection.states];
    if (index < 0) states.push(parsed);
    else states[index] = parsed;
    await this.writeMonth({ month, states });
  }

  async updateSignals(
    habitId: string,
    logicalDay: string,
    signals: Partial<Pick<HabitDayState, 'manual' | 'automatic'>>,
    updatedAt: string
  ): Promise<HabitDayState> {
    const month = logicalDay.slice(0, 7) as MonthKey;
    const collection = await this.readMonth(month);
    const existing = collection.states.find(
      (state) => state.habitId === habitId && state.logicalDay === logicalDay
    );
    const next: HabitDayState = {
      habitId,
      logicalDay: logicalDay as HabitDayState['logicalDay'],
      manual: Object.prototype.hasOwnProperty.call(signals, 'manual')
        ? (signals.manual ?? null)
        : (existing?.manual ?? null),
      automatic: Object.prototype.hasOwnProperty.call(signals, 'automatic')
        ? (signals.automatic ?? null)
        : (existing?.automatic ?? null),
      updatedAt,
    };
    await this.upsertDayState(next);
    return next;
  }
}

export function createHabitRepository(
  database: KeyValueDatabase,
  namespace: DatasetNamespace
): HabitRepository {
  return new HabitRepository(database, namespace);
}
