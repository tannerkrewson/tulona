/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
/* eslint-enable @typescript-eslint/no-require-imports */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = path.resolve(process.cwd());
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const session = read('src/tracker/ActivitySessionScreen.tsx');
const editor = read('src/tracker/HistoricalSessionEditor.tsx');
const chooser = read('src/tracker/ActivitySessionActivityChooserScreen.tsx');
const choices = read('src/tracker/SessionActivityChoices.tsx');
const chooserRoute = read('app/activity-session/activity-chooser.tsx');
const layout = read('app/_layout.tsx');
const trackerService = read('src/tracker/tracker-service.ts');
const trackerStore = read('src/tracker/tracker-store.ts');

const correction = read('src/tracker/ActiveSessionCorrection.tsx');
const nativePicker = read('src/tracker/SessionDateTimePicker.tsx');
assert(
  session.includes('<SlideUpSheet') &&
    session.includes('activity-session-summary') &&
    session.includes('activity-session-duration'),
  'session details must retain a sheet with activity identity and duration'
);
assert(
  session.includes('ActiveSessionCorrection') &&
    correction.includes('activity-session-switch') &&
    correction.includes('activity-session-stop') &&
    correction.includes('activity-session-switch-preview'),
  'running sessions must expose missed switch/stop correction with a preview before saving'
);
assert(
  correction.includes('Save switch') &&
    correction.includes('Save stop') &&
    correction.includes('activity-session-cancel-switch') &&
    session.includes('switchActiveSession'),
  'draft corrections must support explicit save/cancel and use the guarded active-session mutation'
);
assert(
  session.includes('Reassign session') &&
    session.includes('activity-session-reassign-sheet') &&
    chooser.includes('reassignTransition') &&
    chooser.includes('entire'),
  'whole-session reassignment must remain distinct from a missed switch'
);
assert(
  chooser.includes('returnToTracker') &&
    choices.includes('activity-session-choice-none') &&
    chooser.includes('stopAndReplaceActivity') &&
    chooserRoute.includes('routineId') &&
    layout.includes('name="activity-session/activity-chooser"'),
  'existing routine and activity chooser routes must remain intact'
);
assert(
  nativePicker.includes('display="spinner"') &&
    nativePicker.includes('setDraft(nextDate)') &&
    nativePicker.includes('commit(draft)') &&
    nativePicker.includes('activity-session-picker-cancel'),
  'iOS wheels must stage edits until Done and let Cancel discard them'
);
assert(
  editor.includes('FROM') && editor.includes('TO') && !editor.includes('Set start to now'),
  'session boundaries must be clear without a destructive reset shortcut'
);

assert(
  !session.includes('activity-session-close') &&
    !session.includes('Currently tracking') &&
    !session.includes('Session details') &&
    session.includes('activity-session-stop-now'),
  'timer sheet must avoid redundant close controls and headings while preserving immediate stop'
);
assert(
  correction.includes('activity-session-correction-sheet') &&
    correction.includes('activity-session-next-activity-sheet') &&
    correction.includes('SessionActivityChoices') &&
    chooser.includes('SessionActivityChoices') &&
    session.includes('SessionActivityChoices') &&
    choices.includes('<ActivityRow') &&
    choices.includes('<FolderRow') &&
    !correction.includes('TextInput'),
  'correction and selection must use layered sheets and the existing catalog rows, not custom inline menus'
);
assert(
  !nativePicker.includes('<Modal') &&
    nativePicker.includes("mode = 'datetime'") &&
    nativePicker.includes('combinePickerDateAndTime(value, date)') &&
    editor.includes("openPicker(target, 'time')") &&
    editor.includes("openPicker(target, 'datetime')"),
  'separate time and date-time controls must preserve the date and avoid an extra picker modal'
);

assert(
  session.includes('activity-session-delete') &&
    session.includes('<ConfirmationModal') &&
    session.includes('activity-session-delete-confirmation') &&
    session.includes('activity-session-confirm-delete') &&
    session.includes('activity-session-cancel-delete') &&
    session.includes('onPress={openDeleteConfirmation}') &&
    session.includes('setDeleteConfirmationOpen(true)') &&
    session.includes('await store.getState().deleteTransition(transition.id, { confirm: true })') &&
    session.includes('setDeleteConfirmationOpen(false)') &&
    session.includes('visible={deleteConfirmationOpen}') &&
    session.includes("goBackInAppStack(router, '/')"),
  'activity sessions must expose an explicit, confirmed delete action that returns after success'
);
const deleteModalStart = session.indexOf('<ConfirmationModal');
const deleteScreenEnd = session.lastIndexOf('</SlideUpSheet>');
const deleteCall = session.indexOf(
  'await store.getState().deleteTransition(transition.id, { confirm: true })'
);
const deleteClose = session.indexOf('setDeleteConfirmationOpen(false)', deleteCall);
const deleteReturn = session.indexOf("goBackInAppStack(router, '/')", deleteClose);
assert(
  deleteModalStart > deleteScreenEnd &&
    deleteCall >= 0 &&
    deleteClose > deleteCall &&
    deleteReturn > deleteClose,
  'session deletion confirmation must be outside the scrollable screen and return only after deletion succeeds'
);
assert(
  trackerStore.includes('deleteTransition: (id, confirmation) =>') &&
    trackerStore.includes('runMutation(() => service.deleteTransition(id, confirmation))') &&
    trackerStore.includes('await get().refresh();') &&
    trackerService.includes('Deleting a historical transition requires confirmation') &&
    trackerService.includes("this.removeTransition(id, confirmation, 'tracker-transition-delete')"),
  'session deletion must use the journaled tracker mutation and refresh the derived store state'
);

console.log('Validated session correction, reassignment, staged wheels, and confirmed deletion.');
