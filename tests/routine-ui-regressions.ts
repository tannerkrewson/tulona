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
    runner.includes('label="Stop and discard"') &&
    runner.includes('cancelAndDiscard()'),
  'stop routine offers discard and removes the keep-running action'
);
assert(
  runner.includes('routineStyle(active, catalog') &&
    runner.includes('routineStepVisual(') &&
    runner.includes('currentStep,') &&
    runner.includes('name={currentIcon}'),
  'routine runner uses parent or current-step activity styling'
);
assert(
  editor.includes("onSaved={() => router.replace('/(tabs)')}") &&
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
    activeBar.includes("fill={isActive ? 'none' : accent}") &&
    activeBar.includes('backgroundColor: isActive ? accent : colors.surfaceMuted'),
  'inactive activity preview shows its previous duration and solid colored play icon'
);
