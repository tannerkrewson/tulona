import {
  createAsyncStorageDatabase,
  createCatalogRepository,
  createDatasetManager,
  createHabitRepository,
} from '@data';

import { createCatalogService } from '../catalog/catalog-service';
import { createHabitService } from '../habits/habit-service';
import { createOnboardingService, type OnboardingService } from './onboarding-service';

const database = createAsyncStorageDatabase();
const datasetManager = createDatasetManager(database);

export async function loadOnboardingService(): Promise<OnboardingService> {
  return createOnboardingService(datasetManager, {
    createServices: (namespace) => {
      const catalogService = createCatalogService(createCatalogRepository(database, namespace));
      return {
        catalogService,
        habitService: createHabitService(createHabitRepository(database, namespace), {
          catalog: catalogService,
        }),
      };
    },
  });
}
