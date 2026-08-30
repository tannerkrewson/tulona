import type { DatasetManager, DatasetNamespace } from '../data/namespaces';
import type { CatalogServiceApi } from '../catalog/catalog-service';
import type { HabitServiceApi } from '../habits/habit-service';

import { addStarterData, type StarterDataResult } from './starter-data';

export interface OnboardingServices {
  catalogService: Pick<CatalogServiceApi, 'read' | 'createFolder' | 'createActivity'>;
  habitService: Pick<HabitServiceApi, 'read' | 'create'>;
}

export interface OnboardingServiceOptions {
  datasetName?: string;
  createServices(namespace: DatasetNamespace): OnboardingServices | Promise<OnboardingServices>;
}

export type OnboardingStatus = 'needs-choice' | 'complete';

export interface OnboardingResult {
  datasetId: string;
  starterData: StarterDataResult | null;
}

/** Owns the explicit first-run choice without making a boot-routing decision. */
export class OnboardingService {
  private readonly datasetName: string;

  constructor(
    private readonly datasetManager: Pick<
      DatasetManager,
      'active' | 'list' | 'create' | 'activate'
    >,
    private readonly options: OnboardingServiceOptions
  ) {
    this.datasetName = options.datasetName?.trim() || 'My Tulona';
  }

  async status(): Promise<OnboardingStatus> {
    return (await this.datasetManager.active()) ? 'complete' : 'needs-choice';
  }

  async startEmpty(): Promise<OnboardingResult> {
    const namespace = await this.ensureDataset();
    return { datasetId: namespace.datasetId, starterData: null };
  }

  async addStarterActivities(): Promise<OnboardingResult> {
    const namespace = await this.ensureDataset();
    const services = await this.options.createServices(namespace);
    const starterData = await addStarterData(services);
    return { datasetId: namespace.datasetId, starterData };
  }

  async startWithStarterData(): Promise<OnboardingResult> {
    return this.addStarterActivities();
  }

  private async ensureDataset(): Promise<DatasetNamespace> {
    const current = await this.datasetManager.active();
    if (current) return current;

    const datasets = await this.datasetManager.list();
    const existing = datasets.find(({ metadata }) => metadata.archivedAt === null);
    if (existing) return this.datasetManager.activate(existing.metadata.id);

    const created = await this.datasetManager.create(this.datasetName);
    return this.datasetManager.activate(created.datasetId);
  }
}

export function createOnboardingService(
  datasetManager: Pick<DatasetManager, 'active' | 'list' | 'create' | 'activate'>,
  options: OnboardingServiceOptions
): OnboardingService {
  return new OnboardingService(datasetManager, options);
}
