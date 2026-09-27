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
const chooserRoute = read('app/activity-session/activity-chooser.tsx');
const layout = read('src/diagnostics/NormalAppLayout.tsx');
const trackerService = read('src/tracker/tracker-service.ts');
const trackerStore = read('src/tracker/tracker-store.ts');

const appButtonBlocks = [...session.matchAll(/<AppButton\b[\s\S]*?\/>/g)].map(([block]) => block);

assert(
  session.includes('<SlideUpSheet') &&
    session.includes('testID="activity-session-summary"') &&
    session.includes('testID="activity-session-duration"') &&
    session.includes('activityColor') &&
    !session.includes('<Screen'),
  'activity sessions must open as an activity-colored sheet with a clear title and duration'
);
assert(
  !session.includes('Select a different activity or routine for this session.') &&
    !session.includes('For the active session, reset the start only when it began just now.') &&
    !session.includes('Reset to now is available only for the active session.'),
  'activity session actions must not include redundant subtitle copy'
);
assert(
  appButtonBlocks.length >= 2 && appButtonBlocks.every((block) => !block.includes("width: '100%'")),
  'activity session actions must remain compact within the sheet'
);
assert(
  !session.includes('AccessiblePicker') &&
    !session.includes('Picker.Item') &&
    !session.includes('AccessibleTextInput') &&
    !session.includes('activity-session-adjust-time') &&
    !session.includes('activity-session-start-input'),
  'active activity sessions must not regress to a picker or free-form time editor'
);
assert(
  session.includes('activity-session-choose-activity') &&
    session.includes('/activity-session/activity-chooser') &&
    chooser.includes('ActivityRow') &&
    chooser.includes('FolderRow') &&
    chooser.includes('reassignTransition'),
  'active activity selection must use the dedicated catalog chooser'
);
assert(
  chooser.includes('returnToTracker') &&
    chooser.includes('activity-session-choice-none') &&
    chooser.includes('stopAndReplaceActivity') &&
    chooserRoute.includes('routineId') &&
    chooserRoute.includes('ActivitySessionActivityChooserScreen') &&
    layout.includes('name="activity-session/activity-chooser"'),
  'activity chooser selection and return navigation must be registered and recoverable'
);
assert(
  editor.includes('activity-session-reset-now') &&
    trackerService.includes('snapTransitionStartToPrevious') &&
    trackerService.includes('snapTransitionStartToPrevious') &&
    trackerService.includes('allowPrecedingEqual'),
  'activity sessions must expose bounded, service-validated time corrections'
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

console.log(
  'Validated activity-session title, compact actions, chooser, corrections, and deletion regressions.'
);
