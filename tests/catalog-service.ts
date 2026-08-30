import type { CatalogRepositoryApi } from '../src/data/catalog-repository';
import {
  CatalogService,
  DEFAULT_CATALOG_COLOR,
  resolveDisplayColor,
} from '../src/catalog/catalog-service';
import { reorderHabits } from '../src/catalog/ordering';
import type {
  Activity,
  CatalogCollection,
  Folder,
  Habit,
  RoutineDefinition,
  RoutineStep,
} from '../src/domain';

const ids = {
  folder: '11111111-1111-4111-8111-111111111111',
  secondFolder: '22222222-2222-4222-8222-222222222222',
  rootActivity: '33333333-3333-4333-8333-333333333333',
  secondRootActivity: '44444444-4444-4444-8444-444444444444',
  childActivity: '55555555-5555-4555-8555-555555555555',
  secondChildActivity: '66666666-6666-4666-8666-666666666666',
  routine: '77777777-7777-4777-8777-777777777777',
  rootRoutine: '88888888-8888-4888-8888-888888888888',
  step: '99999999-9999-4999-8999-999999999999',
  secondStep: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
};

const timestamp = '2026-08-30T00:00:00.000Z';

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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function rejects(action: () => Promise<unknown>, message: string): Promise<void> {
  try {
    await action();
  } catch {
    return;
  }
  throw new Error(message);
}

function step(id: string, activityId: string, sortOrder: number): RoutineStep {
  return {
    id,
    activityId,
    name: id,
    durationMs: 60_000,
    sortOrder,
    color: null,
    iconName: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
  };
}

async function run(): Promise<void> {
  const repository = new MemoryCatalogRepository();
  const service = new CatalogService(repository, { now: () => timestamp });
  const folder = await service.createFolder({
    id: ids.folder,
    name: 'Focus',
    color: '#112233',
    iconName: 'folder',
  });
  await service.createFolder({ id: ids.secondFolder, name: 'Later' });
  await rejects(
    () => service.createFolder({ name: 'Nested', folderId: ids.folder }),
    'nested folders must be rejected'
  );
  await rejects(
    () => service.moveFolder(ids.folder, ids.secondFolder),
    'moving a folder under another folder must be rejected'
  );
  await rejects(
    () => service.createActivity({ name: 'Invalid placement', folderId: ids.rootActivity }),
    'unknown folder references must be rejected'
  );
  await rejects(
    () => service.createActivity({ name: 'Invalid color', color: 'blue' }),
    'invalid colors must be rejected'
  );
  await rejects(
    () => service.createActivity({ name: 'Invalid icon', iconName: 'rocket' }),
    'uncurated icons must be rejected'
  );

  const rootActivity = await service.createActivity({
    id: ids.rootActivity,
    name: 'Root activity',
    color: '#445566',
    iconName: 'activity',
  });
  await service.createActivity({ id: ids.secondRootActivity, name: 'Second root' });
  const childActivity = await service.createActivity({
    id: ids.childActivity,
    name: 'Child activity',
    folderId: folder.id,
    color: '#778899',
  });
  await service.createActivity({
    id: ids.secondChildActivity,
    name: 'Second child',
    folderId: folder.id,
  });
  await service.createRoutine({
    id: ids.routine,
    name: 'Focus routine',
    folderId: folder.id,
    steps: [step(ids.step, rootActivity.id, 10), step(ids.secondStep, childActivity.id, 3)],
  });
  await service.createRoutine({ id: ids.rootRoutine, name: 'Root routine' });

  const childResolution = await service.resolveItem(childActivity.id);
  assert(
    childResolution?.displayColor === folder.color,
    'folder children must inherit folder color'
  );
  assert(
    childResolution?.item.color === '#778899',
    'folder inheritance must retain standalone color'
  );
  assert(
    resolveDisplayColor(rootActivity, [folder]) === '#445566',
    'root items must use standalone color'
  );
  await service.moveActivity(childActivity.id, null);
  assert(
    (await service.resolveItem(childActivity.id))?.displayColor === '#778899',
    'moving an item to root must restore a usable standalone color'
  );
  await service.moveActivity(childActivity.id, folder.id);
  await service.archiveActivity(childActivity.id);
  const archived = await service.resolveItem(childActivity.id);
  assert(
    archived?.isArchived && archived.folder?.id === folder.id,
    'archived items stay addressable'
  );
  await service.restoreActivity(childActivity.id);
  await service.archiveFolder(folder.id);
  const childWithArchivedFolder = await service.resolveItem(childActivity.id);
  assert(
    childWithArchivedFolder?.folder?.archivedAt != null,
    'historical resolution must retain archived folder references'
  );
  await service.restoreFolder(folder.id);

  await service.reorderItem(ids.secondRootActivity, 'up');
  const rootItems = (await service.read()).activities
    .filter((activity) => activity.folderId === null)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  assert(
    rootItems[0]?.id === ids.secondRootActivity && rootItems[0].sortOrder === 0,
    'Move Up must reorder root items'
  );
  await service.reorderItem(ids.routine, 'up');
  const reorderedCatalog = await service.read();
  const folderItems = [...reorderedCatalog.routines, ...reorderedCatalog.activities]
    .filter((item) => item.folderId === folder.id)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  assert(folderItems[0]?.id === ids.routine, 'Move Up must reorder mixed folder children');
  await service.reorderRoutineStep(ids.routine, ids.step, 'down');
  const reorderedSteps = (await service.getRoutine(ids.routine)).steps;
  assert(
    reorderedSteps[0]?.id === ids.secondStep && reorderedSteps[0].sortOrder === 0,
    'routine steps must support integer Move Down ordering'
  );
  repository.catalog = {
    ...repository.catalog,
    folders: repository.catalog.folders.map((item, index) => ({
      ...item,
      sortOrder: index * 4,
    })),
    activities: repository.catalog.activities.map((item) =>
      item.folderId === null ? { ...item, sortOrder: 9 } : item
    ),
  };
  const normalized = await service.normalizeOrders();
  assert(
    normalized.folders.every((item, index) => item.sortOrder === index),
    'folder normalization must remove gaps'
  );
  assert(
    [...normalized.activities, ...normalized.routines]
      .filter((item) => item.folderId === null)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .every((item, index) => item.sortOrder === index),
    'catalog item normalization must remove duplicate orders'
  );
  assert(
    normalized.routines
      .find((item) => item.id === ids.routine)
      ?.steps.every((item, index) => item.sortOrder === index),
    'routine step normalization must remove gaps'
  );

  const snapshot = await service.snapshotRoutine(ids.routine, timestamp);
  assert(
    snapshot.id === ids.routine && snapshot.steps.length === 2,
    'routine snapshots must copy definitions'
  );
  snapshot.steps[0].name = 'changed snapshot';
  assert(
    (await service.getRoutine(ids.routine)).steps[0]?.name !== 'changed snapshot',
    'routine snapshots must not alias catalog step storage'
  );
  const duplicate = await service.duplicateRoutine(ids.routine, {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  });
  assert(
    duplicate.archivedAt === null && duplicate.steps[0]?.id !== snapshot.steps[0]?.id,
    'routine duplicate must be independent'
  );
  await service.archiveRoutine(ids.routine);
  assert((await service.getRoutine(ids.routine)).archivedAt !== null, 'routines must archive');
  await service.restoreRoutine(ids.routine);

  const habits: Habit[] = [
    {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      sortOrder: 8,
      name: 'A',
      schedule: { kind: 'daily' },
      trigger: null,
      description: null,
      color: null,
      iconName: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    },
    {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      sortOrder: 8,
      name: 'B',
      schedule: { kind: 'daily' },
      trigger: null,
      description: null,
      color: null,
      iconName: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    },
  ];
  assert(
    reorderHabits(habits, habits[1].id, 'up')[0]?.sortOrder === 0,
    'habit ordering must be pure and normalized'
  );
  assert(DEFAULT_CATALOG_COLOR === '#176B87', 'catalog must provide a usable display fallback');
}

run().catch((error: unknown) => {
  throw error;
});
