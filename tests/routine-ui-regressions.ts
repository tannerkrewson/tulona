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
  runner.includes('onAdd={(addedTimeMs) =>') &&
    runner.includes('routineService.addTime(addedTimeMs))'),
  'preset time changes do not close the add-time modal'
);
assert(
  !runner.includes('label="Keep running"') &&
    runner.includes('label="Stop and replace"') &&
    runner.includes('label="Stop and switch"') &&
    runner.includes("allowReplace={active.routineSnapshot.trackingMode === 'overall'}") &&
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
    !runner.includes('<SlideUpSheet') &&
    runner.includes('testID="routine-current-step-name"') &&
    runner.includes('testID="open-routine-steps"') &&
    runner.includes('icon="square"') &&
    runner.includes('icon="arrow-right"') &&
    runner.includes('label="Back"') &&
    runner.includes('animationType="fade"') &&
    !runner.includes('styles.modalHandleArea') &&
    runner.includes('paddingBottom: Math.max(insets.bottom, 18) + 16') &&
    runner.includes('height: 44') &&
    runner.includes('const strokeWidth = 8'),
  'the routine runner is full screen with a stop-menu back action, right-arrow control, subtle menus, and a thicker timer ring'
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
    activeBar.includes('fill={isActive ? onAccent : accent}') &&
    activeBar.includes('strokeWidth={0}') &&
    activeBar.includes('backgroundColor: isActive ? accent : colors.surfaceMuted'),
  'activity preview preserves its previous duration and both playback states use solid icons'
);
assert(
  activeBar.includes('routineInFocus') &&
    activeBar.includes('name="repeat"') &&
    activeBar.includes('Paused · ${displayName}') &&
    activeBar.includes('pausedRoutineStepName') &&
    activeBar.includes('routineTimer'),
  'the tracker bar shows routine identity, current step, countdown, and a visible paused state'
);
