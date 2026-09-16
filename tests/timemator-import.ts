import type { CatalogRepositoryApi } from '../src/data/catalog-repository';
import type {
  CatalogCollection,
  Folder,
  Activity,
  RoutineDefinition,
  TrackerMonthCollection,
  Transition,
} from '../src/domain';
import { CatalogService } from '../src/catalog/catalog-service';
import { createTrackerService } from '../src/tracker/tracker-service';
import type { TrackerRepositoryApi } from '../src/data/tracker-repository';
import {
  TimematorImportError,
  TimematorImportService,
  inspectTimematorCsv,
  parseTimematorCsv,
} from '../src/backup/timemator-import';
import { isUuid } from '../src/domain/ordering';

const ids = {
  existingActivity: '11111111-1111-4111-8111-111111111111',
};

const base = 1_700_000_000;
const now = (base + 1_000) * 1000;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function csvRow(begin: number, end: number, folder: string, task: string): string {
  return `${begin};${end};2023-11-14;12:00 PM;12:01 PM;${folder ? `"${folder}"` : '""'};"${task}";0:01;0.02`;
}

function csv(...rows: string[]): string {
  return ['unix_begin;unix_end;date;begin;end;folder;task;duration;duration_decimal', ...rows].join(
    '\n'
  );
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

class MemoryTrackerRepository implements TrackerRepositoryApi {
  readonly transitions: Transition[] = [];

  async readMonth(month: string): Promise<TrackerMonthCollection> {
    return {
      month: month as TrackerMonthCollection['month'],
      transitions: this.transitions.filter(
        (transition) => transition.timestamp.slice(0, 7) === month
      ),
      latestTransitions: [],
    };
  }

  async readMonths(start: string, end: string): Promise<Transition[]> {
    return this.transitions.filter((transition) => {
      const month = transition.timestamp.slice(0, 7);
      return month >= start && month <= end;
    });
  }

  async readRange(_startMs: number, endMs: number): Promise<Transition[]> {
    return this.transitions.filter((transition) => Date.parse(transition.timestamp) <= endMs);
  }

  async writeMonth(collection: TrackerMonthCollection): Promise<void> {
    await this.writeCrossMonth([collection], `month-${collection.month}`);
  }

  async upsertTransitions(transitions: readonly Transition[]): Promise<void> {
    this.transitions.push(...transitions);
    this.transitions.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  }

  async writeCrossMonth(
    collections: readonly TrackerMonthCollection[],
    _operationId: string
  ): Promise<void> {
    for (const collection of collections) {
      for (const transition of collection.transitions) {
        const index = this.transitions.findIndex((candidate) => candidate.id === transition.id);
        if (index >= 0) this.transitions[index] = transition;
        else this.transitions.push(transition);
      }
    }
    this.transitions.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  }

  async recoverJournal(): Promise<{ recovered: string[]; failed: never[] }> {
    return { recovered: [], failed: [] };
  }
}

async function run(): Promise<void> {
  const parsed = parseTimematorCsv(
    csv(
      csvRow(base, base + 60, '', ' Existing '),
      csvRow(base + 60, base + 120, 'Projects', 'New Task')
    )
  );
  assert(parsed.length === 2, 'the Timemator parser must read semicolon-delimited rows');
  assert(parsed[0]?.taskName === 'Existing', 'task names must be trimmed');
  assert(parsed[0]?.folderName === null, 'empty folders must become null');
  assert(
    inspectTimematorCsv(csv(csvRow(base, base + 60, '', 'Existing'))).gapCount === 0,
    'preview should count gaps'
  );

  try {
    parseTimematorCsv(csv(csvRow(base + 60, base, '', 'Broken')));
    throw new Error('invalid end timestamps must be rejected');
  } catch (error) {
    assert(error instanceof TimematorImportError, 'invalid CSV must use the import error type');
  }

  const catalogRepository = new MemoryCatalogRepository();
  const catalogService = new CatalogService(catalogRepository, {
    now: () => '2023-11-14T00:00:00.000Z',
  });
  await catalogService.createActivity({ id: ids.existingActivity, name: 'Existing' });
  const trackerRepository = new MemoryTrackerRepository();
  const trackerService = createTrackerService(trackerRepository, {
    now: () => now,
    resolveActivitySnapshot: async (activityId) => {
      const activity = (await catalogService.read()).activities.find(
        (candidate) => candidate.id === activityId
      );
      return activity
        ? {
            id: activity.id,
            kind: 'activity',
            name: activity.name,
            color: activity.color,
            iconName: activity.iconName,
            folderId: activity.folderId,
            folderName: null,
          }
        : null;
    },
  });
  const importer = new TimematorImportService(
    { catalog: catalogService, tracker: trackerService },
    { now: () => now }
  );
  const source = csv(
    csvRow(base, base + 60, '', 'Existing'),
    csvRow(base + 60, base + 120, 'Projects', 'New Task'),
    csvRow(base + 200, base + 260, '', 'New Task')
  );
  const first = await importer.importCsv(source);
  assert(first.summary.matchedActivities === 1, 'existing activities must be matched by name');
  assert(first.summary.createdActivities === 1, 'missing activities must be created');
  assert(
    first.summary.createdFolders === 1,
    'missing source folders must be created for new activities'
  );
  assert(
    first.summary.insertedTransitions === 5,
    'imports must include starts, gap stops, and the final stop'
  );
  assert(
    first.transitions.every((transition) => isUuid(transition.id)),
    'import transition IDs must be UUIDs'
  );
  assert(
    (await catalogService.read()).activities.some((activity) => activity.name === 'New Task'),
    'created activities must be persisted in the catalog'
  );
  const importedQuery = await trackerService.query(
    { startMs: base * 1000, endMs: (base + 300) * 1000 },
    now
  );
  assert(
    importedQuery.intervals.length === 5 &&
      importedQuery.intervals[2]?.activityId === null &&
      importedQuery.intervals[2]?.startMs === (base + 120) * 1000 &&
      importedQuery.intervals[2]?.endMs === (base + 200) * 1000,
    'imported transitions must materialize the idle gap instead of carrying activity through it'
  );

  const repeated = await importer.importCsv(source);
  assert(
    repeated.summary.createdActivities === 0,
    'repeating an import must not create activities again'
  );
  assert(
    repeated.summary.insertedTransitions === 0,
    'repeating an import must not duplicate transitions'
  );
  assert(
    repeated.summary.skippedTransitions === 5,
    'repeating an import must report skipped transitions'
  );

  const beforeConflictCatalog = (await catalogService.read()).activities.length;
  try {
    await importer.importCsv(csv(csvRow(base, base + 10, '', 'Conflict')));
    throw new Error('timestamp conflicts must be rejected');
  } catch (error) {
    assert(
      error instanceof TimematorImportError && error.code === 'conflict',
      'conflicts must be reported'
    );
  }
  assert(
    (await catalogService.read()).activities.length === beforeConflictCatalog,
    'conflicting imports must not create catalog records during preflight'
  );

  console.log(
    'Validated Timemator CSV parsing, activity mapping, gap preservation, and idempotent imports.'
  );
}

run().catch((error: unknown) => {
  throw error;
});
