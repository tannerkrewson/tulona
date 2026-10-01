/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
/* eslint-enable @typescript-eslint/no-require-imports */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = path.resolve(process.cwd());
const activeBar = fs.readFileSync(path.join(root, 'src/tracker/ActiveActivityBar.tsx'), 'utf8');
const activityRow = fs.readFileSync(path.join(root, 'src/tracker/ActivityRow.tsx'), 'utf8');
const catalogHeader = fs.readFileSync(path.join(root, 'src/tracker/CatalogHeader.tsx'), 'utf8');
const folderEditor = fs.readFileSync(
  path.join(root, 'src/catalog/CatalogEditorScreen.tsx'),
  'utf8'
);

assert(
  activeBar.includes("return pathname === '/' || /^\\/folder\\/[^/]+$/.test(pathname);") &&
    activeBar.includes('setRuntime(nextRuntime);') &&
    activeBar.includes('nextRuntime.trackerStore.getState().hydrate()'),
  'the floating tracker control must remain scoped to catalog routes and hydrate catalog state'
);
assert(
  activeBar.includes('lastActivityTransition') &&
    activeBar.includes('state.lastActivityTransition') &&
    activeBar.includes(
      'const displayedTransition = isActive ? activeTransition : lastActivityTransition;'
    ) &&
    activeBar.includes(
      'if (!displayedTransition || displayedTransition.activityId === null) return null;'
    ),
  'the tracker bar must recover a durable last activity and stay empty when none exists'
);
assert(
  activeBar.includes('const updateNow = () => setNowMs(Date.now());') &&
    activeBar.includes('updateNow();') &&
    activeBar.includes('setInterval(updateNow, 1000)') &&
    activeBar.includes('return () => clearInterval(timer);') &&
    activeBar.includes('[activeTransitionId, activeTransitionTimestamp, isActive]'),
  'the live timer must tick immediately, use stable timestamp dependencies, and clean up'
);
assert(
  activeBar.includes("routineInFocus && activeRoutine.status === 'paused'") &&
    activeBar.includes("? 'pause'") &&
    activeBar.includes("? 'play'") &&
    activeBar.includes("? 'arrow-right-left'") &&
    activeBar.includes("'active-activity-switch'") &&
    activeBar.includes('/activity-session/${displayedTransition.id}?action=switch') &&
    activeBar.includes('testID={primaryTestID}') &&
    activeBar.includes('Starts a new tracking session for this activity'),
  'the tracker bar must switch a running activity, pause a running routine, and play when idle'
);
assert(
  activityRow.includes('fontSize: TRACKER_ROW_FONT_SIZE') &&
    activityRow.includes('size={solidIcon ? TRACKER_PLAYBACK_ICON_SIZE : 20}') &&
    !activityRow.includes("'pause'") &&
    activeBar.includes("fill={primaryFilled ? (isActive ? onAccent : accent) : 'none'}") &&
    activeBar.includes('fontSize: inline ? 16 : TRACKER_ROW_FONT_SIZE') &&
    folderEditor.includes('<FormIconRow') &&
    folderEditor.includes('filled'),
  'tracker labels and playback controls must use the requested sizing and solid icon treatment'
);
assert(
  activityRow.includes('getRowSurfaceBackground') &&
    activityRow.includes('inactiveBackground') &&
    activityRow.includes('backgroundColor: active ? accent : inactiveBackground'),
  'tracker rows must expose the shared neutral surface used by habit and goal rows'
);
assert(
  catalogHeader.includes("icon={editMode ? 'check' : 'pencil'}") &&
    catalogHeader.includes("label={editMode ? 'Done' : 'Edit'}") &&
    catalogHeader.includes('testID="catalog-edit"'),
  'tracker edit controls must retain the shared pencil/check behavior used by goal editing'
);
assert(
  activeBar.includes("activeRoutine?.status === 'paused'") &&
    activeBar.includes('runtime.routineService.resume()') &&
    activeBar.includes('router.push(`/routine/${resumed.routineId}` as Href)') &&
    activeBar.includes('pausedRoutineStepName'),
  'idle play must preserve paused routine resume semantics'
);
assert(
  activeBar.includes("resolved?.item.kind === 'routine'") &&
    activeBar.includes('runtime.routineService.startRoutine(resolved.item.id)') &&
    activeBar.includes('router.push(`/routine/${started.routineId}` as Href)'),
  'idle play must start an inactive routine from its full runner view'
);
assert(
  activeBar.includes("activeRoutine?.status === 'running'") &&
    activeBar.includes('runtime.routineService.pause()') &&
    activeBar.includes('runtime.routineService.switchToActivity(null)'),
  'active pause must persist routine pause state before entering tracker idle state'
);

console.log('Validated tracker active timer and idle resume regression guards.');
