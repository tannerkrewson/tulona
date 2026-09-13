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
const chooser = read('src/tracker/ActivitySessionActivityChooserScreen.tsx');
const chooserRoute = read('app/activity-session/activity-chooser.tsx');
const layout = read('app/_layout.tsx');
const trackerService = read('src/tracker/tracker-service.ts');

assert(
  session.includes('title="Activity session"') && !session.includes('title={resolved?.item.name'),
  'activity sessions must keep one generic header and one activity title'
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
  chooser.includes('router.canGoBack()') &&
    chooser.includes('activity-session-choice-none') &&
    chooserRoute.includes('ActivitySessionActivityChooserScreen') &&
    layout.includes('name="activity-session/activity-chooser"'),
  'activity chooser selection and return navigation must be registered and recoverable'
);
assert(
  session.includes('activity-session-snap-previous') &&
    session.includes('activity-session-reset-now') &&
    trackerService.includes('snapTransitionStartToPrevious') &&
    trackerService.includes('allowPrecedingEqual'),
  'activity sessions must expose bounded, service-validated time corrections'
);

console.log('Validated active-session title, chooser, and bounded correction regressions.');
