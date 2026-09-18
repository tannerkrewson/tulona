import {
  combinePickerDateAndTime,
  localDateTimeInputValue,
  parseLocalDateTimeInput,
} from '../src/tracker/session-time';

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

const screen = read('src/tracker/ActivitySessionScreen.tsx');
const editor = read('src/tracker/HistoricalSessionEditor.tsx');
const nativePicker = read('src/tracker/SessionDateTimePicker.tsx');
const webPicker = read('src/tracker/SessionDateTimePicker.web.tsx');
const service = read('src/tracker/tracker-service.ts');
const trackerStore = read('src/tracker/tracker-store.ts');

assert(
  screen.includes('<Screen onBack={() => router.back()} title={activityName}>') &&
    [...screen.matchAll(/\{activityName\}/g)].length === 1 &&
    screen.includes('testID="activity-session-summary"') &&
    !screen.includes('ACTIVE SESSION') &&
    !screen.includes('SESSION'),
  'the session summary must keep only the page title and remove the duplicate activity name'
);
assert(
  screen.includes('testID="activity-session-status"') &&
    screen.includes('testID="activity-session-duration"') &&
    screen.includes('<Spacer flexible />') &&
    screen.includes('formatSessionDate(startMs)') &&
    screen.includes('formatSessionTime(startMs)') &&
    screen.includes('numberOfLines={1}'),
  'session status and prominent duration must share the top row with separated non-wrapping dates/times'
);
assert(
  screen.includes(
    '<Column spacing={14} style={{ width: \'100%\' }} testID="activity-session-summary">'
  ) &&
    screen.includes(
      '<Column spacing={12} style={{ width: \'100%\' }} testID="activity-session-corrections">'
    ) &&
    !screen.includes('backgroundColor: colors.surface'),
  'the summary and corrections must be direct page content rather than card shells'
);
assert(
  editor.includes("<Column spacing={8} style={{ width: '100%' }}") &&
    editor.includes('testID="activity-session-time-control"') &&
    editor.includes('testID="activity-session-time-divider"') &&
    editor.includes('testID="activity-session-from"') &&
    editor.includes('testID="activity-session-to"') &&
    editor.includes('flex: 1') &&
    editor.includes('borderRadius: 16') &&
    editor.includes('accessibilityRole="button"') &&
    editor.includes('numberOfLines={1}') &&
    !editor.includes('AccessibleTextInput') &&
    !editor.includes('Save start') &&
    !editor.includes('Save end'),
  'time editing must be one rounded two-section control with accessible tap targets and no text inputs or save prompts'
);
assert(
  /isActive\s*\?\s*'Now'/.test(editor) &&
    screen.includes('isActive={isActive}') &&
    editor.includes('activity-session-time-context') &&
    editor.includes('Changes are checked against neighboring sessions.'),
  'active sessions must show an open-ended Now value and date context outside the control'
);
assert(
  editor.includes('const canEditEnd = following !== null || isActive;') &&
    editor.includes("'No end recorded'") &&
    editor.includes("'open-ended'") &&
    editor.includes('disabled={busy || !canEditEnd}') &&
    screen.includes('Loading session...') &&
    screen.includes('testID="activity-session-error"') &&
    screen.includes('contextError ??'),
  'inactive sessions without a following transition and loading/error states must remain explicit and safe'
);
assert(
  screen.includes('else if (isActive)') &&
    screen.includes('insertTransition({ activityId: null, timestamp: nextTimestamp })') &&
    trackerStore.includes('editTransition: (id, input) =>') &&
    trackerStore.includes('runMutation(() => service.editTransition(id, input))'),
  'a chosen active end must create a real idle boundary while start/end edits remain journaled store mutations'
);
assert(
  nativePicker.includes("from '@expo/ui/community/datetime-picker'") &&
    nativePicker.includes('mode="datetime"') &&
    nativePicker.includes('mode={androidStage}') &&
    nativePicker.includes('presentation="dialog"') &&
    nativePicker.includes('onValueChange') &&
    nativePicker.includes('onDismiss') &&
    nativePicker.includes('combinePickerDateAndTime(date, value, true)'),
  'native session editing must use the installed Expo community picker, including Android date/time composition'
);
assert(
  webPicker.includes('type="datetime-local"') &&
    webPicker.includes('showPicker') &&
    webPicker.includes('input.click()') &&
    webPicker.includes('parseLocalDateTimeInput') &&
    !webPicker.includes('AccessibleTextInput'),
  'the web build must open a browser-native datetime picker instead of silently rendering Expo UI null'
);
assert(
  service.includes('this.assertEditOrder') &&
    service.includes('Edited transition must remain after the preceding transition') &&
    service.includes('Edited transition must remain before the following transition'),
  'tracker service must remain the final neighboring-transition order validator'
);

const sample = new Date(2026, 8, 17, 19, 3, 0, 0);
const localValue = localDateTimeInputValue(sample.getTime());
const roundTrip = parseLocalDateTimeInput(localValue);
assert(
  roundTrip?.getTime() === sample.getTime(),
  'browser datetime-local conversion must preserve local date and time in the device timezone'
);
assert(
  parseLocalDateTimeInput('2026-02-30T19:03') === null,
  'invalid local calendar dates must not reach the tracker mutation API'
);
const androidDate = new Date(Date.UTC(2026, 8, 17));
const combined = combinePickerDateAndTime(androidDate, sample, true);
assert(
  combined.getFullYear() === 2026 &&
    combined.getMonth() === 8 &&
    combined.getDate() === 17 &&
    combined.getHours() === 19 &&
    combined.getMinutes() === 3,
  'Android UTC calendar-day picker results must be recombined as the correct local date and time'
);

console.log(
  'Validated session hierarchy, direct surfaces, two-section native/web time editing, open-ended Now semantics, local dates, and order validation.'
);
