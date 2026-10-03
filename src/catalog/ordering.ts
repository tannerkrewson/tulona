import {
  normalizeRoutineStepOrder,
  normalizeSortOrder,
  sortByOrder,
  type CatalogCollection,
  type Folder,
  type Habit,
  type Ordered,
  type RoutineStep,
  type TrackableItem,
} from '../domain';

export type OrderDirection = 'up' | 'down';

export interface IdentifiedOrdered extends Ordered {
  id: string;
}

/** Moves an item one position while assigning contiguous integer order values. */
export function moveOrderedItem<T extends IdentifiedOrdered>(
  items: readonly T[],
  itemId: string,
  direction: OrderDirection
): T[] {
  const ordered = normalizeSortOrder(sortByOrder(items));
  const index = ordered.findIndex((item) => item.id === itemId);
  if (index < 0) throw new RangeError(`Cannot reorder unknown item "${itemId}"`);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= ordered.length) return ordered;
  const result = [...ordered];
  const [item] = result.splice(index, 1);
  result.splice(target, 0, item);
  return normalizeSortOrder(result);
}

export const moveUp = <T extends IdentifiedOrdered>(items: readonly T[], itemId: string): T[] =>
  moveOrderedItem(items, itemId, 'up');

export const moveDown = <T extends IdentifiedOrdered>(items: readonly T[], itemId: string): T[] =>
  moveOrderedItem(items, itemId, 'down');

export function reorderRoutineSteps(
  steps: readonly RoutineStep[],
  stepId: string,
  direction: OrderDirection
): RoutineStep[] {
  return moveOrderedItem(steps, stepId, direction);
}

/** Pure ordering entry point for the habit workstream. It does not persist or edit habit state. */
export function reorderHabits(
  habits: readonly Habit[],
  habitId: string,
  direction: OrderDirection
): Habit[] {
  return moveOrderedItem(habits, habitId, direction);
}

function normalizeTrackableGroups(
  items: readonly TrackableItem[]
): Map<string | null, TrackableItem[]> {
  const groups = new Map<string | null, TrackableItem[]>();
  for (const item of items) {
    groups.set(item.folderId, [...(groups.get(item.folderId) ?? []), item]);
  }
  for (const [folderId, group] of groups) {
    groups.set(folderId, normalizeSortOrder(sortByOrder(group)));
  }
  return groups;
}

function rootCatalogEntities(catalog: CatalogCollection): (Folder | TrackableItem)[] {
  return [
    ...catalog.folders,
    ...catalog.activities.filter((item) => item.folderId === null),
    ...catalog.routines.filter((item) => item.folderId === null),
  ];
}

/** Reorders selected siblings within their existing slots, preserving hidden items and placement. */
export function reorderCatalogItems(
  catalog: CatalogCollection,
  orderedIds: readonly string[]
): CatalogCollection {
  const entities: (Folder | TrackableItem)[] = [
    ...catalog.folders,
    ...catalog.activities,
    ...catalog.routines,
  ];
  const byId = new Map(entities.map((item) => [item.id, item]));
  const groups = new Map<string | null, (Folder | TrackableItem)[]>();
  const seen = new Set<string>();
  for (const id of orderedIds) {
    const item = byId.get(id);
    if (!item || seen.has(id)) throw new RangeError(`Invalid catalog order item "${id}"`);
    seen.add(id);
    const parent = 'kind' in item ? item.folderId : null;
    const group = groups.get(parent) ?? [];
    group.push(item);
    groups.set(parent, group);
  }
  const orderById = new Map<string, number>();
  for (const group of groups.values()) {
    const slots = group.map((item) => item.sortOrder).sort((left, right) => left - right);
    group.forEach((item, index) => orderById.set(item.id, slots[index]));
  }
  const applyOrder = <T extends IdentifiedOrdered>(item: T): T => {
    const sortOrder = orderById.get(item.id);
    return sortOrder === undefined || sortOrder === item.sortOrder ? item : { ...item, sortOrder };
  };
  return {
    folders: catalog.folders.map(applyOrder),
    activities: catalog.activities.map(applyOrder),
    routines: catalog.routines.map(applyOrder),
  };
}

/** Case-insensitive, natural name order; equal names retain their displayed order. */
export function alphabetizedCatalogIds(
  catalog: CatalogCollection,
  visibleIds: readonly string[]
): string[] {
  const names = new Map(
    [...catalog.folders, ...catalog.activities, ...catalog.routines].map((item) => [
      item.id,
      item.name,
    ])
  );
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  return [...visibleIds].sort((left, right) =>
    collator.compare(names.get(left) ?? '', names.get(right) ?? '')
  );
}

/** Moves a folder or root trackable item through the shared catalog order. */
export function reorderCatalogRoot(
  catalog: CatalogCollection,
  id: string,
  direction: OrderDirection
): CatalogCollection {
  const moved = moveOrderedItem(rootCatalogEntities(catalog), id, direction);
  const orderById = new Map(moved.map((item) => [item.id, item.sortOrder]));
  return normalizeCatalogOrders({
    ...catalog,
    folders: catalog.folders.map((folder) => ({
      ...folder,
      sortOrder: orderById.get(folder.id) ?? folder.sortOrder,
    })),
    activities: catalog.activities.map((activity) => ({
      ...activity,
      sortOrder:
        activity.folderId === null
          ? (orderById.get(activity.id) ?? activity.sortOrder)
          : activity.sortOrder,
    })),
    routines: catalog.routines.map((routine) => ({
      ...routine,
      sortOrder:
        routine.folderId === null
          ? (orderById.get(routine.id) ?? routine.sortOrder)
          : routine.sortOrder,
    })),
  });
}

/** Normalizes the shared root order, every child group, and routine steps. */
export function normalizeCatalogOrders(catalog: CatalogCollection): CatalogCollection {
  const rootOrderById = new Map(
    normalizeSortOrder(sortByOrder(rootCatalogEntities(catalog))).map((item) => [
      item.id,
      item.sortOrder,
    ])
  );
  const childOrderById = new Map<string, number>();
  for (const group of normalizeTrackableGroups(
    [...catalog.activities, ...catalog.routines].filter((item) => item.folderId !== null)
  ).values()) {
    for (const item of group) childOrderById.set(item.id, item.sortOrder);
  }

  return {
    folders: catalog.folders.map((folder) => ({
      ...folder,
      sortOrder: rootOrderById.get(folder.id) ?? 0,
    })),
    activities: catalog.activities.map((activity) => ({
      ...activity,
      sortOrder:
        activity.folderId === null
          ? (rootOrderById.get(activity.id) ?? 0)
          : (childOrderById.get(activity.id) ?? 0),
    })),
    routines: catalog.routines.map((routine) => ({
      ...routine,
      sortOrder:
        routine.folderId === null
          ? (rootOrderById.get(routine.id) ?? 0)
          : (childOrderById.get(routine.id) ?? 0),
      steps: normalizeRoutineStepOrder(sortByOrder(routine.steps)),
    })),
  };
}
