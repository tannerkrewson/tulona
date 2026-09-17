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

const modal = read('src/ui/ConfirmationModal.tsx');
assert(
  modal.includes('<Modal') &&
    modal.includes('onRequestClose={dismiss}') &&
    modal.includes('accessibilityViewIsModal') &&
    modal.includes('importantForAccessibility="yes"') &&
    modal.includes('<KeyboardAvoidingView') &&
    modal.includes('setAccessibilityFocus') &&
    modal.includes('disabled={busy}'),
  'the shared confirmation modal must provide native modal, accessibility, focus, keyboard, and busy-state behavior'
);

const migratedPrompts = [
  {
    file: 'src/tracker/ActivitySessionScreen.tsx',
    modalTestID: 'activity-session-delete-confirmation',
    confirmTestID: 'activity-session-confirm-delete',
    cancelTestID: 'activity-session-cancel-delete',
    oldPattern: '{deleteConfirmationOpen ? (',
  },
  {
    file: 'src/catalog/CatalogEditorScreen.tsx',
    modalTestID: 'archive-activity-confirmation',
    confirmTestID: 'confirm-archive-activity',
    cancelTestID: 'cancel-archive-activity',
    oldPattern: '<ArchiveConfirmation',
  },
  {
    file: 'src/habits/HabitDetailScreen.tsx',
    modalTestID: 'archive-habit-confirmation',
    confirmTestID: 'confirm-archive-habit',
    cancelTestID: 'cancel-archive-habit',
    oldPattern: '<ArchiveHabitConfirmation',
  },
  {
    file: 'src/habits/HabitListScreen.tsx',
    modalTestID: 'habit-past-midnight-warning',
    confirmTestID: 'habit-past-midnight-keep',
    cancelTestID: 'habit-past-midnight-dismiss',
    oldPattern: '{pastMidnightWarningVisible ? (',
  },
  {
    file: 'src/routine/RoutineEditorScreen.tsx',
    modalTestID: 'delete-step-confirmation',
    confirmTestID: 'confirm-delete-step',
    cancelTestID: 'cancel-delete-step',
    oldPattern: '<DeleteStepConfirmation',
  },
  {
    file: 'src/goals/GoalsScreen.tsx',
    modalTestID: 'goal-delete-confirmation',
    confirmTestID: 'goal-confirm-delete',
    cancelTestID: 'goal-cancel-delete',
    oldPattern: '{confirmDelete ? (',
  },
  {
    file: 'src/settings/GoalsSettingsPanel.tsx',
    modalTestID: 'goal-status-delete-confirmation-',
    confirmTestID: 'goal-status-confirm-delete-',
    cancelTestID: 'goal-status-cancel-delete-',
    oldPattern: '{confirmingDelete ? (',
  },
  {
    file: 'src/backup/BackupScreen.tsx',
    modalTestID: 'backup-replace-confirmation',
    confirmTestID: 'confirm-replace',
    cancelTestID: 'cancel-replace',
    oldPattern: 'confirming ? (',
  },
  {
    file: 'src/settings/SettingsFeedback.tsx',
    modalTestID: 'clear-local-data-confirmation',
    confirmTestID: 'confirm-clear-local-data',
    cancelTestID: 'cancel-clear-local-data',
    oldPattern: '{confirming ? (',
  },
  {
    file: 'src/orchestration/BootCoordinatorGate.tsx',
    modalTestID: 'boot-clear-local-data-confirmation',
    confirmTestID: 'boot-confirm-clear-local-data',
    cancelTestID: 'boot-cancel-clear-local-data',
    oldPattern: '{clearConfirming ? (',
  },
] as const;

for (const prompt of migratedPrompts) {
  const source = read(prompt.file);
  assert(
    source.includes('<ConfirmationModal') &&
      source.includes(prompt.modalTestID) &&
      source.includes(prompt.confirmTestID) &&
      source.includes(prompt.cancelTestID) &&
      !source.includes(prompt.oldPattern),
    `${prompt.file} must use the shared modal contract instead of its inline prompt`
  );
}

const catalog = read('src/catalog/CatalogEditorScreen.tsx');
assert(
  catalog.includes('archive-folder-confirmation') &&
    catalog.includes('confirm-archive-folder') &&
    catalog.includes('cancel-archive-folder') &&
    !catalog.includes('function ArchiveConfirmation'),
  'activity and folder archive confirmations must both use modal controls'
);

const backup = read('src/backup/BackupScreen.tsx');
assert(
  backup.includes('timemator-import-confirmation') &&
    backup.includes('confirm-timemator-import') &&
    backup.includes('cancel-timemator-import') &&
    backup.includes('visible={timematorConfirming') &&
    backup.includes('visible={confirming'),
  'backup replacement and Timemator import must retain separate modal confirmation paths'
);

const session = read('src/tracker/ActivitySessionScreen.tsx');
const sessionModalStart = session.indexOf('<ConfirmationModal');
assert(
  sessionModalStart > session.lastIndexOf('</Screen>') &&
    session.includes('onConfirm={confirmDeleteSession}') &&
    session.includes('tone="danger"'),
  'activity-session deletion must render its destructive confirmation as a sibling modal after the screen'
);

console.log('Validated all migrated inline prompts and the activity-session modal deletion path.');
