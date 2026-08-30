import type { CatalogServiceApi } from '../catalog/catalog-service';
import type { HabitServiceApi } from '../habits/habit-service';
import type { IconName } from '../icons/icon-names';

export interface StarterDataServices {
  catalogService: Pick<CatalogServiceApi, 'read' | 'createFolder' | 'createActivity'>;
  habitService: Pick<HabitServiceApi, 'read' | 'create'>;
}

export interface StarterDataResult {
  createdFolders: number;
  createdActivities: number;
  createdHabits: number;
}

const STARTER_FOLDERS: readonly { name: string; iconName: IconName }[] = [
  { name: 'Morning Routine', iconName: 'sun' },
  { name: 'Work', iconName: 'briefcase' },
  { name: 'Exercise', iconName: 'dumbbell' },
  { name: 'Eating', iconName: 'utensils' },
  { name: 'Errands', iconName: 'shopping-bag' },
  { name: 'Leisure', iconName: 'gamepad-2' },
];

const STARTER_ACTIVITIES: readonly { name: string; folderName: string; iconName: IconName }[] = [
  { name: 'Morning Routine', folderName: 'Morning Routine', iconName: 'sun' },
  { name: 'Work', folderName: 'Work', iconName: 'briefcase' },
  { name: 'Exercise', folderName: 'Exercise', iconName: 'dumbbell' },
  { name: 'Eating', folderName: 'Eating', iconName: 'utensils' },
  { name: 'Errands', folderName: 'Errands', iconName: 'shopping-bag' },
  { name: 'TV', folderName: 'Leisure', iconName: 'laptop' },
  { name: 'Video Games', folderName: 'Leisure', iconName: 'gamepad-2' },
  { name: 'Reading', folderName: 'Leisure', iconName: 'book-open' },
];

const STARTER_HABITS: readonly { name: string; iconName: IconName }[] = [
  { name: 'Morning Routine', iconName: 'sun' },
  { name: 'Exercise', iconName: 'dumbbell' },
  { name: 'Reading', iconName: 'book-open' },
];

/** Seeds a useful empty catalog through normal services and is safe to repeat. */
export async function addStarterData(services: StarterDataServices): Promise<StarterDataResult> {
  let catalog = await services.catalogService.read();
  let createdFolders = 0;
  let createdActivities = 0;
  let createdHabits = 0;

  const folderIds = new Map<string, string>();
  for (const definition of STARTER_FOLDERS) {
    const existing = catalog.folders.find(
      (folder) => folder.name === definition.name && folder.archivedAt === null
    );
    const folder =
      existing ??
      (await services.catalogService.createFolder({
        name: definition.name,
        iconName: definition.iconName,
      }));
    if (!existing) createdFolders += 1;
    folderIds.set(definition.name, folder.id);
    catalog = existing ? catalog : await services.catalogService.read();
  }

  for (const definition of STARTER_ACTIVITIES) {
    const folderId = folderIds.get(definition.folderName);
    if (!folderId) throw new Error(`Starter folder is missing: ${definition.folderName}`);
    const existing = catalog.activities.find(
      (activity) =>
        activity.name === definition.name &&
        activity.folderId === folderId &&
        activity.archivedAt === null
    );
    if (!existing) {
      await services.catalogService.createActivity({
        name: definition.name,
        folderId,
        iconName: definition.iconName,
      });
      createdActivities += 1;
      catalog = await services.catalogService.read();
    }
  }

  let habits = await services.habitService.read();
  for (const definition of STARTER_HABITS) {
    if (habits.some((habit) => habit.name === definition.name)) continue;
    await services.habitService.create({
      name: definition.name,
      iconName: definition.iconName,
      schedule: { kind: 'daily' },
      trigger: null,
    });
    createdHabits += 1;
    habits = await services.habitService.read();
  }

  return { createdFolders, createdActivities, createdHabits };
}

export class StarterDataService {
  constructor(private readonly services: StarterDataServices) {}

  add(): Promise<StarterDataResult> {
    return addStarterData(this.services);
  }
}

export function createStarterDataService(services: StarterDataServices): StarterDataService {
  return new StarterDataService(services);
}
