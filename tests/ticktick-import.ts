import { strToU8, zipSync } from 'fflate';

import type { Habit, HabitDayState, HabitMonthCollection, MonthKey } from '../src/domain';
import type { HabitRepositoryApi } from '../src/data';
import { buildTickTickImportInputs, parseTickTickWorkbook } from '../src/habits/ticktick-import';
import { HabitService } from '../src/habits/habit-service';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function workbookWithSheet(sheet: string): Uint8Array {
  return zipSync({
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Morning habit" sheetId="1" r:id="rId1"/></sheets></workbook>'
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'
    ),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
  });
}

class ImportRepository implements HabitRepositoryApi {
  habits: Habit[] = [];
  readonly states = new Map<string, HabitDayState>();

  async readHabits(): Promise<Habit[]> {
    return [...this.habits];
  }

  async writeHabits(habits: readonly Habit[]): Promise<void> {
    this.habits = [...habits];
  }

  async readMonth(month: MonthKey): Promise<HabitMonthCollection> {
    return {
      month,
      states: [...this.states.values()].filter((state) => state.logicalDay.startsWith(month)),
    };
  }

  async writeMonth(collection: HabitMonthCollection): Promise<void> {
    for (const state of [...this.states.values()]) {
      if (state.logicalDay.startsWith(collection.month)) {
        this.states.delete(`${state.habitId}:${state.logicalDay}`);
      }
    }
    for (const state of collection.states) {
      this.states.set(`${state.habitId}:${state.logicalDay}`, state);
    }
  }

  async upsertDayState(state: HabitDayState): Promise<void> {
    this.states.set(`${state.habitId}:${state.logicalDay}`, state);
  }

  async updateSignals(): Promise<HabitDayState> {
    throw new Error('not used by TickTick import test');
  }

  async updateOutcome(): Promise<HabitDayState> {
    throw new Error('not used by TickTick import test');
  }
}

async function run(): Promise<void> {
  const workbook = workbookWithSheet(`
    <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <sheetData>
        <row r="1"><c r="A1" t="inlineStr"><is><t>Basic Information&#xA;Habit Name: Morning habit&#xA;Habit Status: ARCHIVED&#xA;Goal: 1 Count/day&#xA;Section: Morning&#xA;Reminder: 08:00 &#xA;Frequency: every Monday, Wednesday</t></is></c></row>
        <row r="2"><c r="A2" t="inlineStr"><is><t>Date:2026-01-01~2026-01-31</t></is></c></row>
        <row r="3"><c r="A3" t="inlineStr"><is><t>Date</t></is></c><c r="B3" t="inlineStr"><is><t>Time</t></is></c><c r="C3" t="inlineStr"><is><t>Status</t></is></c><c r="D3" t="inlineStr"><is><t>Total check-ins</t></is></c></row>
        <row r="4"><c r="A4" t="inlineStr"><is><t>2026-01-05</t></is></c><c r="B4" t="inlineStr"><is><t>08:20</t></is></c><c r="C4" t="inlineStr"><is><t>Completed</t></is></c><c r="D4" t="inlineStr"><is><t>1</t></is></c></row>
        <row r="5"><c r="A5" t="inlineStr"><is><t>2026-01-07</t></is></c><c r="B5" t="inlineStr"><is><t>08:25</t></is></c><c r="C5" t="inlineStr"><is><t>Uncompleted</t></is></c><c r="D5" t="inlineStr"><is><t>0</t></is></c></row>
        <row r="6"><c r="A6" t="inlineStr"><is><t>2026-01-12</t></is></c><c r="B6" t="inlineStr"><is><t>08:30</t></is></c><c r="C6" t="inlineStr"><is><t>Partially Completed</t></is></c><c r="D6" t="inlineStr"><is><t>0</t></is></c></row>
      </sheetData>
    </worksheet>
  `);
  const preview = parseTickTickWorkbook(workbook);
  const habit = preview.habits[0];
  assert(habit !== undefined, 'the TickTick sheet should produce one habit');
  assert(habit.name === 'Morning habit', 'metadata should provide the habit name');
  assert(habit.status === 'archived', 'ARCHIVED should be preserved in the preview');
  assert(
    habit.schedule.kind === 'weekly' && habit.schedule.daysOfWeek.join(',') === '1,3',
    'weekday frequencies should become a selected-weekday schedule'
  );
  assert(habit.checkIns.length === 3, 'dated history rows should be parsed');

  const selected = new Set([habit.key]);
  const defaultInputs = buildTickTickImportInputs(preview, selected, {
    importHistory: true,
    includeIncomplete: true,
    partialPolicy: 'failed',
    preserveArchived: true,
  });
  assert(defaultInputs[0]?.archived === true, 'import options should preserve archive state');
  assert(
    defaultInputs[0]?.states?.map((state) => `${state.logicalDay}:${state.outcome}`).join(',') ===
      '2026-01-05:done,2026-01-07:failed,2026-01-12:failed',
    'completed, uncompleted, and partial rows should map to explicit outcomes'
  );

  const donePartials = buildTickTickImportInputs(preview, selected, {
    importHistory: true,
    includeIncomplete: true,
    partialPolicy: 'done',
    preserveArchived: false,
  });
  assert(
    donePartials[0]?.archived === false && donePartials[0]?.states?.[2]?.outcome === 'done',
    'the review options should control archive preservation and partial status mapping'
  );

  const withoutIncomplete = buildTickTickImportInputs(preview, selected, {
    importHistory: true,
    includeIncomplete: false,
    partialPolicy: 'failed',
    preserveArchived: true,
  });
  assert(withoutIncomplete[0]?.states?.length === 1, 'incomplete rows should be optional');

  const repository = new ImportRepository();
  const service = new HabitService(repository, { now: () => '2026-02-01T00:00:00.000Z' });
  const imported = await service.importHabits(defaultInputs);
  assert(imported.imported.length === 1, 'the habit service should persist one imported habit');
  assert(imported.importedStateCount === 3, 'the habit service should persist imported states');
  assert(repository.habits[0]?.archivedAt !== null, 'archived imports should persist as archived');
  assert(
    [...repository.states.values()].some(
      (state) => state.habitId === imported.imported[0]?.id && state.outcome === 'failed'
    ),
    'imported states should be associated with the generated habit ID'
  );
  const duplicate = await service.importHabits(defaultInputs);
  assert(
    duplicate.imported.length === 0 && duplicate.skippedNames[0] === 'Morning habit',
    'duplicate names should be skipped by default'
  );

  const invalidWorkbook = () => parseTickTickWorkbook(strToU8('not an xlsx'));
  let rejected = false;
  try {
    invalidWorkbook();
  } catch {
    rejected = true;
  }
  assert(rejected, 'unreadable files should produce an import error');
  console.log('Validated TickTick XLSX parsing, review options, and safe habit persistence.');
}

run().catch((error: unknown) => {
  throw error;
});
