import type { CatalogRepositoryApi } from '../src/data/catalog-repository';
import { CatalogService } from '../src/catalog/catalog-service';
import type { Activity, CatalogCollection, Folder, RoutineDefinition } from '../src/domain';

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
/* eslint-enable @typescript-eslint/no-require-imports */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class MemoryCatalogRepository implements CatalogRepositoryApi {
  catalog: CatalogCollection = { folders: [], activities: [], routines: [] };

  async read(): Promise<CatalogCollection> {
    return this.catalog;
  }

  async readFolders(): Promise<Folder[]> {
    return this.catalog.folders;
  }

  async readActivities(): Promise<Activity[]> {
    return this.catalog.activities;
  }

  async readRoutines(): Promise<RoutineDefinition[]> {
    return this.catalog.routines;
  }

  async write(catalog: CatalogCollection): Promise<void> {
    this.catalog = catalog;
  }

  async writeFolders(folders: readonly Folder[]): Promise<void> {
    this.catalog = { ...this.catalog, folders: [...folders] };
  }

  async writeActivities(activities: readonly Activity[]): Promise<void> {
    this.catalog = { ...this.catalog, activities: [...activities] };
  }

  async writeRoutines(routines: readonly RoutineDefinition[]): Promise<void> {
    this.catalog = { ...this.catalog, routines: [...routines] };
  }
}

const root = path.resolve(process.cwd());
const editor = fs.readFileSync(path.join(root, 'src/catalog/CatalogEditorScreen.tsx'), 'utf8');

assert(
  editor.includes('DurationPicker') &&
    editor.includes('AccessiblePicker') &&
    editor.includes('testID="activity-time-goal"'),
  'activity editor must use the shared duration and accessible picker controls for time goals'
);
assert(
  editor.includes('label="None"') &&
    editor.includes('label="Target"') &&
    editor.includes('label="Limit"') &&
    editor.includes('value="day"') &&
    editor.includes('value="week"') &&
    editor.includes('value="month"'),
  'activity editor must expose None, Target, Limit, and all supported goal cadences'
);
assert(
  editor.includes('activity-time-goal-type') &&
    editor.includes('activity-time-goal-duration') &&
    editor.includes('activity-time-goal-period') &&
    editor.includes('type !== TIME_GOAL_NONE'),
  'goal details must have focused controls and remain hidden when None is selected'
);
assert(
  editor.includes('Time goal duration must be greater than zero.') &&
    editor.includes('timeGoal = buildTimeGoal') &&
    editor.includes('timeGoal,') &&
    editor.includes('activity?.timeGoal?.type') &&
    editor.includes('activity?.timeGoal?.period'),
  'activity editor must validate duration and hydrate/save the nullable goal contract'
);

async function run(): Promise<void> {
  const timestamp = '2026-09-14T12:00:00.000Z';
  const activityId = '11111111-1111-4111-8111-111111111111';
  const repository = new MemoryCatalogRepository();
  const service = new CatalogService(repository, { now: () => timestamp });

  const withoutGoal = await service.createActivity({
    id: '22222222-2222-4222-8222-222222222222',
    name: 'No goal',
  });
  assert(withoutGoal.timeGoal === null, 'activities without a goal must remain nullable');

  await service.createActivity({
    id: activityId,
    name: 'Focus',
    timeGoal: { type: 'target', durationMs: 30 * 60 * 1000, period: 'day' },
  });
  assert(
    (await service.getActivity(activityId)).timeGoal?.type === 'target' &&
      (await service.getActivity(activityId)).timeGoal?.durationMs === 30 * 60 * 1000 &&
      (await service.getActivity(activityId)).timeGoal?.period === 'day',
    'CatalogService must persist a target goal with its duration and daily cadence'
  );

  await service.updateActivity(activityId, {
    timeGoal: { type: 'limit', durationMs: 35 * 60 * 60 * 1000, period: 'week' },
  });
  const reloadedService = new CatalogService(repository, { now: () => timestamp });
  const weeklyLimit = await reloadedService.getActivity(activityId);
  assert(
    weeklyLimit.timeGoal?.type === 'limit' &&
      weeklyLimit.timeGoal.durationMs === 35 * 60 * 60 * 1000 &&
      weeklyLimit.timeGoal.period === 'week',
    'goal type, duration, and cadence must survive a CatalogService reload'
  );

  await reloadedService.updateActivity(activityId, {
    timeGoal: { type: 'target', durationMs: 2 * 60 * 60 * 1000, period: 'month' },
  });
  assert(
    (await reloadedService.getActivity(activityId)).timeGoal?.period === 'month',
    'the monthly cadence must be persisted when a goal is edited'
  );

  await reloadedService.updateActivity(activityId, { timeGoal: null });
  assert(
    (await reloadedService.getActivity(activityId)).timeGoal === null,
    'selecting None must remove an existing goal'
  );
  assert(
    (await reloadedService.getActivity(withoutGoal.id)).timeGoal === null,
    'removing one goal must not add or alter goals on other activities'
  );
}

run().then(
  () => console.log('Validated activity time-goal editor controls and persistence.'),
  (error: unknown) => {
    throw error;
  }
);
