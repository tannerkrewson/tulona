import type { UUID } from '@domain';

export interface OperationChange {
  key: string;
  oldValue: string | null;
  newValue: string | null;
}

export interface OperationJournalEntry {
  id: string;
  datasetId: UUID | null;
  kind: string;
  status: 'prepared' | 'applying' | 'committed' | 'failed';
  changes: OperationChange[];
  createdAt: string;
  updatedAt: string;
  error: string | null;
}
