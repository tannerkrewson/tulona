import { PersistenceError } from '@data';

import { bootCoordinator } from '../orchestration/boot-coordinator';
import type { CatalogService } from '../catalog/catalog-service';
import type { SettingsService } from '../settings/settings-service';
import type { ReportingService } from './reporting-service';
import type { TrackerService } from '../tracker/tracker-service';

export interface ReportingRuntime {
  reportingService: ReportingService;
  catalogService: CatalogService;
  trackerService: TrackerService;
  settingsService: SettingsService;
  settings: Awaited<ReturnType<SettingsService['read']>>;
}

export async function loadReportingRuntime(): Promise<ReportingRuntime> {
  const result = await bootCoordinator.hydrate();
  if (!result.runtime) throw new PersistenceError('metadata', 'Create or activate a dataset first');
  return {
    reportingService: result.runtime.services.reporting,
    catalogService: result.runtime.services.catalog,
    trackerService: result.runtime.services.tracker,
    settingsService: result.runtime.services.settings,
    settings: result.runtime.settings,
  };
}
