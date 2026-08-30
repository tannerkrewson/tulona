import {
  normalizeFolderOrder,
  normalizeRoutineStepOrder,
  normalizeSortOrder,
  sortByOrder,
  type CatalogCollection,
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

/** Normalizes every catalog sibling group and routine step collection. */
export function normalizeCatalogOrders(catalog: CatalogCollection): CatalogCollection {
  const folders = normalizeFolderOrder(sortByOrder(catalog.folders));
  const groups = normalizeTrackableGroups([...catalog.activities, ...catalog.routines]);
  const orderById = new Map<string, number>();
  for (const group of groups.values()) {
    for (const item of group) orderById.set(item.id, item.sortOrder);
  }

  return {
    folders,
    activities: catalog.activities.map((activity) => ({
      ...activity,
      sortOrder: orderById.get(activity.id) ?? 0,
    })),
    routines: catalog.routines.map((routine) => ({
      ...routine,
      sortOrder: orderById.get(routine.id) ?? 0,
      steps: normalizeRoutineStepOrder(sortByOrder(routine.steps)),
    })),
  };
}
