import { PersistenceError } from '@data';

import { bootCoordinator } from '../orchestration/boot-coordinator';
import type { ReportingService } from '../reporting/reporting-service';
import { BackupService } from './backup-service';

export interface BackupRuntime {
  backupService: BackupService;
  reportingService: ReportingService;
}

export async function loadBackupRuntime(): Promise<BackupRuntime> {
  const result = await bootCoordinator.hydrate();
  if (!result.runtime) throw new PersistenceError('metadata', 'Create or activate a dataset first');
  return {
    backupService: result.runtime.services.backup,
    reportingService: result.runtime.services.reporting,
  };
}
