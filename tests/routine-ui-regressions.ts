/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
/* eslint-enable @typescript-eslint/no-require-imports */

const root = path.resolve(process.cwd());
function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const runner = read('src/routine/RoutineRunnerScreen.tsx');
const editor = read('src/routine/RoutineEditorScreen.tsx');
const recovery = read('src/orchestration/RecoveryActions.tsx');
const activeBar = read('src/tracker/ActiveActivityBar.tsx');

assert(
  runner.includes('disabled={busy || isPaused}') &&
    runner.includes('<Row alignment="center" style={styles.controlRow}>'),
  'routine controls remain mounted and disabled while paused'
);
assert(
  runner.includes('testID="routine-time-panel"') &&
    runner.includes('nextRuntime.routineService.addTime(deltaMs)') &&
    runner.includes('nextRuntime.routineService.resetTime()') &&
    !runner.includes("title: 'Adjust Time'"),
  'time adjustments stay open in a bottom panel so repeated presets update the live timer'
);
assert(
  !runner.includes('label="Keep running"') &&
    runner.includes("label: 'Log Whole Run as Something Else'") &&
    runner.includes("label: 'Stop and Choose Next Activity'") &&
    runner.includes("const allowReplace = active.routineSnapshot.trackingMode === 'overall'") &&
    !runner.includes('cancelAndDiscard()'),
  'stop routine offers replace only for overall tracking and keeps logged time when switching'
);
assert(
  runner.includes('routineStyle(active, catalog') &&
    runner.includes('routineStepVisual(') &&
    runner.includes('currentStep,') &&
    runner.includes('name={currentIcon}'),
  'routine runner uses parent or current-step activity styling'
);
assert(
  runner.includes('<Screen') &&
    runner.includes('title={active.routineSnapshot.name}') &&
    runner.includes('scrollable={false}') &&
    runner.includes('onBack={goBack}') &&
    !runner.includes('<SlideUpSheet') &&
    !runner.includes('<Modal') &&
    !runner.includes('absoluteTime(') &&
    runner.includes('testID="routine-current-step-name"') &&
    runner.includes('testID="open-routine-steps"') &&
    runner.includes('testID="routine-elapsed"') &&
    runner.includes('testID="routine-estimated-end"') &&
    runner.includes('icon="square"') &&
    runner.includes('icon="arrow-right"') &&
    runner.includes('const strokeWidth = 8'),
  'the routine runner is a fixed full screen with elapsed and estimated-end stats and a thicker timer ring'
);
const nextPreview = runner.indexOf('testID="routine-next-step"');
assert(
  nextPreview >= 0 &&
    nextPreview < runner.indexOf('<Row alignment="center" style={styles.controlRow}>') &&
    runner.indexOf('<Row alignment="center" style={styles.controlRow}>') <
      runner.indexOf('testID="open-routine-steps"'),
  'the next-step preview sits above the controls, with the step list button below them'
);
assert(
  runner.includes('<FormSheet') &&
    runner.includes('testID="routine-steps-sheet"') &&
    runner.includes('testID="routine-steps-edit"') &&
    runner.includes('<Switch') &&
    runner.includes('testID={`routine-jump-step-${step.id}`}'),
  'the steps list is a native page sheet with an edit mode for toggling and reordering'
);
assert(
  runner.includes('testID="routine-completion"') &&
    runner.includes('label="Start Next Activity"') &&
    runner.includes('testID="routine-completion-done"') &&
    runner.includes('Redo a Step') &&
    runner.includes('styles.flexSpacer'),
  'the completion page summarizes the run and keeps its actions near the bottom'
);
const restoringStart = runner.indexOf('testID="routine-runner-restoring"');
const restoringEnd = runner.indexOf('</Text>', restoringStart);
const restoringStatus = runner.slice(restoringStart, restoringEnd);
assert(
  restoringStart >= 0 &&
    restoringStatus.includes('Restoring routine…') &&
    !restoringStatus.includes('RunnerError') &&
    runner.includes('{loadError ? (') &&
    runner.includes('Math.min(62, circleSize / 5.5)') &&
    runner.includes('fontSize: 22') &&
    runner.includes('maxWidth: circleSize - 88') &&
    runner.includes('numberOfLines={2}'),
  'routine restore must be neutral, and larger two-line step titles must stay inside the timer circle'
);
assert(
  runner.includes('? { stop: 50, addTime: 52, complete: 74, pause: 52, skip: 52 }') &&
    runner.includes(': { stop: 54, addTime: 56, complete: 80, pause: 56, skip: 56 }') &&
    runner.includes('borderWidth: 1') &&
    runner.includes('minHeight: 46') &&
    runner.includes("style={{ height: 56, width: '100%' }}") &&
    runner.includes("style={{ height: 52, width: '100%' }}"),
  'active routine controls and the step selector must have larger, touch-friendly bordered targets'
);
const skipStart = runner.indexOf('const skipStep = () =>');
const skipMenu = runner.slice(skipStart, runner.indexOf('const stopRoutine', skipStart));
assert(
  skipStart >= 0 && skipMenu.indexOf("'Skip Step'") < skipMenu.indexOf("'Do It Last'"),
  'Skip Step must be the first action in the skip menu'
);
const controlRowStart = runner.indexOf('<Row alignment="center" style={styles.controlRow}>');
const controlRowEnd = runner.indexOf('</Row>', controlRowStart);
const controlRow = runner.slice(controlRowStart, controlRowEnd);
assert(
  controlRow.indexOf('icon="square"') < controlRow.indexOf('icon="clock"') &&
    controlRow.indexOf('icon="clock"') < controlRow.indexOf('icon="arrow-right"') &&
    controlRow.indexOf('icon="arrow-right"') < controlRow.indexOf('icon="pause"') &&
    controlRow.indexOf('icon="pause"') < controlRow.indexOf('icon="skip-forward"'),
  'routine controls must remain in stop, clock, next, pause, skip order'
);
assert(
  editor.includes("onSaved={() => router.replace('/')}") &&
    editor.includes('onSaved: () => void') &&
    editor.includes('await service.createRoutine({') &&
    editor.includes('await service.updateRoutine(routine.id') &&
    editor.includes('onSaved();') &&
    !editor.includes('onCreated'),
  'routine create and save must return to the Tracker route'
);
const closeControlStart = recovery.indexOf('<IconButton');
const closeControlEnd = recovery.indexOf('/>', closeControlStart);
const closeControl = recovery.slice(closeControlStart, closeControlEnd);
assert(
  recovery.includes('onClose?: () => void') &&
    recovery.includes('icon="x"') &&
    recovery.includes('testID={`${testID}-close`}') &&
    recovery.includes('onPress={onClose}') &&
    !recovery.includes('onBack?: () => void') &&
    !recovery.includes('Back to tracker') &&
    !recovery.includes('testID={`${testID}-back`}') &&
    closeControl.includes('onPress={onClose}') &&
    !closeControl.includes('disabled='),
  'recovery errors must replace Back to tracker with an always-enabled X close action'
);
assert(
  activeBar.includes('const previousDurationMs = isActive ? 0 : activityDurationMs') &&
    activeBar.includes('durationMs={isActive ? elapsedMs : previousDurationMs}') &&
    activeBar.includes("fill={primaryFilled ? (isActive ? onAccent : accent) : 'none'}") &&
    activeBar.includes('strokeWidth={primaryFilled ? 0 : 2.5}') &&
    activeBar.includes('backgroundColor: isActive ? accent : colors.surfaceMuted'),
  'activity preview preserves its previous duration and play/pause states use solid icons'
);
assert(
  activeBar.includes('routineInFocus') &&
    activeBar.includes('name="repeat"') &&
    activeBar.includes('Paused · ${displayName}') &&
    activeBar.includes('pausedRoutineStepName') &&
    activeBar.includes('routineTimer'),
  'the tracker bar shows routine identity, current step, countdown, and a visible paused state'
);
