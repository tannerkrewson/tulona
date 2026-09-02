import {
  createId,
  dateForLogicalDay,
  habitSchema,
  isUuid,
  normalizeHabitOrder,
  sortByOrder,
  toTimestamp,
  type Habit,
  type HabitDayState,
  type HabitSchedule,
  type HabitTrigger,
  type IsoTimestamp,
  type LogicalDayKey,
  type MonthKey,
  type UUID,
} from '@domain';
import type { HabitRepositoryApi } from '@data';

import { PersistenceError } from '../data/errors';
import { isIconValue } from '../icons/icon-names';
import { isHabitScheduledDay } from './schedule';
import { normalizeHabitTrigger, type HabitCatalogReferenceApi } from './trigger';

export interface HabitStyleInput {
  name: string;
  description?: string | null;
  color?: string | null;
  iconName?: string | null;
}

export interface CreateHabitInput extends HabitStyleInput {
  id?: UUID;
  schedule: HabitSchedule;
  trigger?: HabitTrigger | null;
  sortOrder?: number;
}

export interface UpdateHabitInput {
  name?: string;
  description?: string | null;
  color?: string | null;
  iconName?: string | null;
  schedule?: HabitSchedule;
  trigger?: HabitTrigger | null;
  sortOrder?: number;
}

export interface HabitServiceOptions {
  now?: () => Date | number | string;
  catalog?: HabitCatalogReferenceApi;
}

export interface HabitSignalUpdate {
  manual?: boolean | null;
  automatic?: boolean | null;
}

export interface HabitServiceApi {
  read(): Promise<Habit[]>;
  active(): Promise<Habit[]>;
  get(id: UUID): Promise<Habit>;
  create(input: CreateHabitInput): Promise<Habit>;
  createHabit(input: CreateHabitInput): Promise<Habit>;
  update(id: UUID, input: UpdateHabitInput): Promise<Habit>;
  updateHabit(id: UUID, input: UpdateHabitInput): Promise<Habit>;
  archive(id: UUID): Promise<Habit>;
  archiveHabit(id: UUID): Promise<Habit>;
  restore(id: UUID): Promise<Habit>;
  restoreHabit(id: UUID): Promise<Habit>;
  reorder(id: UUID, direction: 'up' | 'down'): Promise<Habit[]>;
  readMonth(month: MonthKey): Promise<import('@domain').HabitMonthCollection>;
  readStates(start: LogicalDayKey, end: LogicalDayKey): Promise<HabitDayState[]>;
  readDayState(habitId: UUID, logicalDay: LogicalDayKey): Promise<HabitDayState | null>;
  updateSignals(
    habitId: UUID,
    logicalDay: LogicalDayKey,
    signals: HabitSignalUpdate
  ): Promise<HabitDayState>;
  setManualCompletion(
    habitId: UUID,
    logicalDay: LogicalDayKey,
    completed: boolean | null
  ): Promise<HabitDayState>;
  setAutomaticCompletion(
    habitId: UUID,
    logicalDay: LogicalDayKey,
    completed: boolean | null
  ): Promise<HabitDayState>;
}

function validation(message: string): never {
  throw new PersistenceError('validation', message);
}

function assertId(value: string, label: string): asserts value is UUID {
  if (!isUuid(value)) validation(`${label} must be a UUID`);
}

function assertLogicalDay(value: string): asserts value is LogicalDayKey {
  try {
    dateForLogicalDay(value as LogicalDayKey);
  } catch {
    validation(`Invalid logical day "${value}"`);
  }
}

function validateName(value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    validation('Habit names must not be empty');
  }
  return value.trim();
}

function validateDescription(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value.trim() === '') return null;
  return value.trim();
}

function validateColor(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value === '') return null;
  const normalized = value.trim();
  if (!/^#[0-9a-f]{6}$/i.test(normalized)) {
    validation('Habit colors must be six-digit hexadecimal values');
  }
  return normalized.toUpperCase();
}

function validateIcon(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (!isIconValue(value)) validation(`Unknown habit icon "${value}"`);
  return value;
}

function validateSchedule(schedule: HabitSchedule): HabitSchedule {
  try {
    // The pure evaluator is also the single validation path for recurrence values.
    isHabitScheduledDay(schedule, '2026-01-01');
  } catch (error) {
    validation(error instanceof Error ? error.message : String(error));
  }
  return schedule;
}

function validateSortOrder(value: number | undefined, fallback: number): number {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < 0) validation('Habit sort order must be non-negative');
  return result;
}

function assertHabits(habits: readonly Habit[]): void {
  const ids = new Set<string>();
  for (const habit of habits) {
    const parsed = habitSchema.safeParse(habit);
    if (!parsed.success) validation(`Habit failed validation: ${parsed.error.message}`);
    if (ids.has(habit.id)) validation(`Duplicate habit ID "${habit.id}"`);
    ids.add(habit.id);
    validateName(habit.name);
    validateColor(habit.color);
    validateIcon(habit.iconName);
    validateSchedule(habit.schedule);
  }
}

function monthKeys(start: LogicalDayKey, end: LogicalDayKey): MonthKey[] {
  assertLogicalDay(start);
  assertLogicalDay(end);
  if (start > end) throw new RangeError('Logical-day range end must not precede its start');
  const current = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1, 1));
  const last = new Date(Date.UTC(Number(end.slice(0, 4)), Number(end.slice(5, 7)) - 1, 1));
  const result: MonthKey[] = [];
  while (current <= last) {
    result.push(
      `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, '0')}` as MonthKey
    );
    current.setUTCMonth(current.getUTCMonth() + 1);
  }
  return result;
}

export class HabitService implements HabitServiceApi {
  private readonly now: () => Date | number | string;

  constructor(
    private readonly repository: HabitRepositoryApi,
    private readonly options: HabitServiceOptions = {}
  ) {
    this.now = options.now ?? (() => Date.now());
  }

  async read(): Promise<Habit[]> {
    const habits = await this.repository.readHabits();
    assertHabits(habits);
    return habits;
  }

  async active(): Promise<Habit[]> {
    return (await this.read()).filter((habit) => habit.archivedAt === null);
  }

  async get(id: UUID): Promise<Habit> {
    assertId(id, 'Habit ID');
    const habit = (await this.read()).find((candidate) => candidate.id === id);
    if (!habit) throw new PersistenceError('validation', `Unknown habit "${id}"`);
    return habit;
  }

  async create(input: CreateHabitInput): Promise<Habit> {
    const habits = await this.read();
    const id = input.id ?? createId();
    assertId(id, 'Habit ID');
    if (habits.some((habit) => habit.id === id)) {
      throw new PersistenceError('conflict', `Habit ID "${id}" already exists`);
    }
    const now = this.timestamp();
    const habit: Habit = {
      id,
      name: validateName(input.name),
      sortOrder: validateSortOrder(
        input.sortOrder,
        Math.max(-1, ...habits.map((item) => item.sortOrder)) + 1
      ),
      schedule: validateSchedule(input.schedule),
      trigger:
        input.trigger === undefined || input.trigger === null
          ? null
          : await this.validatedTrigger(input.trigger),
      description: validateDescription(input.description),
      color: validateColor(input.color),
      iconName: validateIcon(input.iconName),
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    const next = normalizeHabitOrder(sortByOrder([...habits, habit]));
    await this.write(next);
    return next.find((candidate) => candidate.id === id) as Habit;
  }

  async createHabit(input: CreateHabitInput): Promise<Habit> {
    return this.create(input);
  }

  async update(id: UUID, input: UpdateHabitInput): Promise<Habit> {
    const habits = await this.read();
    const current = habits.find((habit) => habit.id === id);
    if (!current) throw new PersistenceError('validation', `Unknown habit "${id}"`);
    const trigger =
      input.trigger === undefined
        ? current.trigger
        : input.trigger === null
          ? null
          : await this.validatedTrigger(input.trigger);
    const nextHabit: Habit = {
      ...current,
      name: input.name === undefined ? current.name : validateName(input.name),
      sortOrder: validateSortOrder(input.sortOrder, current.sortOrder),
      schedule: input.schedule === undefined ? current.schedule : validateSchedule(input.schedule),
      trigger,
      description:
        input.description === undefined
          ? current.description
          : validateDescription(input.description),
      color: input.color === undefined ? current.color : validateColor(input.color),
      iconName: input.iconName === undefined ? current.iconName : validateIcon(input.iconName),
      updatedAt: this.timestamp(),
    };
    const next = normalizeHabitOrder(
      sortByOrder(habits.map((habit) => (habit.id === id ? nextHabit : habit)))
    );
    await this.write(next);
    return next.find((habit) => habit.id === id) as Habit;
  }

  async updateHabit(id: UUID, input: UpdateHabitInput): Promise<Habit> {
    return this.update(id, input);
  }

  async archive(id: UUID): Promise<Habit> {
    return this.setArchiveState(id, true);
  }

  async archiveHabit(id: UUID): Promise<Habit> {
    return this.archive(id);
  }

  async restore(id: UUID): Promise<Habit> {
    return this.setArchiveState(id, false);
  }

  async restoreHabit(id: UUID): Promise<Habit> {
    return this.restore(id);
  }

  async reorder(id: UUID, direction: 'up' | 'down'): Promise<Habit[]> {
    const habits = await this.read();
    const ordered = normalizeHabitOrder(sortByOrder(habits));
    const index = ordered.findIndex((habit) => habit.id === id);
    if (index < 0) throw new PersistenceError('validation', `Unknown habit "${id}"`);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target >= 0 && target < ordered.length) {
      const [moved] = ordered.splice(index, 1);
      ordered.splice(target, 0, moved);
    }
    await this.write(ordered);
    return ordered;
  }

  async readMonth(month: MonthKey): Promise<import('@domain').HabitMonthCollection> {
    return this.repository.readMonth(month);
  }

  async readStates(start: LogicalDayKey, end: LogicalDayKey): Promise<HabitDayState[]> {
    const states = await Promise.all(
      monthKeys(start, end).map((month) => this.repository.readMonth(month))
    );
    return states
      .flatMap((collection) => collection.states)
      .filter((state) => state.logicalDay >= start && state.logicalDay <= end);
  }

  async readDayState(habitId: UUID, logicalDay: LogicalDayKey): Promise<HabitDayState | null> {
    assertId(habitId, 'Habit ID');
    assertLogicalDay(logicalDay);
    const month = logicalDay.slice(0, 7) as MonthKey;
    return (
      (await this.repository.readMonth(month)).states.find(
        (state) => state.habitId === habitId && state.logicalDay === logicalDay
      ) ?? null
    );
  }

  async updateSignals(
    habitId: UUID,
    logicalDay: LogicalDayKey,
    signals: HabitSignalUpdate
  ): Promise<HabitDayState> {
    await this.get(habitId);
    assertLogicalDay(logicalDay);
    if (signals.manual === undefined && signals.automatic === undefined) {
      throw new PersistenceError(
        'validation',
        'Habit signal update needs a manual or automatic value'
      );
    }
    return this.repository.updateSignals(habitId, logicalDay, signals, this.timestamp());
  }

  async setManualCompletion(
    habitId: UUID,
    logicalDay: LogicalDayKey,
    completed: boolean | null
  ): Promise<HabitDayState> {
    return this.updateSignals(habitId, logicalDay, { manual: completed });
  }

  async setAutomaticCompletion(
    habitId: UUID,
    logicalDay: LogicalDayKey,
    completed: boolean | null
  ): Promise<HabitDayState> {
    return this.updateSignals(habitId, logicalDay, { automatic: completed });
  }

  private async setArchiveState(id: UUID, archived: boolean): Promise<Habit> {
    const habits = await this.read();
    const current = habits.find((habit) => habit.id === id);
    if (!current) throw new PersistenceError('validation', `Unknown habit "${id}"`);
    if ((current.archivedAt !== null) === archived) return current;
    const timestamp = this.timestamp();
    const nextHabit = { ...current, archivedAt: archived ? timestamp : null, updatedAt: timestamp };
    const next = habits.map((habit) => (habit.id === id ? nextHabit : habit));
    await this.write(next);
    return nextHabit;
  }

  private async validatedTrigger(trigger: HabitTrigger): Promise<HabitTrigger> {
    assertId(
      trigger.kind === 'tracked-time'
        ? trigger.activityId
        : trigger.kind === 'folder-time'
          ? trigger.folderId
          : trigger.routineId,
      trigger.kind === 'tracked-time'
        ? 'Activity ID'
        : trigger.kind === 'folder-time'
          ? 'Folder ID'
          : 'Routine ID'
    );
    let normalized: HabitTrigger;
    try {
      normalized = normalizeHabitTrigger(trigger);
    } catch (error) {
      validation(error instanceof Error ? error.message : String(error));
    }
    if (this.options.catalog) {
      const catalog = await this.options.catalog.read();
      const exists =
        normalized.kind === 'tracked-time'
          ? catalog.activities.some((item) => item.id === normalized.activityId)
          : normalized.kind === 'folder-time'
            ? catalog.folders.some((item) => item.id === normalized.folderId)
            : catalog.routines.some((item) => item.id === normalized.routineId);
      if (!exists) validation('Habit trigger references an unknown catalog record');
    }
    return normalized;
  }

  private timestamp(): IsoTimestamp {
    return toTimestamp(this.now());
  }

  private async write(habits: readonly Habit[]): Promise<void> {
    assertHabits(habits);
    await this.repository.writeHabits(habits);
  }
}

export function createHabitService(
  repository: HabitRepositoryApi,
  options?: HabitServiceOptions
): HabitService {
  return new HabitService(repository, options);
}
