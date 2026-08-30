import { isUuid } from '@domain';
import type { UUID } from '@domain';

export const GLOBAL_METADATA_KEY = 'tulona:metadata';
export const JOURNAL_INDEX_KEY = 'tulona:journal:index';

export function operationJournalKey(operationId: string): string {
  return `tulona:journal:${operationId}`;
}

export type DatasetCollection =
  | 'catalog'
  | 'settings'
  | 'tracker'
  | 'active-routine'
  | 'routine-history'
  | 'habits'
  | 'habit-days';

export function datasetPrefix(datasetId: UUID): string {
  if (!isUuid(datasetId)) {
    throw new TypeError('Dataset ID must be a UUID');
  }
  return `ds:${datasetId}:`;
}

export function datasetKey(
  datasetId: UUID,
  collection: DatasetCollection,
  suffix?: string
): string {
  const key = `${datasetPrefix(datasetId)}${collection}`;
  return suffix ? `${key}:${suffix}` : key;
}
