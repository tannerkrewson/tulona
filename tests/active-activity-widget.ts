import type { CatalogCollection, TimeTransition } from '@domain';

import { activeActivityWidgetProps } from '../src/widgets/active-activity-widget-shared';

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

assert(active.active === true, 'active transition should render as active');
assert(active.name === 'Deep work', 'active activity name should be displayed');
assert(active.startedAtMs === Date.parse(timestamp), 'widget should preserve the start timestamp');
assert(active.color === '#B349E9', 'folder color should be used for the activity');

const idle = activeActivityWidgetProps({
  catalog,
  transition: null,
  baseColor: '#111111',
  idleColor: '#E7E7E7',
});

assert(idle.active === false, 'missing transition should render as idle');
assert(idle.name === 'No active activity', 'idle widget should have an explicit label');
assert(idle.startedAtMs === 0, 'idle widget should not expose a timer date');
assert(idle.color === '#E7E7E7', 'idle widget should use the idle color');

console.log('Active activity widget mapping checks passed.');
