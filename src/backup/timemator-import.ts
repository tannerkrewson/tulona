import {
  createId,
  toTimestamp,
  timestampMs,
  type CatalogCollection,
  type TimeTransition,
  type UUID,
} from '@domain';

import type { CatalogServiceApi } from '../catalog/catalog-service';
import type { TrackerQuery, TransitionInput } from '../tracker/tracker-engine';
import type { BulkTransitionInsertOptions, TrackerServiceApi } from '../tracker/tracker-service';

export const TIMEMATOR_CSV_HEADERS = [
  'unix_begin',
  'unix_end',
  'date',
  'begin',
  'end',
  'folder',
  'task',
  'duration',
  'duration_decimal',
] as const;

export interface TimematorCsvRow {
  rowNumber: number;
  beginMs: number;
  endMs: number | null;
  date: string;
  folderName: string | null;
  taskName: string;
}

export interface TimematorCsvPreview {
  rowCount: number;
  activityCount: number;
  folderCount: number;
  gapCount: number;
  runningRowCount: number;
  firstTimestamp: string;
  lastTimestamp: string;
}

export interface TimematorImportSummary extends TimematorCsvPreview {
  matchedActivities: number;
  createdActivities: number;
  matchedFolders: number;
  createdFolders: number;
  insertedTransitions: number;
  skippedTransitions: number;
}

export interface TimematorImportResult {
  summary: TimematorImportSummary;
  transitions: TimeTransition[];
}

export type TimematorImportErrorCode = 'format' | 'row' | 'conflict' | 'future';

export class TimematorImportError extends Error {
  readonly name = 'TimematorImportError';

  constructor(
    readonly code: TimematorImportErrorCode,
    message: string,
    readonly rowNumber?: number
  ) {
    super(message);
  }
}

export interface TimematorImportServiceOptions {
  now?: () => number;
}

export interface TimematorImportDependencies {
  catalog: Pick<CatalogServiceApi, 'read' | 'createFolder' | 'createActivity'>;
  tracker: Pick<TrackerServiceApi, 'query' | 'insertTransitions'>;
}

interface PlannedFolder {
  id: UUID;
  name: string;
  matched: boolean;
}

interface PlannedActivity {
  id: UUID;
  name: string;
  folderId: UUID | null;
  matched: boolean;
}

function normalizeName(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function lookupKey(value: string): string {
  return normalizeName(value).toLocaleLowerCase();
}

function rowError(rowNumber: number, message: string): TimematorImportError {
  return new TimematorImportError('row', `Row ${rowNumber}: ${message}`, rowNumber);
}

function parseDelimitedRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        value += character;
      }
      continue;
    }

    if (character === '"' && value.length === 0) {
      quoted = true;
    } else if (character === ';') {
      row.push(value);
      value = '';
    } else if (character === '\n' || character === '\r') {
      row.push(value);
      value = '';
      if (row.some((field) => field.trim().length > 0)) rows.push(row);
      row = [];
      if (character === '\r' && input[index + 1] === '\n') index += 1;
    } else {
      value += character;
    }
  }

  if (quoted) throw new TimematorImportError('format', 'CSV contains an unterminated quoted field');
  if (value.length > 0 || row.length > 0) {
    row.push(value);
    if (row.some((field) => field.trim().length > 0)) rows.push(row);
  }
  return rows;
}

function parseUnixSeconds(
  value: string,
  rowNumber: number,
  field: string,
  allowZero: boolean
): number {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw rowError(rowNumber, `${field} must be a whole number of Unix seconds`);
  }
  const seconds = Number(normalized);
  if (!Number.isSafeInteger(seconds) || (!allowZero && seconds <= 0)) {
    throw rowError(rowNumber, `${field} is outside the supported timestamp range`);
  }
  const milliseconds = seconds * 1000;
  if (!Number.isSafeInteger(milliseconds)) {
    throw rowError(rowNumber, `${field} is outside the supported timestamp range`);
  }
  return milliseconds;
}

function parseHeader(rows: string[][]): void {
  const header = rows.shift();
  if (!header) throw new TimematorImportError('format', 'CSV is empty');
  const normalized = header.map((field) => field.trim());
  if (normalized[0]?.startsWith('\uFEFF')) normalized[0] = normalized[0].slice(1);
  if (
    normalized.length !== TIMEMATOR_CSV_HEADERS.length ||
    normalized.some((value, index) => value !== TIMEMATOR_CSV_HEADERS[index])
  ) {
    throw new TimematorImportError(
      'format',
      `Expected Timemator columns: ${TIMEMATOR_CSV_HEADERS.join(';')}`
    );
  }
}

function parseDate(value: string, rowNumber: number): string {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw rowError(rowNumber, 'date must use YYYY-MM-DD format');
  }
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    throw rowError(rowNumber, 'date is not a valid calendar date');
  }
  return normalized;
}

function parseRow(fields: string[], rowNumber: number): TimematorCsvRow {
  if (fields.length !== TIMEMATOR_CSV_HEADERS.length) {
    throw rowError(rowNumber, `expected ${TIMEMATOR_CSV_HEADERS.length} columns`);
  }
  const beginMs = parseUnixSeconds(fields[0] ?? '', rowNumber, 'unix_begin', false);
  const endSeconds = parseUnixSeconds(fields[1] ?? '', rowNumber, 'unix_end', true);
  const endMs = endSeconds === 0 ? null : endSeconds;
  if (endMs !== null && endMs <= beginMs) {
    throw rowError(rowNumber, 'unix_end must be after unix_begin');
  }
  const date = parseDate(fields[2] ?? '', rowNumber);
  const folderName = normalizeName(fields[5] ?? '');
  const taskName = normalizeName(fields[6] ?? '');
  if (!taskName) throw rowError(rowNumber, 'task must not be empty');
  return {
    rowNumber,
    beginMs,
    endMs,
    date,
    folderName: folderName || null,
    taskName,
  };
}

/** Parses the semicolon-delimited export produced by Timemator. */
export function parseTimematorCsv(input: string): TimematorCsvRow[] {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new TimematorImportError('format', 'CSV file is empty');
  }
  const rows = parseDelimitedRows(input.replace(/^\uFEFF/, ''));
  parseHeader(rows);
  if (rows.length === 0) throw new TimematorImportError('format', 'CSV contains no tracker rows');

  const parsed = rows.map((fields, index) => parseRow(fields, index + 2));
  for (let index = 0; index < parsed.length; index += 1) {
    const current = parsed[index];
    const previous = parsed[index - 1];
    if (!current) continue;
    if (previous && current.beginMs < previous.beginMs) {
      throw rowError(current.rowNumber, 'rows must be ordered by unix_begin');
    }
    if (previous?.endMs === null) {
      throw rowError(previous.rowNumber, 'a running row must be the final tracker row');
    }
    if (
      previous?.endMs !== undefined &&
      previous.endMs !== null &&
      current.beginMs < previous.endMs
    ) {
      throw rowError(current.rowNumber, 'overlapping tracker intervals are not supported');
    }
  }
  return parsed;
}

function countPreview(rows: readonly TimematorCsvRow[]): TimematorCsvPreview {
  const activities = new Set(rows.map((row) => lookupKey(row.taskName)));
  const folders = new Set(
    rows.map((row) => row.folderName && lookupKey(row.folderName)).filter(Boolean)
  );
  let gapCount = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (previous?.endMs !== null && current && current.beginMs > (previous?.endMs ?? 0)) {
      gapCount += 1;
    }
  }
  const first = rows[0];
  const last = rows.at(-1);
  if (!first || !last) throw new TimematorImportError('format', 'CSV contains no tracker rows');
  return {
    rowCount: rows.length,
    activityCount: activities.size,
    folderCount: folders.size,
    gapCount,
    runningRowCount: rows.filter((row) => row.endMs === null).length,
    firstTimestamp: toTimestamp(first.beginMs),
    lastTimestamp: toTimestamp(last.endMs ?? last.beginMs),
  };
}

export function inspectTimematorCsv(input: string): TimematorCsvPreview {
  return countPreview(parseTimematorCsv(input));
}

function hashSeed(seed: string): string {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function stableUuid(seed: string): UUID {
  const hex = Array.from({ length: 4 }, (_, index) => hashSeed(`${index}:${seed}`))
    .join('')
    .split('');
  hex[12] = '5';
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16] ?? '0', 16) % 4] ?? '8';
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}

function activityCandidates(
  catalog: CatalogCollection,
  name: string
): CatalogCollection['activities'] {
  const key = lookupKey(name);
  return catalog.activities.filter((activity) => lookupKey(activity.name) === key);
}

function folderCandidates(catalog: CatalogCollection, name: string): CatalogCollection['folders'] {
  const key = lookupKey(name);
  return catalog.folders.filter(
    (folder) => folder.archivedAt === null && lookupKey(folder.name) === key
  );
}

function sourceFolderForTask(rows: readonly TimematorCsvRow[], taskName: string): string | null {
  const names = rows
    .filter((row) => lookupKey(row.taskName) === lookupKey(taskName))
    .map((row) => row.folderName)
    .filter((name): name is string => Boolean(name));
  return names[0] ?? null;
}

function planCatalog(
  catalog: CatalogCollection,
  rows: readonly TimematorCsvRow[]
): {
  folders: PlannedFolder[];
  activities: PlannedActivity[];
  activityIds: Map<string, UUID>;
} {
  const folders: PlannedFolder[] = [];
  const activities: PlannedActivity[] = [];
  const activityIds = new Map<string, UUID>();
  const plannedFolderIds = new Map<string, UUID>();
  const taskNames = [
    ...new Map(rows.map((row) => [lookupKey(row.taskName), row.taskName])).values(),
  ];

  for (const taskName of taskNames) {
    const taskKey = lookupKey(taskName);
    const existingActivities = activityCandidates(catalog, taskName);
    const existing =
      existingActivities.find((activity) => activity.archivedAt === null) ?? existingActivities[0];
    if (existing) {
      activityIds.set(taskKey, existing.id);
      continue;
    }

    const sourceFolder = sourceFolderForTask(rows, taskName);
    let folderId: UUID | null = null;
    if (sourceFolder) {
      const folderKey = lookupKey(sourceFolder);
      const existingFolder = folderCandidates(catalog, sourceFolder)[0];
      if (existingFolder) {
        folderId = existingFolder.id;
      } else {
        folderId = plannedFolderIds.get(folderKey) ?? createId();
        plannedFolderIds.set(folderKey, folderId);
        if (!folders.some((folder) => folder.id === folderId)) {
          folders.push({ id: folderId, name: sourceFolder, matched: false });
        }
      }
    }
    const id = createId();
    activities.push({ id, name: taskName, folderId, matched: false });
    activityIds.set(taskKey, id);
  }

  const matchedFolders = new Set(
    rows
      .map((row) => row.folderName)
      .filter((name): name is string => Boolean(name))
      .flatMap((name) =>
        folderCandidates(catalog, name)
          .slice(0, 1)
          .map((folder) => folder.id)
      )
  );
  for (const id of matchedFolders) {
    const folder = catalog.folders.find((candidate) => candidate.id === id);
    if (folder) folders.push({ id: folder.id, name: folder.name, matched: true });
  }

  return { folders, activities, activityIds };
}

function transitionInput(
  timestamp: number,
  activityId: UUID | null,
  fingerprintToken: string
): TransitionInput {
  return {
    id: stableUuid(`transition:${timestamp}:${activityId ?? 'none'}:${fingerprintToken}`),
    activityId,
    timestamp: toTimestamp(timestamp),
    source: 'import',
    note: 'Imported from Timemator CSV',
  };
}

function planTransitions(
  rows: readonly TimematorCsvRow[],
  activityIds: ReadonlyMap<string, UUID>,
  existing: readonly TimeTransition[],
  fingerprint: string
): { transitionInputs: TransitionInput[]; skippedTransitions: number } {
  const existingByTimestamp = new Map<number, TimeTransition[]>();
  for (const transition of existing) {
    if (transition.status !== 'recorded') continue;
    const timestamp = timestampMs(transition.timestamp);
    existingByTimestamp.set(timestamp, [...(existingByTimestamp.get(timestamp) ?? []), transition]);
  }

  const transitionInputs: TransitionInput[] = [];
  const plannedByTimestamp = new Map<number, TransitionInput[]>();
  const fingerprintToken = stableUuid(`source:${fingerprint}`);
  let skippedTransitions = 0;
  const add = (timestamp: number, activityId: UUID | null) => {
    const existingAtTime = existingByTimestamp.get(timestamp) ?? [];
    const existingMatch = existingAtTime.some((transition) => transition.activityId === activityId);
    if (existingAtTime.length > 0 && !existingMatch) {
      throw new TimematorImportError(
        'conflict',
        `A recorded transition already exists at ${toTimestamp(timestamp)} for another activity`
      );
    }
    if (existingMatch) {
      skippedTransitions += 1;
      return;
    }

    const plannedAtTime = plannedByTimestamp.get(timestamp) ?? [];
    if (plannedAtTime.length > 0) {
      if (plannedAtTime.some((transition) => transition.activityId === activityId)) {
        skippedTransitions += 1;
        return;
      }
      throw new TimematorImportError(
        'conflict',
        `The import contains conflicting transitions at ${toTimestamp(timestamp)}`
      );
    }
    const input = transitionInput(timestamp, activityId, fingerprintToken);
    plannedByTimestamp.set(timestamp, [input]);
    transitionInputs.push(input);
  };

  let previousRow: TimematorCsvRow | undefined;
  let previousActivityId: UUID | undefined;
  for (const row of rows) {
    const activityId = activityIds.get(lookupKey(row.taskName));
    if (!activityId)
      throw rowError(row.rowNumber, `no activity mapping was created for "${row.taskName}"`);
    if (previousRow) {
      if (previousRow.endMs !== null && row.beginMs > previousRow.endMs) {
        add(previousRow.endMs, null);
      }
      if (
        previousRow.endMs === null ||
        row.beginMs > previousRow.endMs ||
        previousActivityId !== activityId
      ) {
        add(row.beginMs, activityId);
      }
    } else {
      add(row.beginMs, activityId);
    }
    previousRow = row;
    previousActivityId = activityId;
  }
  if (previousRow?.endMs !== null && previousRow?.endMs !== undefined) {
    add(previousRow.endMs, null);
  }
  return { transitionInputs, skippedTransitions };
}

function transitionRange(rows: readonly TimematorCsvRow[]): { startMs: number; endMs: number } {
  const first = rows[0];
  const last = rows.at(-1);
  if (!first || !last) throw new TimematorImportError('format', 'CSV contains no tracker rows');
  const endMs = last.endMs ?? last.beginMs;
  return { startMs: first.beginMs, endMs: Math.max(endMs, first.beginMs) };
}

function importFingerprint(rows: readonly TimematorCsvRow[]): string {
  return rows
    .map((row) => [row.beginMs, row.endMs ?? 0, row.folderName ?? '', row.taskName].join('\u001f'))
    .join('\u001e');
}

export class TimematorImportService {
  private readonly now: () => number;

  constructor(
    private readonly dependencies: TimematorImportDependencies,
    options: TimematorImportServiceOptions = {}
  ) {
    this.now = options.now ?? (() => Date.now());
  }

  inspect(input: string): TimematorCsvPreview {
    return inspectTimematorCsv(input);
  }

  async importCsv(input: string): Promise<TimematorImportResult> {
    const rows = parseTimematorCsv(input);
    const nowMs = this.now();
    if (!Number.isFinite(nowMs))
      throw new TimematorImportError('future', 'Current time is invalid');
    for (const row of rows) {
      if (row.beginMs > nowMs || (row.endMs !== null && row.endMs > nowMs)) {
        throw new TimematorImportError(
          'future',
          `Row ${row.rowNumber} contains time in the future; export data through the current time before importing`,
          row.rowNumber
        );
      }
    }

    const catalog = await this.dependencies.catalog.read();
    const plannedCatalog = planCatalog(catalog, rows);
    const preview = countPreview(rows);
    const fingerprint = importFingerprint(rows);
    const range = transitionRange(rows);
    const trackerRange = {
      startMs: Math.max(0, range.startMs - 1),
      endMs: Math.max(range.endMs, nowMs) + 1,
    };
    const existingQuery: TrackerQuery = await this.dependencies.tracker.query(trackerRange, nowMs);
    const plannedTransitions = planTransitions(
      rows,
      plannedCatalog.activityIds,
      existingQuery.transitions,
      fingerprint
    );

    for (const folder of plannedCatalog.folders.filter((candidate) => !candidate.matched)) {
      await this.dependencies.catalog.createFolder({ id: folder.id, name: folder.name });
    }
    for (const activity of plannedCatalog.activities) {
      await this.dependencies.catalog.createActivity({
        id: activity.id,
        name: activity.name,
        folderId: activity.folderId,
      });
    }

    let transitions: TimeTransition[] = [];
    if (plannedTransitions.transitionInputs.length > 0) {
      const options: BulkTransitionInsertOptions = {
        operationId: `timemator-csv-import-${stableUuid(`operation:${fingerprint}`)}`,
        operationKind: 'tracker-timemator-csv-import',
      };
      transitions = await this.dependencies.tracker.insertTransitions(
        plannedTransitions.transitionInputs,
        options
      );
    }

    const matchedActivities = [
      ...new Set(
        [...plannedCatalog.activityIds.values()].filter(
          (id) => !plannedCatalog.activities.some((activity) => activity.id === id)
        )
      ),
    ].length;
    const sourceFolderNames = new Set(
      rows
        .map((row) => row.folderName)
        .filter((name): name is string => Boolean(name))
        .map(lookupKey)
    );
    const createdFolderKeys = new Set(
      plannedCatalog.folders
        .filter((folder) => !folder.matched)
        .map((folder) => lookupKey(folder.name))
    );
    return {
      transitions,
      summary: {
        ...preview,
        matchedActivities,
        createdActivities: plannedCatalog.activities.length,
        matchedFolders: sourceFolderNames.size - createdFolderKeys.size,
        createdFolders: createdFolderKeys.size,
        insertedTransitions: transitions.length,
        skippedTransitions: plannedTransitions.skippedTransitions,
      },
    };
  }
}

export function createTimematorImportService(
  dependencies: TimematorImportDependencies,
  options?: TimematorImportServiceOptions
): TimematorImportService {
  return new TimematorImportService(dependencies, options);
}
