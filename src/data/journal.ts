import { operationJournalEntrySchema, createId } from '@domain';
import type { UUID } from '@domain';
import type { OperationChange, OperationJournalEntry } from './journal-types';

import type { KeyValueDatabase } from './database';
import { PersistenceError } from './errors';
import { JOURNAL_INDEX_KEY, operationJournalKey } from './keys';

export interface JournalChange {
  key: string;
  newValue: string | null;
}

export interface JournalOperation {
  id?: string;
  datasetId: UUID | null;
  kind: string;
  changes: readonly JournalChange[];
}

export interface RecoveryReport {
  recovered: string[];
  failed: { id: string; error: PersistenceError }[];
}

function now(): string {
  return new Date().toISOString();
}

function parseEntry(value: string, key: string): OperationJournalEntry {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new PersistenceError(
      'corruption',
      'Operation journal entry is not valid JSON',
      key,
      error
    );
  }
  const result = operationJournalEntrySchema.safeParse(parsed);
  if (!result.success)
    throw new PersistenceError(
      'journal',
      `Operation journal entry failed validation: ${result.error.message}`,
      key,
      result.error
    );
  return result.data as OperationJournalEntry;
}

async function readIndex(database: KeyValueDatabase): Promise<string[]> {
  const value = await database.read(JOURNAL_INDEX_KEY);
  if (value === null) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== 'string'))
      throw new Error('index is not an array of IDs');
    return parsed as string[];
  } catch (error) {
    throw new PersistenceError(
      'corruption',
      'Operation journal index is invalid',
      JOURNAL_INDEX_KEY,
      error
    );
  }
}

async function writeIndex(database: KeyValueDatabase, ids: readonly string[]): Promise<void> {
  const value = JSON.stringify([...new Set(ids)]);
  await database.write(JOURNAL_INDEX_KEY, value);
  await database.verify(JOURNAL_INDEX_KEY, value);
}

export class OperationJournal {
  constructor(private readonly database: KeyValueDatabase) {}

  async run(operation: JournalOperation): Promise<OperationJournalEntry> {
    if (operation.changes.length === 0)
      throw new PersistenceError('journal', 'A journaled operation needs at least one change');
    const keys = new Set<string>();
    for (const change of operation.changes) {
      if (!change.key || keys.has(change.key))
        throw new PersistenceError(
          'journal',
          'Journal changes must have unique non-empty keys',
          change.key
        );
      keys.add(change.key);
    }
    const id = operation.id ?? createId();
    const journalKey = operationJournalKey(id);
    const existingValue = await this.database.read(journalKey);
    if (existingValue !== null) {
      const existing = parseEntry(existingValue, journalKey);
      if (
        existing.kind !== operation.kind ||
        existing.datasetId !== operation.datasetId ||
        existing.changes.length !== operation.changes.length ||
        existing.changes.some(
          (change, index) =>
            change.key !== operation.changes[index]?.key ||
            change.newValue !== operation.changes[index]?.newValue
        )
      ) {
        throw new PersistenceError(
          'conflict',
          `Journal operation "${id}" conflicts with an existing operation`,
          journalKey
        );
      }
      if (existing.status === 'committed') return existing;
      return this.resume(existing);
    }

    const changes: OperationChange[] = [];
    for (const change of operation.changes) {
      changes.push({
        key: change.key,
        oldValue: await this.database.read(change.key),
        newValue: change.newValue,
      });
    }
    const timestamp = now();
    const entry: OperationJournalEntry = {
      id,
      datasetId: operation.datasetId,
      kind: operation.kind,
      status: 'prepared',
      changes,
      createdAt: timestamp,
      updatedAt: timestamp,
      error: null,
    };
    const ids = await readIndex(this.database);
    if (!ids.includes(id)) await writeIndex(this.database, [...ids, id]);
    // Register before applying so a crash after preparation is discoverable.
    await this.writeEntry(entry);
    return this.resume(entry);
  }

  async recoverUnfinished(): Promise<RecoveryReport> {
    const recovered: string[] = [];
    const failed: { id: string; error: PersistenceError }[] = [];
    for (const id of await readIndex(this.database)) {
      const key = operationJournalKey(id);
      const value = await this.database.read(key);
      if (value === null) continue;
      const entry = parseEntry(value, key);
      if (entry.status === 'committed') continue;
      try {
        await this.resume(entry);
        recovered.push(id);
      } catch (error) {
        const persistenceError =
          error instanceof PersistenceError
            ? error
            : new PersistenceError('journal', `Journal recovery failed for "${id}"`, key, error);
        failed.push({ id, error: persistenceError });
      }
    }
    return { recovered, failed };
  }

  async recover(): Promise<RecoveryReport> {
    return this.recoverUnfinished();
  }

  async read(id: string): Promise<OperationJournalEntry | null> {
    const key = operationJournalKey(id);
    const value = await this.database.read(key);
    return value === null ? null : parseEntry(value, key);
  }

  private async resume(entry: OperationJournalEntry): Promise<OperationJournalEntry> {
    let current: OperationJournalEntry = {
      ...entry,
      status: 'applying',
      updatedAt: now(),
      error: null,
    };
    await this.writeEntry(current);
    try {
      for (const change of current.changes) {
        const actual = await this.database.read(change.key);
        if (actual === change.newValue) continue;
        if (actual !== change.oldValue) {
          throw new PersistenceError(
            'conflict',
            `Journal will not overwrite unexpected data at "${change.key}"`,
            change.key,
            {
              expectedOldValue: change.oldValue,
              actualValue: actual,
            }
          );
        }
        if (change.newValue === null) await this.database.remove(change.key);
        else await this.database.write(change.key, change.newValue);
        await this.database.verify(change.key, change.newValue);
      }
      current = { ...current, status: 'committed', updatedAt: now(), error: null };
      await this.writeEntry(current);
      return current;
    } catch (error) {
      const persistenceError =
        error instanceof PersistenceError
          ? error
          : new PersistenceError(
              'journal',
              `Journal operation "${entry.id}" failed`,
              operationJournalKey(entry.id),
              error
            );
      current = { ...current, status: 'failed', updatedAt: now(), error: persistenceError.message };
      await this.writeEntry(current);
      throw persistenceError;
    }
  }

  private async writeEntry(entry: OperationJournalEntry): Promise<void> {
    const key = operationJournalKey(entry.id);
    const result = operationJournalEntrySchema.safeParse(entry);
    if (!result.success)
      throw new PersistenceError(
        'journal',
        `Cannot persist journal entry: ${result.error.message}`,
        key,
        result.error
      );
    const value = JSON.stringify(result.data);
    await this.database.write(key, value);
    await this.database.verify(key, value);
  }
}
