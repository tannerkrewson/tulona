/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
/* eslint-enable @typescript-eslint/no-require-imports */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = path.resolve(process.cwd());
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const importer = read('src/habits/HabitImportScreen.tsx');
const header = read('src/habits/HabitHeader.tsx');
const list = read('src/habits/HabitListScreen.tsx');
const layout = read('app/_layout.tsx');
const gitignore = read('.gitignore');

assert(gitignore.includes('/Habits_*.xlsx'), 'TickTick exports must remain ignored');
assert(
  importer.includes('DocumentPicker.getDocumentAsync') &&
    importer.includes('parseTickTickWorkbook') &&
    importer.includes('ticktick-import-selected'),
  'the importer must offer XLSX selection, parsing, and an import action'
);
assert(
  importer.includes('ticktick-habit-${habit.key}') &&
    importer.includes('ticktick-select-all') &&
    importer.includes('ticktick-clear-selection') &&
    importer.includes('accessibilityRole="checkbox"'),
  'the importer must expose individual habit selection plus select-all controls'
);
assert(
  importer.includes('ticktick-import-history') &&
    importer.includes('ticktick-include-incomplete') &&
    importer.includes('ticktick-preserve-archived') &&
    importer.includes('ticktick-partial-policy') &&
    importer.includes('ticktick-duplicate-policy'),
  'the importer must expose history, status, archive, and duplicate controls'
);
assert(
  header.includes('import-ticktick-habits') &&
    list.includes("router.push('/habit-import' as Href)") &&
    layout.includes('<Stack.Screen name="habit-import" />'),
  'the habit list must provide a route to the TickTick importer'
);

console.log('Validated TickTick importer selection and review controls.');
