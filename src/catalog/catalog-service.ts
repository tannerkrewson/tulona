import { PersistenceError } from '../data/errors';
import type { CatalogRepositoryApi } from '../data/catalog-repository';
import {
  createId,
  isUuid,
  normalizeRoutineStepOrder,
  routineStepSchema,
  sortByOrder,
  toTimestamp,
  type Activity,
  type CatalogCollection,
  type Folder,
  type Habit,
  type IsoTimestamp,
  type RoutineDefinition,
  type RoutineSnapshot,
  type RoutineStepEndBehavior,
  type RoutineStep,
  type TrackableItem,
  type UUID,
} from '../domain';
import { isIconValue } from '../icons/icon-names';

import {
  moveDown,
  moveUp,
  normalizeCatalogOrders,
  reorderHabits,
  reorderRoutineSteps,
  type OrderDirection,
} from './ordering';

export const DEFAULT_CATALOG_COLOR = '#176B87';

export interface CatalogStyleInput {
  name: string;
  color?: string | null;
  iconName?: string | null;
}

export interface CreateFolderInput extends CatalogStyleInput {
  id?: UUID;
  /** Folders are always root-level; a non-null value is rejected. */
  folderId?: UUID | null;
}

export interface UpdateFolderInput {
  name?: string;
  color?: string | null;
  iconName?: string | null;
}

export interface CreateActivityInput extends CatalogStyleInput {
  id?: UUID;
  folderId?: UUID | null;
}

export interface UpdateActivityInput {
  name?: string;
  color?: string | null;
  iconName?: string | null;
  folderId?: UUID | null;
}

export interface CreateRoutineInput extends CatalogStyleInput {
  id?: UUID;
  folderId?: UUID | null;
  steps?: readonly (RoutineStep | CreateRoutineStepInput)[];
}

export interface CreateRoutineStepInput {
  id?: UUID;
  activityId: UUID;
  name?: string | null;
  durationMs: number;
  endBehavior?: RoutineStepEndBehavior;
  notes?: string | null;
  color?: string | null;
  iconName?: string | null;
}

export interface UpdateRoutineStepInput {
  activityId?: UUID;
  name?: string | null;
  durationMs?: number;
  endBehavior?: RoutineStepEndBehavior;
  notes?: string | null;
  color?: string | null;
  iconName?: string | null;
}

export interface DuplicateRoutineStepOptions {
  id?: UUID;
  name?: string | null;
}

export interface UpdateRoutineInput {
  name?: string;
  color?: string | null;
  iconName?: string | null;
  folderId?: UUID | null;
}

export interface DuplicateRoutineOptions {
  id?: UUID;
  name?: string;
}

export interface CatalogServiceOptions {
  now?: () => IsoTimestamp;
  defaultColor?: string;
}

export interface ResolvedCatalogItem {
  item: TrackableItem;
  folder: Folder | null;
  displayColor: string;
  isArchived: boolean;
}

export interface CatalogServiceApi {
  read(): Promise<CatalogCollection>;
  getFolder(id: UUID): Promise<Folder>;
  getActivity(id: UUID): Promise<Activity>;
  getRoutine(id: UUID): Promise<RoutineDefinition>;
  resolveItem(id: UUID): Promise<ResolvedCatalogItem | null>;
  createFolder(input: CreateFolderInput): Promise<Folder>;
  updateFolder(id: UUID, input: UpdateFolderInput): Promise<Folder>;
  moveFolder(id: UUID, folderId: UUID | null): Promise<Folder>;
  archiveFolder(id: UUID): Promise<Folder>;
  restoreFolder(id: UUID): Promise<Folder>;
  createActivity(input: CreateActivityInput): Promise<Activity>;
  updateActivity(id: UUID, input: UpdateActivityInput): Promise<Activity>;
  moveActivity(id: UUID, folderId: UUID | null): Promise<Activity>;
  archiveActivity(id: UUID): Promise<Activity>;
  restoreActivity(id: UUID): Promise<Activity>;
  createRoutine(input: CreateRoutineInput): Promise<RoutineDefinition>;
  updateRoutine(id: UUID, input: UpdateRoutineInput): Promise<RoutineDefinition>;
  moveRoutine(id: UUID, folderId: UUID | null): Promise<RoutineDefinition>;
  archiveRoutine(id: UUID): Promise<RoutineDefinition>;
  restoreRoutine(id: UUID): Promise<RoutineDefinition>;
  duplicateRoutine(id: UUID, options?: DuplicateRoutineOptions): Promise<RoutineDefinition>;
  snapshotRoutine(id: UUID, capturedAt?: IsoTimestamp): Promise<RoutineSnapshot>;
  createRoutineStep(id: UUID, input: CreateRoutineStepInput): Promise<RoutineStep>;
  addRoutineStep(id: UUID, input: CreateRoutineStepInput): Promise<RoutineStep>;
  updateRoutineStep(
    routineId: UUID,
    stepId: UUID,
    input: UpdateRoutineStepInput
  ): Promise<RoutineStep>;
  duplicateRoutineStep(
    routineId: UUID,
    stepId: UUID,
    options?: DuplicateRoutineStepOptions
  ): Promise<RoutineStep>;
  deleteRoutineStep(routineId: UUID, stepId: UUID): Promise<RoutineStep>;
  removeRoutineStep(routineId: UUID, stepId: UUID): Promise<RoutineStep>;
  reorderFolders(id: UUID, direction: OrderDirection): Promise<Folder[]>;
  reorderItem(id: UUID, direction: OrderDirection): Promise<CatalogCollection>;
  reorderRoutineStep(
    routineId: UUID,
    stepId: UUID,
    direction: OrderDirection
  ): Promise<RoutineStep[]>;
  reorderHabits(habits: readonly Habit[], habitId: UUID, direction: OrderDirection): Habit[];
  normalizeOrders(): Promise<CatalogCollection>;
}

type CatalogEntity = Folder | Activity | RoutineDefinition;

function validation(message: string): never {
  throw new PersistenceError('validation', message);
}

function assertId(id: string, label: string): asserts id is UUID {
  if (!isUuid(id)) validation(`${label} must be a UUID`);
}

function validateName(name: string): string {
  if (typeof name !== 'string' || !name.trim()) validation('Catalog names must not be empty');
  return name.trim();
}

function validateColor(color: string | null | undefined): string | null {
  if (color === undefined || color === null || color === '') return null;
  const normalized = color.trim();
  if (!/^#[0-9a-f]{6}$/i.test(normalized))
    validation('Catalog colors must be six-digit hexadecimal values');
  return normalized.toUpperCase();
}

function validateIcon(iconName: string | null | undefined): string | null {
  if (iconName === undefined || iconName === null || iconName === '') return null;
  if (!isIconValue(iconName)) validation(`Unknown catalog icon "${iconName}"`);
  return iconName;
}

function validateDuration(durationMs: number): number {
  if (!Number.isInteger(durationMs) || durationMs <= 0)
    validation('Routine step duration must be a positive integer in milliseconds');
  return durationMs;
}

function validateEndBehavior(
  endBehavior: RoutineStepEndBehavior | undefined
): RoutineStepEndBehavior {
  if (endBehavior === undefined || endBehavior === 'overtime') return 'overtime';
  if (endBehavior === 'auto-advance') return endBehavior;
  if (endBehavior === 'autoAdvance') return 'auto-advance';
  validation(`Unknown routine step end behavior "${String(endBehavior)}"`);
}

function validateStepNotes(notes: string | null | undefined): string | null {
  if (notes === undefined || notes === null) return null;
  return notes.trim() || null;
}

function assertCatalogInvariants(catalog: CatalogCollection): void {
  const ids = new Set<string>();
  const folders = new Set<string>();
  for (const folder of catalog.folders) {
    validateName(folder.name);
    validateColor(folder.color);
    validateIcon(folder.iconName);
    if (ids.has(folder.id)) validation(`Duplicate catalog ID "${folder.id}"`);
    ids.add(folder.id);
    folders.add(folder.id);
    const nestedFolderId = (folder as Folder & { folderId?: UUID | null }).folderId;
    if (nestedFolderId) validation('Folders cannot be nested');
  }

  for (const item of [...catalog.activities, ...catalog.routines]) {
    validateName(item.name);
    validateColor(item.color);
    validateIcon(item.iconName);
    if (ids.has(item.id)) validation(`Duplicate catalog ID "${item.id}"`);
    ids.add(item.id);
    if (item.folderId !== null && !folders.has(item.folderId)) {
      validation(`Catalog item "${item.id}" references an unknown folder`);
    }
    if (item.kind === 'routine') {
      const stepIds = new Set<string>();
      for (const step of item.steps) {
        if (stepIds.has(step.id)) validation(`Duplicate routine step ID "${step.id}"`);
        stepIds.add(step.id);
        if (!catalog.activities.some((activity) => activity.id === step.activityId)) {
          validation(`Routine step "${step.id}" references an unknown activity`);
        }
        validateDuration(step.durationMs);
        validateEndBehavior(step.endBehavior);
        validateStepNotes(step.notes);
        validateColor(step.color);
        validateIcon(step.iconName);
      }
    }
  }
}

function itemWithId(catalog: CatalogCollection, id: UUID): CatalogEntity | null {
  return (
    catalog.folders.find((folder) => folder.id === id) ??
    catalog.activities.find((activity) => activity.id === id) ??
    catalog.routines.find((routine) => routine.id === id) ??
    null
  );
}

function trackableWithId(catalog: CatalogCollection, id: UUID): TrackableItem | null {
  return (
    catalog.activities.find((activity) => activity.id === id) ??
    catalog.routines.find((routine) => routine.id === id) ??
    null
  );
}

function assertNewId(catalog: CatalogCollection, id: UUID): void {
  if (itemWithId(catalog, id))
    throw new PersistenceError('conflict', `Catalog ID "${id}" already exists`);
}

function folderForPlacement(catalog: CatalogCollection, folderId: UUID | null): Folder | null {
  if (folderId === null) return null;
  assertId(folderId, 'Folder ID');
  const folder = catalog.folders.find((candidate) => candidate.id === folderId);
  if (!folder) validation(`Cannot place an item in unknown folder "${folderId}"`);
  if (folder.archivedAt !== null)
    validation(`Cannot place an item in archived folder "${folderId}"`);
  return folder;
}

function nextSiblingOrder(
  catalog: CatalogCollection,
  folderId: UUID | null,
  excludingId?: UUID
): number {
  const siblings = [...catalog.activities, ...catalog.routines].filter(
    (item) => item.folderId === folderId && item.id !== excludingId
  );
  return Math.max(-1, ...siblings.map((item) => item.sortOrder)) + 1;
}

function nextFolderOrder(catalog: CatalogCollection): number {
  return Math.max(-1, ...catalog.folders.map((folder) => folder.sortOrder)) + 1;
}

function snapshotSteps(routine: RoutineDefinition): RoutineSnapshot['steps'] {
  return sortByOrder(routine.steps).map((step, index) => ({
    id: step.id,
    activityId: step.activityId,
    name: step.name,
    durationMs: step.durationMs,
    sortOrder: index,
    color: step.color,
    iconName: step.iconName,
    endBehavior: validateEndBehavior(step.endBehavior),
    notes: validateStepNotes(step.notes),
  }));
}

export function resolveDisplayColor(
  item: Pick<TrackableItem, 'folderId' | 'color'>,
  folders: readonly Folder[],
  defaultColor = DEFAULT_CATALOG_COLOR
): string {
  const folder =
    item.folderId === null ? null : folders.find((candidate) => candidate.id === item.folderId);
  return folder ? (folder.color ?? defaultColor) : (item.color ?? defaultColor);
}

/** Resolves active and archived records without following tracker history. */
export function resolveCatalogItem(
  catalog: CatalogCollection,
  id: UUID,
  defaultColor = DEFAULT_CATALOG_COLOR
): ResolvedCatalogItem | null {
  const item = trackableWithId(catalog, id);
  if (!item) return null;
  const folder =
    item.folderId === null
      ? null
      : catalog.folders.find((candidate) => candidate.id === item.folderId);
  return {
    item,
    folder: folder ?? null,
    displayColor: resolveDisplayColor(item, catalog.folders, defaultColor),
    isArchived: item.archivedAt !== null,
  };
}

export const resolveHistoricalItem = resolveCatalogItem;

export class CatalogService implements CatalogServiceApi {
  private readonly now: () => IsoTimestamp;
  private readonly defaultColor: string;

  constructor(
    private readonly repository: CatalogRepositoryApi,
    options: CatalogServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.defaultColor = validateColor(options.defaultColor) ?? DEFAULT_CATALOG_COLOR;
  }

  async read(): Promise<CatalogCollection> {
    const catalog = await this.repository.read();
    assertCatalogInvariants(catalog);
    return catalog;
  }

  async getFolder(id: UUID): Promise<Folder> {
    assertId(id, 'Folder ID');
    const folder = (await this.read()).folders.find((candidate) => candidate.id === id);
    if (!folder) throw new PersistenceError('validation', `Unknown folder "${id}"`);
    return folder;
  }

  async getActivity(id: UUID): Promise<Activity> {
    assertId(id, 'Activity ID');
    const activity = (await this.read()).activities.find((candidate) => candidate.id === id);
    if (!activity) throw new PersistenceError('validation', `Unknown activity "${id}"`);
    return activity;
  }

  async getRoutine(id: UUID): Promise<RoutineDefinition> {
    assertId(id, 'Routine ID');
    const routine = (await this.read()).routines.find((candidate) => candidate.id === id);
    if (!routine) throw new PersistenceError('validation', `Unknown routine "${id}"`);
    return routine;
  }

  async resolveItem(id: UUID): Promise<ResolvedCatalogItem | null> {
    assertId(id, 'Catalog item ID');
    return resolveCatalogItem(await this.read(), id, this.defaultColor);
  }

  async createFolder(input: CreateFolderInput): Promise<Folder> {
    const catalog = await this.read();
    if (input.folderId !== undefined && input.folderId !== null)
      validation('Folders cannot be nested');
    const id = input.id ?? createId();
    assertId(id, 'Folder ID');
    assertNewId(catalog, id);
    const now = this.timestamp();
    const folder: Folder = {
      id,
      name: validateName(input.name),
      sortOrder: nextFolderOrder(catalog),
      color: validateColor(input.color),
      iconName: validateIcon(input.iconName),
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    const next = normalizeCatalogOrders({ ...catalog, folders: [...catalog.folders, folder] });
    await this.write(next);
    return next.folders.find((candidate) => candidate.id === id) as Folder;
  }

  async updateFolder(id: UUID, input: UpdateFolderInput): Promise<Folder> {
    const catalog = await this.read();
    const current = catalog.folders.find((folder) => folder.id === id);
    if (!current) throw new PersistenceError('validation', `Unknown folder "${id}"`);
    const nextFolder: Folder = {
      ...current,
      name: input.name === undefined ? current.name : validateName(input.name),
      color: input.color === undefined ? current.color : validateColor(input.color),
      iconName: input.iconName === undefined ? current.iconName : validateIcon(input.iconName),
      updatedAt: this.timestamp(),
    };
    const next = {
      ...catalog,
      folders: catalog.folders.map((folder) => (folder.id === id ? nextFolder : folder)),
    };
    await this.write(next);
    return nextFolder;
  }

  async moveFolder(id: UUID, folderId: UUID | null): Promise<Folder> {
    if (folderId !== null) validation('Folders cannot be nested');
    return this.getFolder(id);
  }

  async archiveFolder(id: UUID): Promise<Folder> {
    return this.setFolderArchiveState(id, true);
  }

  async restoreFolder(id: UUID): Promise<Folder> {
    return this.setFolderArchiveState(id, false);
  }

  async createActivity(input: CreateActivityInput): Promise<Activity> {
    const catalog = await this.read();
    const folderId = input.folderId ?? null;
    folderForPlacement(catalog, folderId);
    const id = input.id ?? createId();
    assertId(id, 'Activity ID');
    assertNewId(catalog, id);
    const now = this.timestamp();
    const activity: Activity = {
      id,
      kind: 'activity',
      name: validateName(input.name),
      folderId,
      sortOrder: nextSiblingOrder(catalog, folderId),
      color: validateColor(input.color),
      iconName: validateIcon(input.iconName),
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    const next = normalizeCatalogOrders({
      ...catalog,
      activities: [...catalog.activities, activity],
    });
    await this.write(next);
    return next.activities.find((candidate) => candidate.id === id) as Activity;
  }

  async updateActivity(id: UUID, input: UpdateActivityInput): Promise<Activity> {
    const catalog = await this.read();
    const current = catalog.activities.find((activity) => activity.id === id);
    if (!current) throw new PersistenceError('validation', `Unknown activity "${id}"`);
    const folderId = input.folderId === undefined ? current.folderId : input.folderId;
    if (input.folderId !== undefined) folderForPlacement(catalog, folderId);
    const moved = folderId !== current.folderId;
    const nextActivity: Activity = {
      ...current,
      name: input.name === undefined ? current.name : validateName(input.name),
      folderId,
      sortOrder: moved ? nextSiblingOrder(catalog, folderId, id) : current.sortOrder,
      color: input.color === undefined ? current.color : validateColor(input.color),
      iconName: input.iconName === undefined ? current.iconName : validateIcon(input.iconName),
      updatedAt: this.timestamp(),
    };
    const next = normalizeCatalogOrders({
      ...catalog,
      activities: catalog.activities.map((activity) =>
        activity.id === id ? nextActivity : activity
      ),
    });
    await this.write(next);
    return next.activities.find((candidate) => candidate.id === id) as Activity;
  }

  async moveActivity(id: UUID, folderId: UUID | null): Promise<Activity> {
    return this.updateActivity(id, { folderId });
  }

  async archiveActivity(id: UUID): Promise<Activity> {
    return this.setActivityArchiveState(id, true);
  }

  async restoreActivity(id: UUID): Promise<Activity> {
    return this.setActivityArchiveState(id, false);
  }

  async createRoutine(input: CreateRoutineInput): Promise<RoutineDefinition> {
    const catalog = await this.read();
    const folderId = input.folderId ?? null;
    folderForPlacement(catalog, folderId);
    const id = input.id ?? createId();
    assertId(id, 'Routine ID');
    assertNewId(catalog, id);
    const now = this.timestamp();
    const steps = this.validateSteps(catalog, input.steps ?? [], now);
    const routine: RoutineDefinition = {
      id,
      kind: 'routine',
      name: validateName(input.name),
      folderId,
      sortOrder: nextSiblingOrder(catalog, folderId),
      color: validateColor(input.color),
      iconName: validateIcon(input.iconName),
      steps,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    const next = normalizeCatalogOrders({ ...catalog, routines: [...catalog.routines, routine] });
    await this.write(next);
    return next.routines.find((candidate) => candidate.id === id) as RoutineDefinition;
  }

  async updateRoutine(id: UUID, input: UpdateRoutineInput): Promise<RoutineDefinition> {
    const catalog = await this.read();
    const current = catalog.routines.find((routine) => routine.id === id);
    if (!current) throw new PersistenceError('validation', `Unknown routine "${id}"`);
    const folderId = input.folderId === undefined ? current.folderId : input.folderId;
    if (input.folderId !== undefined) folderForPlacement(catalog, folderId);
    const moved = folderId !== current.folderId;
    const nextRoutine: RoutineDefinition = {
      ...current,
      name: input.name === undefined ? current.name : validateName(input.name),
      folderId,
      sortOrder: moved ? nextSiblingOrder(catalog, folderId, id) : current.sortOrder,
      color: input.color === undefined ? current.color : validateColor(input.color),
      iconName: input.iconName === undefined ? current.iconName : validateIcon(input.iconName),
      updatedAt: this.timestamp(),
    };
    const next = normalizeCatalogOrders({
      ...catalog,
      routines: catalog.routines.map((routine) => (routine.id === id ? nextRoutine : routine)),
    });
    await this.write(next);
    return next.routines.find((candidate) => candidate.id === id) as RoutineDefinition;
  }

  async moveRoutine(id: UUID, folderId: UUID | null): Promise<RoutineDefinition> {
    return this.updateRoutine(id, { folderId });
  }

  async archiveRoutine(id: UUID): Promise<RoutineDefinition> {
    return this.setRoutineArchiveState(id, true);
  }

  async restoreRoutine(id: UUID): Promise<RoutineDefinition> {
    return this.setRoutineArchiveState(id, false);
  }

  async duplicateRoutine(
    id: UUID,
    options: DuplicateRoutineOptions = {}
  ): Promise<RoutineDefinition> {
    const catalog = await this.read();
    const source = catalog.routines.find((routine) => routine.id === id);
    if (!source) throw new PersistenceError('validation', `Unknown routine "${id}"`);
    const duplicateId = options.id ?? createId();
    assertId(duplicateId, 'Routine ID');
    assertNewId(catalog, duplicateId);
    const now = this.timestamp();
    const duplicate: RoutineDefinition = {
      ...source,
      id: duplicateId,
      name: options.name === undefined ? `${source.name} copy` : validateName(options.name),
      sortOrder: nextSiblingOrder(catalog, source.folderId),
      steps: source.steps.map((step) => ({
        ...step,
        id: createId(),
        endBehavior: validateEndBehavior(step.endBehavior),
        notes: validateStepNotes(step.notes),
        createdAt: now,
        updatedAt: now,
      })),
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    const next = normalizeCatalogOrders({ ...catalog, routines: [...catalog.routines, duplicate] });
    await this.write(next);
    return next.routines.find((routine) => routine.id === duplicateId) as RoutineDefinition;
  }

  async snapshotRoutine(id: UUID, capturedAt?: IsoTimestamp): Promise<RoutineSnapshot> {
    const routine = await this.getRoutine(id);
    const timestamp = capturedAt === undefined ? this.timestamp() : toTimestamp(capturedAt);
    return {
      id: routine.id,
      name: routine.name,
      steps: snapshotSteps(routine),
      capturedAt: timestamp,
    };
  }

  async createRoutineStep(id: UUID, input: CreateRoutineStepInput): Promise<RoutineStep> {
    const catalog = await this.read();
    const routine = catalog.routines.find((candidate) => candidate.id === id);
    if (!routine) throw new PersistenceError('validation', `Unknown routine "${id}"`);
    const stepId = input.id ?? createId();
    assertId(stepId, 'Routine step ID');
    if (routine.steps.some((step) => step.id === stepId)) {
      throw new PersistenceError('conflict', `Routine step ID "${stepId}" already exists`);
    }
    if (!catalog.activities.some((activity) => activity.id === input.activityId)) {
      validation(`Routine step "${stepId}" references an unknown activity`);
    }
    const now = this.timestamp();
    const step: RoutineStep = {
      id: stepId,
      activityId: input.activityId,
      name: input.name === undefined ? null : validateStepNotes(input.name),
      durationMs: validateDuration(input.durationMs),
      sortOrder: routine.steps.length,
      color: validateColor(input.color),
      iconName: validateIcon(input.iconName),
      endBehavior: validateEndBehavior(input.endBehavior),
      notes: validateStepNotes(input.notes),
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    const nextRoutine: RoutineDefinition = {
      ...routine,
      steps: normalizeRoutineStepOrder([...routine.steps, step]),
      updatedAt: now,
    };
    await this.write({
      ...catalog,
      routines: catalog.routines.map((candidate) =>
        candidate.id === id ? nextRoutine : candidate
      ),
    });
    return nextRoutine.steps.find((candidate) => candidate.id === stepId) as RoutineStep;
  }

  async addRoutineStep(id: UUID, input: CreateRoutineStepInput): Promise<RoutineStep> {
    return this.createRoutineStep(id, input);
  }

  async updateRoutineStep(
    routineId: UUID,
    stepId: UUID,
    input: UpdateRoutineStepInput
  ): Promise<RoutineStep> {
    const catalog = await this.read();
    const routine = catalog.routines.find((candidate) => candidate.id === routineId);
    if (!routine) throw new PersistenceError('validation', `Unknown routine "${routineId}"`);
    const current = routine.steps.find((step) => step.id === stepId);
    if (!current) throw new PersistenceError('validation', `Unknown routine step "${stepId}"`);
    const activityId = input.activityId ?? current.activityId;
    if (!catalog.activities.some((activity) => activity.id === activityId)) {
      validation(`Routine step "${stepId}" references an unknown activity`);
    }
    const nextStep: RoutineStep = {
      ...current,
      activityId,
      name: input.name === undefined ? current.name : validateStepNotes(input.name),
      durationMs:
        input.durationMs === undefined ? current.durationMs : validateDuration(input.durationMs),
      color: input.color === undefined ? current.color : validateColor(input.color),
      iconName: input.iconName === undefined ? current.iconName : validateIcon(input.iconName),
      endBehavior:
        input.endBehavior === undefined
          ? validateEndBehavior(current.endBehavior)
          : validateEndBehavior(input.endBehavior),
      notes:
        input.notes === undefined
          ? validateStepNotes(current.notes)
          : validateStepNotes(input.notes),
      updatedAt: this.timestamp(),
    };
    const nextRoutine = {
      ...routine,
      steps: normalizeRoutineStepOrder(
        routine.steps.map((step) => (step.id === stepId ? nextStep : step))
      ),
      updatedAt: nextStep.updatedAt,
    };
    await this.write({
      ...catalog,
      routines: catalog.routines.map((candidate) =>
        candidate.id === routineId ? nextRoutine : candidate
      ),
    });
    return nextStep;
  }

  async duplicateRoutineStep(
    routineId: UUID,
    stepId: UUID,
    options: DuplicateRoutineStepOptions = {}
  ): Promise<RoutineStep> {
    const catalog = await this.read();
    const routine = catalog.routines.find((candidate) => candidate.id === routineId);
    if (!routine) throw new PersistenceError('validation', `Unknown routine "${routineId}"`);
    const source = routine.steps.find((step) => step.id === stepId);
    if (!source) throw new PersistenceError('validation', `Unknown routine step "${stepId}"`);
    const duplicateId = options.id ?? createId();
    assertId(duplicateId, 'Routine step ID');
    if (routine.steps.some((step) => step.id === duplicateId)) {
      throw new PersistenceError('conflict', `Routine step ID "${duplicateId}" already exists`);
    }
    const ordered = normalizeRoutineStepOrder(sortByOrder(routine.steps));
    const sourceIndex = ordered.findIndex((step) => step.id === stepId);
    const now = this.timestamp();
    const duplicate: RoutineStep = {
      ...source,
      id: duplicateId,
      name: options.name === undefined ? source.name : validateStepNotes(options.name),
      sortOrder: sourceIndex + 1,
      endBehavior: validateEndBehavior(source.endBehavior),
      notes: validateStepNotes(source.notes),
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    const steps = [...ordered];
    steps.splice(sourceIndex + 1, 0, duplicate);
    const nextRoutine = { ...routine, steps: normalizeRoutineStepOrder(steps), updatedAt: now };
    await this.write({
      ...catalog,
      routines: catalog.routines.map((candidate) =>
        candidate.id === routineId ? nextRoutine : candidate
      ),
    });
    return nextRoutine.steps.find((step) => step.id === duplicateId) as RoutineStep;
  }

  async deleteRoutineStep(routineId: UUID, stepId: UUID): Promise<RoutineStep> {
    const catalog = await this.read();
    const routine = catalog.routines.find((candidate) => candidate.id === routineId);
    if (!routine) throw new PersistenceError('validation', `Unknown routine "${routineId}"`);
    const deleted = routine.steps.find((step) => step.id === stepId);
    if (!deleted) throw new PersistenceError('validation', `Unknown routine step "${stepId}"`);
    const nextRoutine = {
      ...routine,
      steps: normalizeRoutineStepOrder(routine.steps.filter((step) => step.id !== stepId)),
      updatedAt: this.timestamp(),
    };
    await this.write({
      ...catalog,
      routines: catalog.routines.map((candidate) =>
        candidate.id === routineId ? nextRoutine : candidate
      ),
    });
    return deleted;
  }

  async removeRoutineStep(routineId: UUID, stepId: UUID): Promise<RoutineStep> {
    return this.deleteRoutineStep(routineId, stepId);
  }

  async reorderFolders(id: UUID, direction: OrderDirection): Promise<Folder[]> {
    const catalog = await this.read();
    if (!catalog.folders.some((folder) => folder.id === id))
      throw new PersistenceError('validation', `Unknown folder "${id}"`);
    const folders =
      direction === 'up' ? moveUp(catalog.folders, id) : moveDown(catalog.folders, id);
    const next = normalizeCatalogOrders({ ...catalog, folders });
    await this.write(next);
    return next.folders;
  }

  async reorderItem(id: UUID, direction: OrderDirection): Promise<CatalogCollection> {
    const catalog = await this.read();
    const item = trackableWithId(catalog, id);
    if (!item) throw new PersistenceError('validation', `Unknown catalog item "${id}"`);
    const siblings = [...catalog.activities, ...catalog.routines].filter(
      (candidate) => candidate.folderId === item.folderId
    );
    const moved = direction === 'up' ? moveUp(siblings, id) : moveDown(siblings, id);
    const orderById = new Map(moved.map((candidate) => [candidate.id, candidate.sortOrder]));
    const next = normalizeCatalogOrders({
      ...catalog,
      activities: catalog.activities.map((activity) => ({
        ...activity,
        sortOrder: orderById.get(activity.id) ?? activity.sortOrder,
      })),
      routines: catalog.routines.map((routine) => ({
        ...routine,
        sortOrder: orderById.get(routine.id) ?? routine.sortOrder,
      })),
    });
    await this.write(next);
    return next;
  }

  async reorderRoutineStep(
    routineId: UUID,
    stepId: UUID,
    direction: OrderDirection
  ): Promise<RoutineStep[]> {
    const catalog = await this.read();
    const routine = catalog.routines.find((candidate) => candidate.id === routineId);
    if (!routine) throw new PersistenceError('validation', `Unknown routine "${routineId}"`);
    const steps = reorderRoutineSteps(routine.steps, stepId, direction);
    const next = normalizeCatalogOrders({
      ...catalog,
      routines: catalog.routines.map((candidate) =>
        candidate.id === routineId
          ? { ...candidate, steps, updatedAt: this.timestamp() }
          : candidate
      ),
    });
    await this.write(next);
    return next.routines.find((candidate) => candidate.id === routineId)?.steps ?? [];
  }

  async normalizeOrders(): Promise<CatalogCollection> {
    const next = normalizeCatalogOrders(await this.read());
    await this.write(next);
    return next;
  }

  /** Exposes the pure habit ordering contract without coupling catalog to habit persistence. */
  reorderHabits(habits: readonly Habit[], habitId: UUID, direction: OrderDirection): Habit[] {
    return reorderHabits(habits, habitId, direction);
  }

  private timestamp(): IsoTimestamp {
    return toTimestamp(this.now());
  }

  private async write(catalog: CatalogCollection): Promise<void> {
    assertCatalogInvariants(catalog);
    await this.repository.write(catalog);
  }

  private validateSteps(
    catalog: CatalogCollection,
    steps: readonly (RoutineStep | CreateRoutineStepInput)[],
    createdAt: IsoTimestamp
  ): RoutineStep[] {
    const activities = new Set(catalog.activities.map((activity) => activity.id));
    const seen = new Set<string>();
    const parsed = steps.map((step, index) => {
      const candidate: RoutineStep =
        'createdAt' in step
          ? step
          : {
              id: step.id ?? createId(),
              activityId: step.activityId,
              name: step.name ?? null,
              durationMs: step.durationMs,
              sortOrder: index,
              color: step.color ?? null,
              iconName: step.iconName ?? null,
              endBehavior: step.endBehavior,
              notes: step.notes ?? null,
              createdAt,
              updatedAt: createdAt,
              archivedAt: null,
            };
      const normalizedStep = {
        ...candidate,
        endBehavior: validateEndBehavior(candidate.endBehavior),
        notes: validateStepNotes(candidate.notes),
      };
      const result = routineStepSchema.safeParse(normalizedStep);
      if (!result.success) validation(`Routine step failed validation: ${result.error.message}`);
      if (seen.has(candidate.id)) validation(`Duplicate routine step ID "${candidate.id}"`);
      seen.add(candidate.id);
      if (!activities.has(candidate.activityId))
        validation(`Routine step "${candidate.id}" references an unknown activity`);
      validateDuration(candidate.durationMs);
      return result.data as RoutineStep;
    });
    return sortByOrder(parsed).map((step, index) => ({ ...step, sortOrder: index }));
  }

  private async setFolderArchiveState(id: UUID, archived: boolean): Promise<Folder> {
    const catalog = await this.read();
    const current = catalog.folders.find((folder) => folder.id === id);
    if (!current) throw new PersistenceError('validation', `Unknown folder "${id}"`);
    if ((current.archivedAt !== null) === archived) return current;
    const nextFolder = {
      ...current,
      archivedAt: archived ? this.timestamp() : null,
      updatedAt: this.timestamp(),
    };
    const next = {
      ...catalog,
      folders: catalog.folders.map((folder) => (folder.id === id ? nextFolder : folder)),
    };
    await this.write(next);
    return nextFolder;
  }

  private async setActivityArchiveState(id: UUID, archived: boolean): Promise<Activity> {
    const catalog = await this.read();
    const current = catalog.activities.find((activity) => activity.id === id);
    if (!current) throw new PersistenceError('validation', `Unknown activity "${id}"`);
    if ((current.archivedAt !== null) === archived) return current;
    const nextActivity = {
      ...current,
      archivedAt: archived ? this.timestamp() : null,
      updatedAt: this.timestamp(),
    };
    const next = {
      ...catalog,
      activities: catalog.activities.map((activity) =>
        activity.id === id ? nextActivity : activity
      ),
    };
    await this.write(next);
    return nextActivity;
  }

  private async setRoutineArchiveState(id: UUID, archived: boolean): Promise<RoutineDefinition> {
    const catalog = await this.read();
    const current = catalog.routines.find((routine) => routine.id === id);
    if (!current) throw new PersistenceError('validation', `Unknown routine "${id}"`);
    if ((current.archivedAt !== null) === archived) return current;
    const nextRoutine = {
      ...current,
      archivedAt: archived ? this.timestamp() : null,
      updatedAt: this.timestamp(),
    };
    const next = {
      ...catalog,
      routines: catalog.routines.map((routine) => (routine.id === id ? nextRoutine : routine)),
    };
    await this.write(next);
    return nextRoutine;
  }
}

export function createCatalogService(
  repository: CatalogRepositoryApi,
  options?: CatalogServiceOptions
): CatalogService {
  return new CatalogService(repository, options);
}
