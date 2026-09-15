import { z } from 'zod';

import {
  defaultGoalSettings,
  goalCollectionSchema,
  goalSettingsSchema,
  goalWeekCollectionSchema,
  goalWeeklyStatusSchema,
  type Goal,
  type GoalCollection,
  type GoalSettings,
  type GoalWeekCollection,
  type GoalWeeklyStatus,
  type LogicalDayKey,
  isUuid,
} from '@domain';

import type { KeyValueDatabase } from './database';
import { DatasetStore } from './dataset-store';
import { PersistenceError } from './errors';
import { OperationJournal } from './journal';
import type { DatasetNamespace } from './namespaces';

export interface GoalRepositoryApi {
  read(): Promise<GoalCollection>;
  readGoals(): Promise<Goal[]>;
  readGoal(id: string): Promise<Goal | null>;
  write(goals: GoalCollection): Promise<void>;
  writeGoals(goals: readonly Goal[]): Promise<void>;
  createGoal(goal: Goal): Promise<void>;
  updateGoal(goal: Goal): Promise<void>;
  deleteGoal(id: string, operationId?: string): Promise<void>;
  readSettings(): Promise<GoalSettings>;
  writeSettings(settings: GoalSettings): Promise<void>;
  readWeek(weekStart: LogicalDayKey): Promise<GoalWeekCollection>;
  readWeeks(): Promise<GoalWeekCollection[]>;
  writeWeek(collection: GoalWeekCollection): Promise<void>;
  upsertWeeklyStatus(status: GoalWeeklyStatus): Promise<GoalWeeklyStatus>;
  deleteWeeklyStatus(goalId: string, weekStart: LogicalDayKey): Promise<void>;
}

function validation(message: string, cause?: unknown): never {
  throw new PersistenceError('validation', message, undefined, cause);
}

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success) validation(`${label} failed validation`, result.error);
  return result.data;
}

function validateGoalCollection(value: unknown): GoalCollection {
  const parsed = parseOrThrow<GoalCollection>(goalCollectionSchema, value, 'Goals');
  const ids = new Set<string>();
  for (const goal of parsed.goals) {
    if (ids.has(goal.id)) validation(`Duplicate goal ID "${goal.id}"`);
    ids.add(goal.id);
  }
  return { goals: [...parsed.goals] };
}

function validateSettings(value: unknown): GoalSettings {
  const parsed = parseOrThrow<GoalSettings>(goalSettingsSchema, value, 'Goal settings');
  if (parsed.statusDefinitions.length === 0) {
    validation('At least one goal status definition is required');
  }
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const definition of parsed.statusDefinitions) {
    if (ids.has(definition.id)) validation(`Duplicate goal status ID "${definition.id}"`);
    ids.add(definition.id);
    const normalizedName = definition.name.trim().toLocaleLowerCase();
    if (names.has(normalizedName)) {
      validation(`Duplicate goal status name "${definition.name}"`);
    }
    names.add(normalizedName);
  }
  const sortOrders = parsed.statusDefinitions
    .map((definition) => definition.sortOrder)
    .sort((left, right) => left - right);
  if (sortOrders.some((sortOrder, index) => sortOrder !== index)) {
    validation('Goal status definitions must have contiguous sort orders');
  }
  return {
    reviewDay: parsed.reviewDay,
    historicalCircleCount: parsed.historicalCircleCount,
    statusDefinitions: parsed.statusDefinitions.map((definition) => ({ ...definition })),
  };
}

function validateWeekStart(value: string): LogicalDayKey {
  const parsed = goalWeekCollectionSchema.safeParse({ weekStart: value, statuses: [] });
  if (!parsed.success) validation(`Invalid goal week start "${value}"`, parsed.error);
  return parsed.data.weekStart as LogicalDayKey;
}

function validateWeekCollection(value: unknown, expectedWeekStart?: string): GoalWeekCollection {
  const parsed = parseOrThrow<GoalWeekCollection>(goalWeekCollectionSchema, value, 'Goal week');
  const weekStart = validateWeekStart(parsed.weekStart);
  if (expectedWeekStart !== undefined && weekStart !== expectedWeekStart) {
    validation(`Goal week must use key "${expectedWeekStart}"`);
  }
  const goalIds = new Set<string>();
  for (const status of parsed.statuses) {
    if (status.weekStart !== weekStart) {
      validation(`Goal status "${status.goalId}" belongs to another week`);
    }
    if (goalIds.has(status.goalId)) {
      validation(`Goal "${status.goalId}" has more than one status in week "${weekStart}"`);
    }
    goalIds.add(status.goalId);
  }
  return { weekStart, statuses: [...parsed.statuses] };
}

function validateGoalStatus(value: unknown): GoalWeeklyStatus {
  return parseOrThrow<GoalWeeklyStatus>(goalWeeklyStatusSchema, value, 'Weekly goal status');
}

function emptyWeek(weekStart: LogicalDayKey): GoalWeekCollection {
  return { weekStart, statuses: [] };
}

export class GoalRepository implements GoalRepositoryApi {
  private readonly store: DatasetStore;
  private readonly journal: OperationJournal;

  constructor(
    private readonly database: KeyValueDatabase,
    private readonly namespace: DatasetNamespace
  ) {
    this.store = new DatasetStore(database);
    this.journal = new OperationJournal(database);
  }

  async read(): Promise<GoalCollection> {
    const stored = await this.store.read(this.namespace, 'goals', goalCollectionSchema);
    return stored ? validateGoalCollection(stored) : { goals: [] };
  }

  async readGoals(): Promise<Goal[]> {
    return (await this.read()).goals;
  }

  async readGoal(id: string): Promise<Goal | null> {
    return (await this.readGoals()).find((goal) => goal.id === id) ?? null;
  }

  async write(goals: GoalCollection): Promise<void> {
    await this.store.write(
      this.namespace,
      'goals',
      goalCollectionSchema,
      validateGoalCollection(goals)
    );
  }

  async writeGoals(goals: readonly Goal[]): Promise<void> {
    await this.write({ goals: [...goals] });
  }

  async createGoal(goal: Goal): Promise<void> {
    const current = await this.read();
    if (current.goals.some((candidate) => candidate.id === goal.id)) {
      throw new PersistenceError('conflict', `Goal "${goal.id}" already exists`);
    }
    await this.write({ goals: [...current.goals, goal] });
  }

  async updateGoal(goal: Goal): Promise<void> {
    const current = await this.read();
    const index = current.goals.findIndex((candidate) => candidate.id === goal.id);
    if (index < 0) throw new PersistenceError('validation', `Unknown goal "${goal.id}"`);
    const goals = [...current.goals];
    goals[index] = goal;
    await this.write({ goals });
  }

  async deleteGoal(id: string, operationId = `goal-delete-${id}`): Promise<void> {
    if (!isUuid(id)) validation(`Goal ID must be a UUID`);
    const current = await this.read();
    if (!current.goals.some((goal) => goal.id === id)) {
      throw new PersistenceError('validation', `Unknown goal "${id}"`);
    }

    const remainingGoals = validateGoalCollection({
      goals: current.goals.filter((goal) => goal.id !== id),
    });
    const changes: { key: string; newValue: string | null }[] = [
      {
        key: this.namespace.key('goals'),
        newValue: JSON.stringify(remainingGoals),
      },
    ];
    for (const weekStart of await this.discoverWeekStarts()) {
      const week = await this.readWeek(weekStart);
      if (!week.statuses.some((status) => status.goalId === id)) continue;
      const statuses = week.statuses.filter((status) => status.goalId !== id);
      changes.push({
        key: this.namespace.key('goal-weeks', weekStart),
        newValue: statuses.length === 0 ? null : JSON.stringify({ weekStart, statuses }),
      });
    }
    await this.journal.run({
      id: operationId,
      datasetId: this.namespace.datasetId,
      kind: 'goal-delete',
      changes,
    });
  }

  async readSettings(): Promise<GoalSettings> {
    const stored = await this.store.read(this.namespace, 'goal-settings', goalSettingsSchema);
    if (stored) return validateSettings(stored);
    const defaults = defaultGoalSettings();
    await this.writeSettings(defaults);
    return defaults;
  }

  async writeSettings(settings: GoalSettings): Promise<void> {
    await this.store.write(
      this.namespace,
      'goal-settings',
      goalSettingsSchema,
      validateSettings(settings)
    );
  }

  async readWeek(weekStart: LogicalDayKey): Promise<GoalWeekCollection> {
    const normalized = validateWeekStart(weekStart);
    const stored = await this.store.read(
      this.namespace,
      'goal-weeks',
      goalWeekCollectionSchema,
      normalized
    );
    return stored ? validateWeekCollection(stored, normalized) : emptyWeek(normalized);
  }

  async readWeeks(): Promise<GoalWeekCollection[]> {
    const weeks = await this.discoverWeekStarts();
    return Promise.all(weeks.map((week) => this.readWeek(week)));
  }

  async writeWeek(collection: GoalWeekCollection): Promise<void> {
    const validated = validateWeekCollection(collection);
    await this.store.write(
      this.namespace,
      'goal-weeks',
      goalWeekCollectionSchema,
      validated,
      validated.weekStart
    );
  }

  async upsertWeeklyStatus(status: GoalWeeklyStatus): Promise<GoalWeeklyStatus> {
    const validated = validateGoalStatus(status);
    const goal = await this.readGoal(validated.goalId);
    if (!goal) throw new PersistenceError('validation', `Unknown goal "${validated.goalId}"`);
    const settings = await this.readSettings();
    if (!settings.statusDefinitions.some((definition) => definition.id === validated.statusId)) {
      throw new PersistenceError(
        'validation',
        `Unknown goal status definition "${validated.statusId}"`
      );
    }
    const current = await this.readWeek(validated.weekStart);
    const existingIndex = current.statuses.findIndex(
      (candidate) => candidate.goalId === validated.goalId
    );
    const statuses = [...current.statuses];
    if (existingIndex < 0) statuses.push(validated);
    else statuses[existingIndex] = validated;
    await this.writeWeek({ weekStart: current.weekStart, statuses });
    return validated;
  }

  async deleteWeeklyStatus(goalId: string, weekStart: LogicalDayKey): Promise<void> {
    const current = await this.readWeek(weekStart);
    const statuses = current.statuses.filter((status) => status.goalId !== goalId);
    if (statuses.length === current.statuses.length) return;
    if (statuses.length === 0) {
      await this.store.remove(this.namespace, 'goal-weeks', current.weekStart);
      return;
    }
    await this.writeWeek({ weekStart: current.weekStart, statuses });
  }

  private async discoverWeekStarts(): Promise<LogicalDayKey[]> {
    if (!this.database.keys) return [];
    const prefix = `${this.namespace.key('goal-weeks')}:`;
    const keys = await this.database.keys();
    return [
      ...new Set(
        keys
          .filter((key) => key.startsWith(prefix))
          .map((key) => key.slice(prefix.length))
          .filter(
            (value) =>
              goalWeekCollectionSchema.safeParse({ weekStart: value, statuses: [] }).success
          )
      ),
    ].sort();
  }
}

export function createGoalRepository(
  database: KeyValueDatabase,
  namespace: DatasetNamespace
): GoalRepository {
  return new GoalRepository(database, namespace);
}
