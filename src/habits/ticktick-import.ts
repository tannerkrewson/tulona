import { strFromU8, unzipSync } from 'fflate';

import type { HabitDayOutcome, HabitSchedule, LogicalDayKey } from '@domain';

import type { HabitImportInput, HabitImportStateInput } from './habit-service';

export type TickTickHabitStatus = 'active' | 'archived';
export type TickTickCheckInStatus = 'completed' | 'uncompleted' | 'partial';

export interface TickTickCheckIn {
  logicalDay: LogicalDayKey;
  time: string | null;
  status: TickTickCheckInStatus;
  count: number | null;
  rowNumber: number;
}

export interface TickTickHabitPreview {
  key: string;
  sheetName: string;
  name: string;
  status: TickTickHabitStatus;
  goal: string | null;
  section: string | null;
  reminder: string | null;
  frequency: string;
  schedule: HabitSchedule;
  historyStart: LogicalDayKey | null;
  historyEnd: LogicalDayKey | null;
  checkIns: readonly TickTickCheckIn[];
  warnings: readonly string[];
}

export interface TickTickWorkbookPreview {
  habits: readonly TickTickHabitPreview[];
  warnings: readonly string[];
}

export type TickTickPartialPolicy = 'failed' | 'done' | 'skip';
export type TickTickDuplicatePolicy = 'skip' | 'import';

export interface TickTickImportOptions {
  importHistory: boolean;
  includeIncomplete: boolean;
  partialPolicy: TickTickPartialPolicy;
  preserveArchived: boolean;
}

export const DEFAULT_TICKTICK_IMPORT_OPTIONS: TickTickImportOptions = {
  importHistory: true,
  includeIncomplete: true,
  partialPolicy: 'failed',
  preserveArchived: true,
};

export class TickTickImportError extends Error {
  readonly code: 'invalid-workbook' | 'unsupported-workbook';
  readonly details: readonly string[];

  constructor(
    code: 'invalid-workbook' | 'unsupported-workbook',
    message: string,
    details: readonly string[] = []
  ) {
    super(message);
    this.name = 'TickTickImportError';
    this.code = code;
    this.details = details;
  }
}

interface ParsedCell {
  ref: string;
  value: string;
  numeric: boolean;
}

interface ParsedRow {
  number: number;
  cells: Map<string, ParsedCell>;
}

interface SheetDefinition {
  name: string;
  relationshipId: string;
}

interface HabitMetadata {
  name: string | null;
  status: string | null;
  goal: string | null;
  section: string | null;
  reminder: string | null;
  frequency: string | null;
}

const WEEKDAY_BY_NAME: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    )
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function attribute(attributes: string, name: string): string | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\s)${escapedName}="([^"]*)"`).exec(attributes);
  return match ? decodeXml(match[1]) : null;
}

function elementText(xml: string, element: string): string {
  return [...xml.matchAll(new RegExp(`<${element}\\b[^>]*>([\\s\\S]*?)<\\/${element}>`, 'g'))]
    .map((match) => decodeXml(match[1]))
    .join('');
}

function sharedStringValues(xml: string | null): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) =>
    elementText(match[1], 't')
  );
}

function parseCells(xml: string, sharedStrings: readonly string[]): ParsedCell[] {
  const cells: ParsedCell[] = [];
  const cellPattern = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  for (const match of xml.matchAll(cellPattern)) {
    const attributes = match[1];
    const body = match[2] ?? '';
    const ref = attribute(attributes, 'r');
    if (!ref) continue;
    const type = attribute(attributes, 't');
    const value = elementText(body, 'v');
    const inlineValue = elementText(body, 't');
    let resolved = type === 'inlineStr' ? inlineValue : value;
    if (type === 's') {
      const index = Number(value);
      resolved = Number.isInteger(index) ? (sharedStrings[index] ?? '') : '';
    } else if (type === 'b') {
      resolved = value === '1' ? 'TRUE' : 'FALSE';
    }
    cells.push({
      ref,
      value: decodeXml(resolved),
      numeric: type === null || type === 'n',
    });
  }
  return cells;
}

function parseRows(xml: string, sharedStrings: readonly string[]): ParsedRow[] {
  return [...xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)].map((match) => {
    const number = Number(attribute(match[1], 'r'));
    return {
      number,
      cells: new Map(parseCells(match[2], sharedStrings).map((cell) => [columnOf(cell.ref), cell])),
    };
  });
}

function columnOf(ref: string): string {
  return ref.match(/^([A-Za-z]+)/)?.[1].toUpperCase() ?? ref.toUpperCase();
}

function normalized(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

function parseMetadata(value: string): HabitMetadata {
  const fields: Record<string, string> = {};
  for (const line of value.split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const key = normalized(line.slice(0, separator)).toLowerCase();
    if (!key) continue;
    fields[key] = normalized(line.slice(separator + 1));
  }
  return {
    name: fields['habit name'] || null,
    status: fields['habit status'] || null,
    goal: fields.goal || null,
    section: fields.section || null,
    reminder: fields.reminder || null,
    frequency: fields.frequency || null,
  };
}

function validLogicalDay(value: string): value is LogicalDayKey {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 &&
    date.getUTCDate() === Number(match[3])
  );
}

function logicalDayFromExcelSerial(value: string): LogicalDayKey | null {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 1) return null;
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
  const result = date.toISOString().slice(0, 10);
  return validLogicalDay(result) ? result : null;
}

function logicalDayFromCell(cell: ParsedCell | undefined): LogicalDayKey | null {
  if (!cell) return null;
  const value = normalized(cell.value);
  if (validLogicalDay(value)) return value;
  return cell.numeric ? logicalDayFromExcelSerial(value) : null;
}

function timeFromCell(cell: ParsedCell | undefined): string | null {
  if (!cell) return null;
  const value = normalized(cell.value);
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(value)) return value;
  if (!cell.numeric) return value || null;
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 0 || serial >= 1) return null;
  const totalMinutes = Math.round(serial * 24 * 60) % (24 * 60);
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

function numberFromCell(cell: ParsedCell | undefined): number | null {
  if (!cell) return null;
  const value = Number(normalized(cell.value));
  return Number.isFinite(value) ? value : null;
}

function rangeFromRows(rows: readonly ParsedRow[]): {
  start: LogicalDayKey | null;
  end: LogicalDayKey | null;
} {
  const rangeText = rows
    .flatMap((row) => [...row.cells.values()].map((cell) => cell.value))
    .find((value) => /^Date:\d{4}-\d{2}-\d{2}~\d{4}-\d{2}-\d{2}$/.test(normalized(value)));
  if (!rangeText) return { start: null, end: null };
  const match = /^Date:(\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})$/.exec(normalized(rangeText));
  if (!match || !validLogicalDay(match[1]) || !validLogicalDay(match[2])) {
    return { start: null, end: null };
  }
  return { start: match[1], end: match[2] };
}

function checkInStatus(value: string): TickTickCheckInStatus | null {
  const status = normalized(value).toLowerCase();
  if (status === 'completed' || status === 'complete') return 'completed';
  if (status === 'uncompleted' || status === 'uncomplete' || status === 'not completed') {
    return 'uncompleted';
  }
  if (status === 'partially completed' || status === 'partial') return 'partial';
  return null;
}

function parseFrequency(
  frequency: string | null,
  startDate: LogicalDayKey | null,
  warnings: string[]
): { value: string; schedule: HabitSchedule } {
  const value = normalized(frequency) || 'every day';
  const lower = value.toLowerCase();
  if (lower === 'every day' || lower === 'daily') {
    return { value, schedule: { kind: 'daily' } };
  }
  if (lower === 'weekdays' || lower === 'every weekday') {
    return { value, schedule: { kind: 'weekdays' } };
  }

  const everyDays = /^every\s+(\d+)\s+days?$/i.exec(value);
  if (everyDays) {
    if (startDate) {
      return {
        value,
        schedule: { kind: 'interval', everyDays: Number(everyDays[1]), startDate },
      };
    }
    warnings.push(`Frequency "${value}" needs a start date, so it was mapped to every day.`);
    return { value, schedule: { kind: 'daily' } };
  }

  const timesPerWeek = /^(\d+)\s+times?\s+per\s+week$/i.exec(value);
  if (timesPerWeek) {
    const count = Number(timesPerWeek[1]);
    if (count >= 1 && count <= 7) {
      return { value, schedule: { kind: 'weekly-count', timesPerWeek: count } };
    }
  }

  const dayText = lower.replace(/^every\s+(?:week\s+)?/i, '').replace(/\band\b/g, ',');
  const days = dayText
    .split(',')
    .map((day) => WEEKDAY_BY_NAME[day.trim()])
    .filter((day): day is number => day !== undefined);
  const expectedDayCount = dayText.split(',').filter((day) => day.trim()).length;
  if (days.length > 0 && days.length === expectedDayCount) {
    return { value, schedule: { kind: 'weekly', daysOfWeek: [...new Set(days)].sort() } };
  }

  warnings.push(`Frequency "${value}" is not supported and was mapped to every day.`);
  return { value, schedule: { kind: 'daily' } };
}

function statusFromMetadata(status: string | null, warnings: string[]): TickTickHabitStatus {
  const value = normalized(status).toUpperCase();
  if (value === 'ARCHIVED') return 'archived';
  if (value && value !== 'NORMAL') {
    warnings.push(`Habit status "${status}" is not recognized and was imported as active.`);
  }
  return 'active';
}

function parseSheet(
  definition: SheetDefinition,
  key: string,
  xml: string,
  sharedStrings: readonly string[]
): TickTickHabitPreview {
  const rows = parseRows(xml, sharedStrings);
  const warnings: string[] = [];
  const metadata = parseMetadata(rows[0]?.cells.get('A')?.value ?? '');
  const range = rangeFromRows(rows.slice(1, 3));
  const header = rows.find((row) => {
    const values = [...row.cells.values()].map((cell) => normalized(cell.value).toLowerCase());
    return values.includes('date') && values.includes('status');
  });
  const checkIns: TickTickCheckIn[] = [];
  if (header) {
    const dateColumn = [...header.cells.entries()].find(
      ([, cell]) => normalized(cell.value).toLowerCase() === 'date'
    )?.[0];
    const timeColumn = [...header.cells.entries()].find(
      ([, cell]) => normalized(cell.value).toLowerCase() === 'time'
    )?.[0];
    const statusColumn = [...header.cells.entries()].find(
      ([, cell]) => normalized(cell.value).toLowerCase() === 'status'
    )?.[0];
    const countColumn = [...header.cells.entries()].find(
      ([, cell]) => normalized(cell.value).toLowerCase() === 'total check-ins'
    )?.[0];
    if (!dateColumn || !statusColumn) {
      warnings.push('The history table is missing a Date or Status column.');
    } else {
      for (const row of rows.filter((candidate) => candidate.number > header.number)) {
        const dateCell = row.cells.get(dateColumn);
        if (!dateCell || !normalized(dateCell.value)) continue;
        const logicalDay = logicalDayFromCell(dateCell);
        if (!logicalDay) {
          warnings.push(`Row ${row.number} has an invalid date and was skipped.`);
          continue;
        }
        const rawStatus = row.cells.get(statusColumn)?.value ?? '';
        const status = checkInStatus(rawStatus);
        if (!status) {
          warnings.push(
            `Row ${row.number} has unsupported status "${normalized(rawStatus)}" and was skipped.`
          );
          continue;
        }
        checkIns.push({
          logicalDay,
          time: timeFromCell(timeColumn ? row.cells.get(timeColumn) : undefined),
          status,
          count: numberFromCell(countColumn ? row.cells.get(countColumn) : undefined),
          rowNumber: row.number,
        });
      }
    }
  } else if (rows.length > 2) {
    warnings.push(
      'No Date/Status history table was found; the habit will be imported without history.'
    );
  }

  const historyDays = checkIns.map((checkIn) => checkIn.logicalDay).sort();
  const historyStart = range.start ?? historyDays[0] ?? null;
  const historyEnd = range.end ?? historyDays[historyDays.length - 1] ?? null;
  const frequency = parseFrequency(metadata.frequency, historyStart, warnings);
  const name = normalized(metadata.name) || normalized(definition.name);
  if (!name)
    throw new TickTickImportError(
      'invalid-workbook',
      `Sheet "${definition.name}" has no habit name.`
    );
  if (metadata.goal && !/^\d+\s+count\/day$/i.test(metadata.goal)) {
    warnings.push(`Goal "${metadata.goal}" is imported as a binary daily completion.`);
  }
  return {
    key,
    sheetName: definition.name,
    name,
    status: statusFromMetadata(metadata.status, warnings),
    goal: metadata.goal,
    section: metadata.section,
    reminder: metadata.reminder,
    frequency: frequency.value,
    schedule: frequency.schedule,
    historyStart,
    historyEnd,
    checkIns,
    warnings,
  };
}

function workbookSheets(xml: string): SheetDefinition[] {
  return [...xml.matchAll(/<sheet\b([^>]*)\/>/g)].flatMap((match) => {
    const name = attribute(match[1], 'name');
    const relationshipId = attribute(match[1], 'r:id');
    return name && relationshipId ? [{ name, relationshipId }] : [];
  });
}

function relationshipTargets(xml: string | null): Map<string, string> {
  if (!xml) return new Map();
  return new Map(
    [...xml.matchAll(/<Relationship\b([^>]*)\/>/g)].flatMap((match) => {
      const id = attribute(match[1], 'Id');
      const target = attribute(match[1], 'Target');
      return id && target ? [[id, target] as const] : [];
    })
  );
}

function workbookPath(target: string, fallbackIndex: number): string {
  if (target.startsWith('/')) return target.slice(1);
  if (target.startsWith('xl/')) return target;
  if (target.startsWith('../')) return `xl/${target.slice(3)}`;
  return `xl/${target}` || `xl/worksheets/sheet${fallbackIndex + 1}.xml`;
}

function bytesFor(input: Uint8Array | ArrayBuffer): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

export function parseTickTickWorkbook(input: Uint8Array | ArrayBuffer): TickTickWorkbookPreview {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytesFor(input));
  } catch (error) {
    throw new TickTickImportError(
      'invalid-workbook',
      'That file is not a readable XLSX workbook.',
      [error instanceof Error ? error.message : String(error)]
    );
  }
  const workbookXml = files['xl/workbook.xml'] ? strFromU8(files['xl/workbook.xml']) : null;
  if (!workbookXml) {
    throw new TickTickImportError(
      'unsupported-workbook',
      'The selected file is missing its workbook definition.'
    );
  }
  const definitions = workbookSheets(workbookXml);
  if (definitions.length === 0) {
    throw new TickTickImportError(
      'unsupported-workbook',
      'The selected workbook does not contain any sheets.'
    );
  }
  const sharedStrings = sharedStringValues(
    files['xl/sharedStrings.xml'] ? strFromU8(files['xl/sharedStrings.xml']) : null
  );
  const targets = relationshipTargets(
    files['xl/_rels/workbook.xml.rels'] ? strFromU8(files['xl/_rels/workbook.xml.rels']) : null
  );
  const habits: TickTickHabitPreview[] = [];
  const warnings: string[] = [];
  definitions.forEach((definition, index) => {
    const key = `sheet-${index + 1}`;
    const target = targets.get(definition.relationshipId) ?? `worksheets/sheet${index + 1}.xml`;
    const path = workbookPath(target, index);
    const sheetXml = files[path] ? strFromU8(files[path]) : null;
    if (!sheetXml) {
      warnings.push(`Sheet "${definition.name}" could not be read and was skipped.`);
      return;
    }
    try {
      habits.push(parseSheet(definition, key, sheetXml, sharedStrings));
    } catch (error) {
      warnings.push(
        `Sheet "${definition.name}" could not be imported: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
  if (habits.length === 0) {
    throw new TickTickImportError(
      'unsupported-workbook',
      'No usable TickTick habit sheets were found.',
      warnings
    );
  }
  return { habits, warnings };
}

function stateForCheckIn(
  checkIn: TickTickCheckIn,
  options: Pick<TickTickImportOptions, 'includeIncomplete' | 'partialPolicy'>
): HabitImportStateInput | null {
  if (checkIn.status === 'completed') {
    return { logicalDay: checkIn.logicalDay, manual: true, automatic: null, outcome: 'done' };
  }
  if (!options.includeIncomplete) return null;
  if (checkIn.status === 'partial' && options.partialPolicy === 'skip') return null;
  const done = checkIn.status === 'partial' && options.partialPolicy === 'done';
  return {
    logicalDay: checkIn.logicalDay,
    manual: done ? true : false,
    automatic: null,
    outcome: done ? 'done' : ('failed' satisfies HabitDayOutcome),
  };
}

export function buildTickTickImportInputs(
  preview: TickTickWorkbookPreview,
  selectedKeys: ReadonlySet<string>,
  options: TickTickImportOptions
): HabitImportInput[] {
  return preview.habits
    .filter((habit) => selectedKeys.has(habit.key))
    .map((habit) => ({
      name: habit.name,
      schedule: habit.schedule,
      archived: options.preserveArchived && habit.status === 'archived',
      states: options.importHistory
        ? [
            ...new Map(
              habit.checkIns
                .map((checkIn) => stateForCheckIn(checkIn, options))
                .filter((state): state is HabitImportStateInput => state !== null)
                .map((state) => [state.logicalDay, state] as const)
            ).values(),
          ]
        : [],
    }));
}
