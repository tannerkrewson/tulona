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
  activeBar.includes('const previousDurationMs = isActive ? 0 : activityDurationMs') &&
    activeBar.includes('durationMs={isActive ? elapsedMs : previousDurationMs}') &&
    activeBar.includes("fill={isActive ? 'none' : accent}") &&
    activeBar.includes('backgroundColor: isActive ? accent : colors.surfaceMuted'),
  'inactive activity preview shows its previous duration and solid colored play icon'
);
