import type { CatalogCollection, RoutineSnapshot, TimeTransition } from '@domain';

import { pauseRoutine, startRoutine } from '../src/routine/routine-engine';
import {
  activeActivityWidgetProps,
  routineSurfaceProps,
} from '../src/widgets/active-activity-widget-shared';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const folderId = '11111111-1111-4111-8111-111111111111';
const activityId = '22222222-2222-4222-8222-222222222222';
const timestamp = '2026-09-18T12:00:00.000Z';

const catalog: CatalogCollection = {
  folders: [
    {
      id: folderId,
      name: 'Focus',
      sortOrder: 0,
      color: '#B349E9',
      iconName: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    },
  ],
  activities: [
    {
      id: activityId,
      kind: 'activity',
      name: 'Deep work',
      folderId,
      sortOrder: 0,
      color: null,
      iconName: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    },
  ],
  routines: [],
};

const transition: TimeTransition = {
  id: '33333333-3333-4333-8333-333333333333',
  activityId,
  timestamp,
  source: 'manual',
  status: 'recorded',
  createdAt: timestamp,
  correctionOfId: null,
  note: null,
};

const active = activeActivityWidgetProps({
  catalog,
  transition,
  baseColor: '#111111',
  idleColor: '#E7E7E7',
});

assert(active.mode === 'activity', 'active transition should render as active');
assert(active.name === 'Deep work', 'active activity name should be displayed');
assert(active.startedAtMs === Date.parse(timestamp), 'widget should preserve the start timestamp');
assert(active.color === '#B349E9', 'folder color should be used for the activity');
assert(
  active.url === `tulona://activity-session/${transition.id}`,
  'activity widget should open the session'
);
assert(!('routine' in active), 'plain activities should not render the routine design');

const idle = activeActivityWidgetProps({
  catalog,
  transition: null,
  baseColor: '#111111',
  idleColor: '#E7E7E7',
});

assert(idle.mode === 'idle', 'missing transition should render as idle');
assert(idle.name === 'Nothing tracked', 'idle widget should have an explicit label');
assert(idle.startedAtMs === 0, 'idle widget should not expose a timer date');
assert(idle.color === '#E7E7E7', 'idle widget should use the idle color');
assert(
  ![active, idle].some((props) => JSON.stringify(props).includes('null')),
  'widget props must be plist-safe (UserDefaults rejects null)'
);

const routineId = '44444444-4444-4444-8444-444444444444';
const snapshot: RoutineSnapshot = {
  id: routineId,
  name: 'Morning',
  trackingMode: 'overall',
  color: '#F97316',
  iconName: null,
  capturedAt: timestamp,
  steps: [
    {
      id: '55555555-5555-4555-8555-555555555555',
      activityId: null,
      name: 'Stretch',
      durationMs: 300_000,
      sortOrder: 0,
      color: null,
      iconName: null,
    },
    {
      id: '66666666-6666-4666-8666-666666666666',
      activityId: null,
      name: 'Journal',
      durationMs: 600_000,
      sortOrder: 1,
      color: null,
      iconName: null,
    },
  ],
};
const startedMs = Date.parse(timestamp);
const running = startRoutine(snapshot, startedMs, { id: '77777777-7777-4777-8777-777777777777' });
const routineTransition: TimeTransition = { ...transition, activityId: routineId };
const routineWidget = activeActivityWidgetProps({
  catalog,
  transition: routineTransition,
  activeRoutine: running,
  baseColor: '#111111',
  idleColor: '#E7E7E7',
  nowMs: startedMs + 60_000,
});

assert(routineWidget.mode === 'routine', 'a focused routine should use the routine design');
assert(routineWidget.url === `tulona://routine/${routineId}`, 'routine widget should open it');
assert(routineWidget.color === '#F97316', 'routine widget should use the routine color');
assert(routineWidget.routine?.stepName === 'Stretch', 'routine widget should name the step');
assert(routineWidget.routine?.stepLabel === 'Step 1 of 2', 'routine widget should count steps');
assert(routineWidget.routine?.nextStepName === 'Journal', 'routine widget should show up next');
assert(
  routineWidget.routine?.stepEndsAtMs === startedMs + 300_000,
  'routine countdown should end at the step deadline'
);

const interrupted = routineSurfaceProps({
  catalog,
  transition,
  activeRoutine: pauseRoutine(running, startedMs + 60_000),
  baseColor: '#111111',
  nowMs: startedMs + 120_000,
});
assert(interrupted === null, 'an interrupting activity should hide the routine surfaces');

const paused = routineSurfaceProps({
  catalog,
  transition: null,
  activeRoutine: pauseRoutine(running, startedMs + 60_000),
  baseColor: '#111111',
  nowMs: startedMs + 120_000,
});
assert(paused?.paused === true, 'a paused routine with nothing else tracked stays visible');
assert(paused?.remainingLabel === '4:00', 'paused routines should show the frozen remaining time');

console.log('Active activity widget mapping checks passed.');
