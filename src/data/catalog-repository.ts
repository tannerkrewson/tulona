import {
  activitySchema,
  catalogCollectionSchema,
  folderSchema,
  routineDefinitionSchema,
} from '@domain';
import type { Activity, CatalogCollection, Folder, RoutineDefinition } from '@domain';

import type { KeyValueDatabase } from './database';
import { DatasetStore } from './dataset-store';
import { PersistenceError } from './errors';
import type { DatasetNamespace } from './namespaces';

export interface CatalogRepositoryApi {
  read(): Promise<CatalogCollection>;
  readFolders(): Promise<Folder[]>;
  readActivities(): Promise<Activity[]>;
  readRoutines(): Promise<RoutineDefinition[]>;
  write(catalog: CatalogCollection): Promise<void>;
  writeFolders(folders: readonly Folder[]): Promise<void>;
  writeActivities(activities: readonly Activity[]): Promise<void>;
  writeRoutines(routines: readonly RoutineDefinition[]): Promise<void>;
}

export class CatalogRepository implements CatalogRepositoryApi {
  private readonly store: DatasetStore;

  constructor(
    database: KeyValueDatabase,
    private readonly namespace: DatasetNamespace
  ) {
    this.store = new DatasetStore(database);
  }

  async read(): Promise<CatalogCollection> {
    return (
      (await this.store.read(this.namespace, 'catalog', catalogCollectionSchema)) ?? {
        folders: [],
        activities: [],
        routines: [],
      }
    );
  }

  async readFolders(): Promise<Folder[]> {
    return (await this.read()).folders;
  }

  async readActivities(): Promise<Activity[]> {
    return (await this.read()).activities;
  }

  async readRoutines(): Promise<RoutineDefinition[]> {
    return (await this.read()).routines;
  }

  async write(catalog: CatalogCollection): Promise<void> {
    await this.store.write(this.namespace, 'catalog', catalogCollectionSchema, catalog);
  }

  async writeFolders(folders: readonly Folder[]): Promise<void> {
    const catalog = await this.read();
    await this.write({ ...catalog, folders: [...folders] });
  }

  async writeActivities(activities: readonly Activity[]): Promise<void> {
    const catalog = await this.read();
    await this.write({ ...catalog, activities: [...activities] });
  }

  async writeRoutines(routines: readonly RoutineDefinition[]): Promise<void> {
    const catalog = await this.read();
    await this.write({ ...catalog, routines: [...routines] });
  }

  async validateFolder(folder: Folder): Promise<Folder> {
    const result = folderSchema.safeParse(folder);
    if (!result.success)
      throw new PersistenceError('validation', `Folder failed validation: ${result.error.message}`);
    return result.data as Folder;
  }

  async validateActivity(activity: Activity): Promise<Activity> {
    const result = activitySchema.safeParse(activity);
    if (!result.success)
      throw new PersistenceError(
        'validation',
        `Activity failed validation: ${result.error.message}`
      );
    return result.data as Activity;
  }

  async validateRoutine(routine: RoutineDefinition): Promise<RoutineDefinition> {
    const result = routineDefinitionSchema.safeParse(routine);
    if (!result.success)
      throw new PersistenceError(
        'validation',
        `Routine failed validation: ${result.error.message}`
      );
    return result.data as RoutineDefinition;
  }
}

export function createCatalogRepository(
  database: KeyValueDatabase,
  namespace: DatasetNamespace
): CatalogRepository {
  return new CatalogRepository(database, namespace);
}
