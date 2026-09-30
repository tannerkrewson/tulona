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
  screen.includes('<SlideUpSheet') &&
    screen.includes('activity-session-summary') &&
    screen.includes('activity-session-duration'),
  'historical sessions must retain identity and elapsed duration in the session sheet'
);
assert(
  editor.includes('activity-session-from') &&
    editor.includes('activity-session-to') &&
    editor.includes('canEditEnd = following !== null') &&
    editor.includes('Still running') &&
    editor.includes('No end recorded'),
  'recorded boundaries must remain editable while active sessions have no end until a stop is saved'
);
assert(
  editor.includes('Changing the start also changes when') &&
    editor.includes('Changing the end also changes when'),
  'shared boundary edits must explain their effect on adjacent sessions'
);
assert(
  editor.includes('timestampMs(previous.timestamp) + 1') &&
    editor.includes('endMs - 1') &&
    service.includes('this.assertEditOrder'),
  'time pickers and service must retain strict neighboring-transition bounds'
);
assert(
  nativePicker.includes('mode={mode}') &&
    nativePicker.includes('display="spinner"') &&
    nativePicker.includes('setDraft(nextDate)') &&
    nativePicker.includes('commit(draft)') &&
    nativePicker.includes('combinePickerDateAndTime(date, value, true)'),
  'native picker must provide staged iOS wheels and Android local date/time composition'
);
assert(
  webPicker.includes("type={mode === 'time' ? 'time' : 'datetime-local'}") &&
    webPicker.includes('initialDate.getTime()') &&
    webPicker.includes('activity-session-picker-done') &&
    webPicker.includes('activity-session-picker-cancel') &&
    !webPicker.includes('aria-hidden="true"'),
  'web time and date/time fields must preserve the selected day and save only after Done'
);
assert(
  trackerStore.includes('runMutation(() => service.editTransition(id, input))') &&
    service.includes('Edited transition must remain after the preceding transition') &&
    service.includes('Edited transition must remain before the following transition'),
  'historical edits must continue through validated, durable tracker mutations'
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
  'Validated historical boundaries, staged native/web pickers, local date conversions, and ordering.'
);
