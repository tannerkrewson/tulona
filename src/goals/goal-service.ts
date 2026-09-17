import {
  createId,
  filterGoalsByOverallStatus,
  goalSchema,
  goalEvaluationRuleSchema,
  goalSourceLinkSchema,
  goalStatusDefinitionSchema,
  goalWeekIdentity,
  MAX_GOAL_HISTORICAL_CIRCLE_COUNT,
  MIN_GOAL_HISTORICAL_CIRCLE_COUNT,
  type Goal,
  type GoalCollection,
  type GoalEvaluationMode,
  type GoalEvaluationRule,
  type GoalOverallStatus,
  type GoalOverallStatusFilter,
  type GoalRuleStatusIds,
  type GoalSettings,
  type GoalSourceLink,
  type GoalStatusColor,
  type GoalStatusDefinition,
  type GoalWeekCollection,
  type GoalWeeklyStatus,
  type IsoTimestamp,
} from '@domain';

import type { GoalRepositoryApi } from '../data/goal-repository';
import { PersistenceError } from '../data/errors';

export interface CreateGoalInput {
  id?: string;
  title: string;
  sourceLinks?: readonly GoalSourceLink[];
  overallStatus?: GoalOverallStatus;
  evaluationMode?: GoalEvaluationMode;
  rules?: readonly GoalEvaluationRuleInput[];
}

export interface UpdateGoalInput {
  title?: string;
  sourceLinks?: readonly GoalSourceLink[];
  overallStatus?: GoalOverallStatus;
  evaluationMode?: GoalEvaluationMode;
  rules?: readonly GoalEvaluationRuleInput[];
}

export type GoalRuleStatusIdsInput = Partial<GoalRuleStatusIds>;
export type GoalEvaluationRuleInput =
  | (Omit<Extract<GoalEvaluationRule, { kind: 'habit' }>, 'statusIds'> & {
      statusIds?: GoalRuleStatusIdsInput;
    })
  | (Omit<Extract<GoalEvaluationRule, { kind: 'activity-duration' }>, 'statusIds'> & {
      statusIds?: GoalRuleStatusIdsInput;
    });

export interface CreateGoalStatusDefinitionInput {
  id?: string;
  name: string;
  color?: GoalStatusColor;
}

export interface UpdateGoalStatusDefinitionInput {
  name?: string;
  color?: GoalStatusColor;
}

export interface GoalSettingsPatch {
  reviewDay?: number;
  historicalCircleCount?: number;
}

export interface SetGoalWeeklyStatusInput {
  goalId: string;
  weekStart: Date | number | string;
  statusId: string;
  note?: string | null;
}

export interface GoalServiceOptions {
  now?: () => IsoTimestamp;
  weekStartsOn?: number | (() => number);
  rolloverHour?: number | (() => number);
}

export interface GoalServiceApi {
  read(): Promise<GoalCollection>;
  listGoals(status?: GoalOverallStatusFilter): Promise<Goal[]>;
  getGoal(id: string): Promise<Goal>;
  createGoal(input: CreateGoalInput): Promise<Goal>;
  updateGoal(id: string, input: UpdateGoalInput): Promise<Goal>;
  deleteGoal(id: string): Promise<void>;
  readSettings(): Promise<GoalSettings>;
  updateSettings(patch: GoalSettingsPatch): Promise<GoalSettings>;
  createStatusDefinition(input: CreateGoalStatusDefinitionInput): Promise<GoalStatusDefinition>;
  updateStatusDefinition(
    id: string,
    input: UpdateGoalStatusDefinitionInput
  ): Promise<GoalStatusDefinition>;
  deleteStatusDefinition(id: string): Promise<void>;
  reorderStatusDefinitions(ids: readonly string[]): Promise<GoalStatusDefinition[]>;
  week(value: Date | number | string): ReturnType<typeof goalWeekIdentity>;
  readWeek(value: Date | number | string): Promise<GoalWeekCollection>;
  readWeeks(): Promise<GoalWeekCollection[]>;
  setWeeklyStatus(input: SetGoalWeeklyStatusInput): Promise<GoalWeeklyStatus>;
  deleteWeeklyStatus(goalId: string, weekStart: Date | number | string): Promise<void>;
}

function validation(message: string, cause?: unknown): never {
  throw new PersistenceError('validation', message, undefined, cause);
}

function conflict(message: string): never {
  throw new PersistenceError('conflict', message);
}

function normalizedText(value: string | null | undefined, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') validation(`${label} must be text`);
  const normalized = value.trim();
  return normalized || null;
}

function requiredText(value: string, label: string): string {
  const normalized = normalizedText(value, label);
  if (!normalized) validation(`${label} must not be empty`);
  return normalized;
}

function assertNoGoalColor(input: object): void {
  if (Object.prototype.hasOwnProperty.call(input, 'color')) {
    validation('Goals do not have custom colors; use a weekly status definition instead');
  }
}

function normalizedSourceLinks(value: readonly GoalSourceLink[] | undefined): GoalSourceLink[] {
  if (value === undefined) return [];
  const links: GoalSourceLink[] = [];
  const seen = new Set<string>();
  for (const source of value) {
    const parsed = goalSourceLinkSchema.safeParse(source);
    if (!parsed.success) validation(`Goal source link is invalid: ${parsed.error.message}`);
    const key = `${parsed.data.kind}:${parsed.data.id}`;
    if (seen.has(key)) conflict(`Goal source link "${key}" is duplicated`);
    seen.add(key);
    links.push({ ...parsed.data });
  }
  return links;
}

function defaultRuleStatusIds(settings: GoalSettings): GoalRuleStatusIds {
  const definitions = [...settings.statusDefinitions].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)
  );
  const first = definitions[0]?.id;
  if (!first) validation('At least one goal status definition is required');
  return {
    good: first,
    partial: definitions[1]?.id ?? first,
    noProgress: definitions[2]?.id ?? definitions.at(-1)?.id ?? first,
  };
}

function normalizedRules(
  value: readonly GoalEvaluationRuleInput[] | readonly GoalEvaluationRule[] | undefined,
  settings: GoalSettings
): GoalEvaluationRule[] {
  if (value === undefined) return [];
  const defaults = defaultRuleStatusIds(settings);
  return value.map((rule, index) => {
    const candidate = {
      ...rule,
      statusIds: { ...defaults, ...rule.statusIds },
    };
    const parsed = goalEvaluationRuleSchema.safeParse(candidate);
    if (!parsed.success) {
      validation(`Goal rule ${index + 1} failed validation: ${parsed.error.message}`);
    }
    for (const [outcome, statusId] of Object.entries(parsed.data.statusIds)) {
      if (!settings.statusDefinitions.some((definition) => definition.id === statusId)) {
        validation(
          `Goal rule ${index + 1} maps ${outcome} to unknown goal status definition "${statusId}"`
        );
      }
    }
    return parsed.data as GoalEvaluationRule;
  });
}

function parseGoal(value: unknown): Goal {
  const parsed = goalSchema.safeParse(value);
  if (!parsed.success) validation(`Goal failed validation: ${parsed.error.message}`);
  return parsed.data as Goal;
}

function parseStatusDefinition(value: unknown): GoalStatusDefinition {
  const parsed = goalStatusDefinitionSchema.safeParse(value);
  if (!parsed.success)
    validation(`Goal status definition failed validation: ${parsed.error.message}`);
  return parsed.data as GoalStatusDefinition;
}

function resolveOption(value: number | (() => number) | undefined, fallback: number): number {
  return typeof value === 'function' ? value() : (value ?? fallback);
}

export class GoalService implements GoalServiceApi {
  private readonly now: () => IsoTimestamp;

  constructor(
    private readonly repository: GoalRepositoryApi,
    private readonly options: GoalServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  read(): Promise<GoalCollection> {
    return this.repository.read();
  }

  async listGoals(status: GoalOverallStatusFilter = 'all'): Promise<Goal[]> {
    return filterGoalsByOverallStatus(await this.repository.readGoals(), status);
  }

  async getGoal(id: string): Promise<Goal> {
    const goal = await this.repository.readGoal(id);
    if (!goal) throw new PersistenceError('validation', `Unknown goal "${id}"`);
    return goal;
  }

  async createGoal(input: CreateGoalInput): Promise<Goal> {
    assertNoGoalColor(input);
    const id = input.id ?? createId();
    const settings = await this.repository.readSettings();
    const now = this.now();
    const goal = parseGoal({
      id,
      title: requiredText(input.title, 'Goal title'),
      sourceLinks: normalizedSourceLinks(input.sourceLinks),
      overallStatus: input.overallStatus ?? 'in-progress',
      evaluationMode: input.evaluationMode ?? 'manual',
      rules: normalizedRules(input.rules, settings),
      createdAt: now,
      updatedAt: now,
    });
    await this.repository.createGoal(goal);
    return goal;
  }

  async updateGoal(id: string, input: UpdateGoalInput): Promise<Goal> {
    assertNoGoalColor(input);
    const current = await this.getGoal(id);
    const settings = await this.repository.readSettings();
    const next = parseGoal({
      ...current,
      title: input.title === undefined ? current.title : requiredText(input.title, 'Goal title'),
      sourceLinks:
        input.sourceLinks === undefined
          ? current.sourceLinks
          : normalizedSourceLinks(input.sourceLinks),
      overallStatus: input.overallStatus ?? current.overallStatus,
      evaluationMode: input.evaluationMode ?? current.evaluationMode,
      rules: normalizedRules(input.rules ?? current.rules, settings),
      updatedAt: this.now(),
    });
    await this.repository.updateGoal(next);
    return next;
  }

  deleteGoal(id: string): Promise<void> {
    return this.repository.deleteGoal(id);
  }

  readSettings(): Promise<GoalSettings> {
    return this.repository.readSettings();
  }

  async updateSettings(patch: GoalSettingsPatch): Promise<GoalSettings> {
    const current = await this.repository.readSettings();
    const reviewDay = patch.reviewDay ?? current.reviewDay;
    if (!Number.isInteger(reviewDay) || reviewDay < 0 || reviewDay > 6) {
      validation('Goal review day must be an integer from 0 through 6');
    }
    const historicalCircleCount = patch.historicalCircleCount ?? current.historicalCircleCount;
    if (
      !Number.isInteger(historicalCircleCount) ||
      historicalCircleCount < MIN_GOAL_HISTORICAL_CIRCLE_COUNT ||
      historicalCircleCount > MAX_GOAL_HISTORICAL_CIRCLE_COUNT
    ) {
      validation(
        `Goal historical circle count must be an integer from ${MIN_GOAL_HISTORICAL_CIRCLE_COUNT} through ${MAX_GOAL_HISTORICAL_CIRCLE_COUNT}`
      );
    }
    const next = { ...current, reviewDay, historicalCircleCount };
    await this.repository.writeSettings(next);
    return next;
  }

  async createStatusDefinition(
    input: CreateGoalStatusDefinitionInput
  ): Promise<GoalStatusDefinition> {
    const settings = await this.repository.readSettings();
    const id = input.id ?? createId();
    const definition = parseStatusDefinition({
      id,
      name: requiredText(input.name, 'Goal status name'),
      color: input.color ?? 'green',
      sortOrder: settings.statusDefinitions.length,
    });
    assertStatusIdIsNew(settings.statusDefinitions, definition.id);
    assertStatusNameIsNew(settings.statusDefinitions, definition.name);
    await this.repository.writeSettings({
      ...settings,
      statusDefinitions: [...settings.statusDefinitions, definition],
    });
    return definition;
  }

  async updateStatusDefinition(
    id: string,
    input: UpdateGoalStatusDefinitionInput
  ): Promise<GoalStatusDefinition> {
    const settings = await this.repository.readSettings();
    const current = settings.statusDefinitions.find((definition) => definition.id === id);
    if (!current)
      throw new PersistenceError('validation', `Unknown goal status definition "${id}"`);
    const next = parseStatusDefinition({
      ...current,
      name: input.name === undefined ? current.name : requiredText(input.name, 'Goal status name'),
      color: input.color ?? current.color,
    });
    assertStatusNameIsNew(settings.statusDefinitions, next.name, id);
    const statusDefinitions = settings.statusDefinitions.map((definition) =>
      definition.id === id ? next : definition
    );
    await this.repository.writeSettings({ ...settings, statusDefinitions });
    return next;
  }

  async deleteStatusDefinition(id: string): Promise<void> {
    const settings = await this.repository.readSettings();
    if (!settings.statusDefinitions.some((definition) => definition.id === id)) {
      throw new PersistenceError('validation', `Unknown goal status definition "${id}"`);
    }
    if (settings.statusDefinitions.length === 1) {
      validation('At least one goal status definition is required');
    }
    const goals = await this.repository.readGoals();
    if (
      goals.some((goal) =>
        goal.rules.some((rule) => Object.values(rule.statusIds).some((statusId) => statusId === id))
      )
    ) {
      conflict(`Goal status definition "${id}" is used by an automatic goal rule`);
    }
    const weeks = await this.repository.readWeeks();
    if (weeks.some((week) => week.statuses.some((status) => status.statusId === id))) {
      conflict(`Goal status definition "${id}" is used by weekly history`);
    }
    const statusDefinitions = settings.statusDefinitions
      .filter((definition) => definition.id !== id)
      .map((definition, index) => ({ ...definition, sortOrder: index }));
    await this.repository.writeSettings({ ...settings, statusDefinitions });
  }

  async reorderStatusDefinitions(ids: readonly string[]): Promise<GoalStatusDefinition[]> {
    const settings = await this.repository.readSettings();
    if (
      ids.length !== settings.statusDefinitions.length ||
      new Set(ids).size !== ids.length ||
      settings.statusDefinitions.some((definition) => !ids.includes(definition.id))
    ) {
      validation('Goal status reorder must include every status exactly once');
    }
    const definitions = ids.map((id, sortOrder) => ({
      ...settings.statusDefinitions.find((definition) => definition.id === id)!,
      sortOrder,
    }));
    await this.repository.writeSettings({ ...settings, statusDefinitions: definitions });
    return definitions;
  }

  week(value: Date | number | string): ReturnType<typeof goalWeekIdentity> {
    return goalWeekIdentity(value, {
      rolloverHour: resolveOption(this.options.rolloverHour, 0),
      weekStartsOn: resolveOption(this.options.weekStartsOn, 0),
    });
  }

  readWeek(value: Date | number | string): Promise<GoalWeekCollection> {
    return this.repository.readWeek(this.week(value).weekStart);
  }

  readWeeks(): Promise<GoalWeekCollection[]> {
    return this.repository.readWeeks();
  }

  async setWeeklyStatus(input: SetGoalWeeklyStatusInput): Promise<GoalWeeklyStatus> {
    const goal = await this.getGoal(input.goalId);
    const statusId = input.statusId;
    const settings = await this.repository.readSettings();
    if (!settings.statusDefinitions.some((definition) => definition.id === statusId)) {
      throw new PersistenceError('validation', `Unknown goal status definition "${statusId}"`);
    }
    const note = normalizedText(input.note, 'Weekly goal note');
    const status: GoalWeeklyStatus = {
      goalId: goal.id,
      weekStart: this.week(input.weekStart).weekStart,
      statusId,
      note,
      updatedAt: this.now(),
    };
    return this.repository.upsertWeeklyStatus(status);
  }

  deleteWeeklyStatus(goalId: string, weekStart: Date | number | string): Promise<void> {
    return this.repository.deleteWeeklyStatus(goalId, this.week(weekStart).weekStart);
  }
}

function assertStatusIdIsNew(definitions: readonly GoalStatusDefinition[], id: string): void {
  if (definitions.some((definition) => definition.id === id)) {
    conflict(`Goal status definition "${id}" already exists`);
  }
}

function assertStatusNameIsNew(
  definitions: readonly GoalStatusDefinition[],
  name: string,
  currentId?: string
): void {
  const normalized = name.trim().toLocaleLowerCase();
  if (
    definitions.some(
      (definition) =>
        definition.id !== currentId && definition.name.trim().toLocaleLowerCase() === normalized
    )
  ) {
    conflict(`Goal status name "${name}" already exists`);
  }
}

export function createGoalService(
  repository: GoalRepositoryApi,
  options?: GoalServiceOptions
): GoalService {
  return new GoalService(repository, options);
}
