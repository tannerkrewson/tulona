import type { Folder, Habit, RoutineStep, TrackableItem } from './models';

export interface Ordered {
  sortOrder: number;
}

export function createId(): string {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject?.randomUUID) return cryptoObject.randomUUID();
  const bytes = new Uint8Array(16);
  if (cryptoObject?.getRandomValues) cryptoObject.getRandomValues(bytes);
  else {
    for (let index = 0; index < bytes.length; index += 1)
      bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/** Stable sort by order; input position breaks ties deterministically. */
export function sortByOrder<T extends Ordered>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => left.item.sortOrder - right.item.sortOrder || left.index - right.index)
    .map(({ item }) => item);
}

/** Rewrites order values in display order without mutating the source records. */
export function normalizeSortOrder<T extends Ordered>(items: readonly T[]): T[] {
  return items.map((item, index) => ({ ...item, sortOrder: index }));
}

export function reorder<T extends Ordered>(
  items: readonly T[],
  fromIndex: number,
  toIndex: number
): T[] {
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    throw new RangeError('Reorder indexes must point to items in the collection');
  }
  const result = [...items];
  const [item] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, item);
  return normalizeSortOrder(result);
}

export const normalizeRootOrder = normalizeSortOrder<TrackableItem>;
export const normalizeFolderOrder = normalizeSortOrder<Folder>;
export const normalizeRoutineStepOrder = normalizeSortOrder<RoutineStep>;
export const normalizeHabitOrder = normalizeSortOrder<Habit>;
