import { CatalogService } from '../src/catalog/catalog-service';
import {
  alphabetizedCatalogIds,
  reorderCatalogItems,
  reorderVisibleIds,
} from '../src/catalog/ordering';
import type { CatalogRepositoryApi } from '../src/data/catalog-repository';
import type { CatalogCollection } from '../src/domain';

// Match the app's test runtime without adding Node types to its native TypeScript config.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { strict: assert } = require('node:assert');

async function run() {
  assert.deepEqual(
    reorderVisibleIds(['a', 'hidden', 'b', 'c'], ['c', 'a', 'b']),
    ['c', 'hidden', 'a', 'b'],
    'filtered drag lists keep hidden slots in place'
  );
  assert.throws(() => reorderVisibleIds(['a', 'b'], ['a', 'a']), /Invalid visible order/);

  let stored: CatalogCollection = { folders: [], activities: [], routines: [] };
  let writes = 0;
  let failWrite = false;
  const repository: CatalogRepositoryApi = {
    read: async () => stored,
    readFolders: async () => stored.folders,
    readActivities: async () => stored.activities,
    readRoutines: async () => stored.routines,
    write: async (next) => {
      if (failWrite) throw new Error('Storage unavailable');
      writes += 1;
      stored = next;
    },
    writeFolders: async (folders) => {
      stored = { ...stored, folders: [...folders] };
    },
    writeActivities: async (activities) => {
      stored = { ...stored, activities: [...activities] };
    },
    writeRoutines: async (routines) => {
      stored = { ...stored, routines: [...routines] };
    },
  };
  const service = new CatalogService(repository);
  const folder = await service.createFolder({ name: 'Zeta' });
  const beta = await service.createActivity({ name: 'beta' });
  const hidden = await service.createActivity({ name: 'Hidden' });
  await service.archiveActivity(hidden.id);
  const alpha = await service.createActivity({ name: 'Alpha' });
  const task10 = await service.createRoutine({ name: 'Task 10', trackingMode: 'overall' });
  const task2 = await service.createRoutine({ name: 'task 2', trackingMode: 'overall' });
  const childZ = await service.createActivity({ name: 'Z child', folderId: folder.id });
  const childA = await service.createRoutine({
    name: 'A child',
    folderId: folder.id,
    trackingMode: 'overall',
  });

  const original = structuredClone(stored);
  const originalWrites = writes;
  const visibleIds = [folder.id, beta.id, alpha.id, task10.id, task2.id];
  const sortedIds = alphabetizedCatalogIds(stored, visibleIds);
  assert.deepEqual(sortedIds, [alpha.id, beta.id, task2.id, task10.id, folder.id]);
  const preview = reorderCatalogItems(stored, sortedIds);
  assert.deepEqual(stored, original, 'preview must leave persisted catalog untouched');
  assert.equal(writes, originalWrites, 'alphabetizing and previewing must not write');
  assert.equal(
    preview.activities.find((item) => item.id === hidden.id)?.sortOrder,
    original.activities.find((item) => item.id === hidden.id)?.sortOrder,
    'hidden archived items retain their slot'
  );
  assert.deepEqual(
    preview.routines.find((item) => item.id === childA.id),
    original.routines.find((item) => item.id === childA.id),
    'root sorting leaves folder children untouched'
  );

  // Edits between preview and Save must survive the order-only write.
  await service.updateActivity(beta.id, { name: 'Beta renamed', color: '#123456' });
  const beforeSave = writes;
  await service.saveItemOrder(sortedIds);
  assert.equal(writes, beforeSave + 1, 'Save persists the entire new order in one write');
  assert.equal(stored.activities.find((item) => item.id === beta.id)?.name, 'Beta renamed');
  assert.equal(stored.activities.find((item) => item.id === beta.id)?.color, '#123456');
  assert.deepEqual(
    [
      ...stored.folders,
      ...stored.activities.filter((item) => item.folderId === null),
      ...stored.routines.filter((item) => item.folderId === null),
    ]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((item) => item.id),
    [alpha.id, beta.id, hidden.id, task2.id, task10.id, folder.id]
  );

  const rootAfterSave = structuredClone(stored.folders);
  await service.saveItemOrder(alphabetizedCatalogIds(stored, [childZ.id, childA.id]));
  assert.deepEqual(stored.folders, rootAfterSave, 'folder sorting leaves root placement alone');
  assert.equal(stored.routines.find((item) => item.id === childA.id)?.sortOrder, 0);
  assert.equal(stored.activities.find((item) => item.id === childZ.id)?.sortOrder, 1);
  assert.equal(stored.routines.find((item) => item.id === childA.id)?.folderId, folder.id);

  const current = structuredClone(stored);
  failWrite = true;
  await assert.rejects(service.saveItemOrder([...sortedIds].reverse()), /Storage unavailable/);
  assert.deepEqual(stored, current, 'failed Save must leave persisted order untouched');
  assert.throws(() => reorderCatalogItems(stored, [alpha.id, alpha.id]), /Invalid catalog order/);
  assert.throws(() => reorderCatalogItems(stored, ['missing']), /Invalid catalog order/);

  const equalNames = {
    ...stored,
    activities: stored.activities.map((item) =>
      item.id === alpha.id || item.id === beta.id ? { ...item, name: 'Same' } : item
    ),
  };
  assert.deepEqual(
    alphabetizedCatalogIds(equalNames, [beta.id, alpha.id]),
    [beta.id, alpha.id],
    'equal names retain the existing visible order'
  );
  console.log(
    'Validated alphabetical previews, sibling placement, atomic Save, and fresh metadata.'
  );
}

void run();
