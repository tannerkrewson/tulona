/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
/* eslint-enable @typescript-eslint/no-require-imports */

const root = path.resolve(process.cwd());
const read = (relativePath: string): string =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const confirm = read('src/ui/confirm-action.ts');
assert(
  confirm.includes('Alert.alert(') &&
    confirm.includes("style: 'cancel'") &&
    confirm.includes("style: destructive ? 'destructive' : 'default'") &&
    confirm.includes('onDismiss: () => resolve(false)') &&
    confirm.includes("Platform.OS === 'web'"),
  'confirmations must use the native system alert with a cancel action and destructive styling'
);
assert(
  !fs.existsSync(path.join(root, 'src/ui/ConfirmationModal.tsx')),
  'the custom confirmation modal must stay removed in favor of native alerts'
);

const confirmedFiles = [
  ['src/tracker/ActivitySessionScreen.tsx', 'Delete Session?'],
  ['src/catalog/CatalogEditorScreen.tsx', 'Convert to Routine?'],
  ['src/habits/HabitDetailScreen.tsx', 'Archive ${habit.name}?'],
  ['src/routine/RoutineEditorScreen.tsx', 'Delete Step?'],
  ['src/goals/GoalsScreen.tsx', 'Delete Goal?'],
  ['src/settings/GoalsSettingsPanel.tsx', 'Delete ${current.name'],
  ['src/backup/BackupScreen.tsx', 'Restore This Backup?'],
  ['src/settings/SettingsFeedback.tsx', 'Clear All Data?'],
  ['src/orchestration/BootCoordinatorGate.tsx', 'Clear Local Data?'],
] as const;

for (const [file, title] of confirmedFiles) {
  const source = read(file);
  assert(
    source.includes('confirmAction(') && source.includes(title) && !source.includes('<Modal'),
    `${file} must confirm with the native alert instead of a custom modal`
  );
}

const catalog = read('src/catalog/CatalogEditorScreen.tsx');
assert(
  catalog.includes('Archive ${activity.name}?') && catalog.includes('Archive ${folder.name}?'),
  'activity and folder archive must both ask for confirmation'
);

const backup = read('src/backup/BackupScreen.tsx');
assert(
  backup.includes('Add Timemator History?') && backup.includes('Replace Dropbox Data?'),
  'Timemator import and Dropbox setup must keep their own confirmations'
);

const session = read('src/tracker/ActivitySessionScreen.tsx');
const deletePrompt = session.indexOf("title: 'Delete Session?'");
const deleteCall = session.indexOf(
  'await store.getState().deleteTransition(transition.id, { confirm: true })',
  deletePrompt
);
assert(
  deletePrompt >= 0 && deleteCall > deletePrompt && session.includes('destructive: true'),
  'activity-session deletion must delete only after a destructive native confirmation'
);

console.log('Validated native confirmation alerts across the app.');
