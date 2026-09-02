import {
  BackupRepository,
  createAsyncStorageDatabase,
  createCatalogRepository,
  createDatasetManager,
  createHabitRepository,
  createRoutineRepository,
  createSettingsRepository,
  createTrackerRepository,
  exportRawStorage,
  MetadataRepository,
  OperationJournal,
  PersistenceError,
  type KeyValueDatabase,
  type DatasetManager,
  type DatasetNamespace,
} from '@data';
import {
  logicalDayBounds,
  logicalDayKey,
  type ActiveRoutine,
  type CatalogCollection,
  type GlobalMetadata,
  type TimeTransition,
  type UUID,
} from '@domain';

import { createCatalogService, type CatalogService } from '../catalog/catalog-service';
import { BackupService } from '../backup/backup-service';
import { createHabitReconciliationService, type HabitReconciliationService } from '../habits';
import { createHabitService, type HabitService } from '../habits/habit-service';
import { createHabitStore, type HabitStore } from '../habits/habit-store';
import { createReportingService, type ReportingService } from '../reporting/reporting-service';
import { createRoutineAlarmService, type RoutineAlarmService } from '../routine/routine-alarm';
import { createRoutineService, type RoutineService } from '../routine/routine-service';
import { createSettingsService, type SettingsService } from '../settings/settings-service';
import { createSettingsStore, type SettingsStore } from '../settings/settings-store';
import { createTrackerService, type TrackerService } from '../tracker/tracker-service';
import { createTrackerStore, type TrackerStore } from '../tracker/tracker-store';

export type BootStage =
  'metadata' | 'journal' | 'settings' | 'catalog' | 'routine-recovery' | 'tracker' | 'habits';

export type BootDestination =
  | { kind: 'onboarding' }
  | { kind: 'tabs' }
  | { kind: 'runner'; routineId: UUID }
  | { kind: 'chooser' };

/** Returns the navigation target, or null when a valid cold-start deep link should survive boot. */
export function destinationAfterBoot(
  destination: BootDestination,
  pathname: string
): string | null {
  const target =
    destination.kind === 'onboarding'
      ? '/onboarding'
      : destination.kind === 'tabs'
        ? '/(tabs)'
        : destination.kind === 'runner'
          ? `/routine/${destination.routineId}`
          : '/routine-chooser';
  if (destination.kind === 'runner') return pathname === target ? null : target;
  if (destination.kind === 'chooser') return pathname === target ? null : target;
  if (destination.kind === 'onboarding') return pathname === target ? null : target;
  if (pathname === '/(tabs)') return null;
  if (
    pathname !== '/' &&
    /^(?:\/history|\/backup|\/insights|\/habits|\/settings|\/routine-chooser|\/onboarding|\/folder\/[^/]+|\/activity\/[^/]+|\/routine\/[^/]+|\/routine-edit\/[^/]+|\/folder-edit\/[^/]+|\/habit\/[^/]+)$/.test(
      pathname
    )
  ) {
    return null;
  }
  return target;
}

export class BootCoordinatorError extends PersistenceError {
  constructor(
    readonly stage: BootStage,
    error: unknown
  ) {
    const cause = error instanceof PersistenceError ? error : undefined;
    super(
      cause?.category ?? 'read',
      `Boot ${stage} failed: ${error instanceof Error ? error.message : String(error)}`,
      cause?.key,
      error
    );
  }
}

export interface BootRepositories {
  catalog: ReturnType<typeof createCatalogRepository>;
  settings: ReturnType<typeof createSettingsRepository>;
  tracker: ReturnType<typeof createTrackerRepository>;
  routine: ReturnType<typeof createRoutineRepository>;
  habits: ReturnType<typeof createHabitRepository>;
  backup: BackupRepository;
}

export interface BootServices {
  catalog: CatalogService;
  settings: SettingsService;
  tracker: TrackerService;
  routine: RoutineService;
  habits: HabitService;
  reconciliation: HabitReconciliationService;
  reporting: ReportingService;
  backup: BackupService;
  routineAlarm: RoutineAlarmService;
}

export interface BootStores {
  settings: SettingsStore;
  tracker: TrackerStore;
  habits: HabitStore;
}

export interface BootFeatureRuntime {
  database: KeyValueDatabase;
  datasetManager: DatasetManager;
  namespace: DatasetNamespace;
  repositories: BootRepositories;
  services: BootServices;
  stores: BootStores;
  settings: Awaited<ReturnType<SettingsService['read']>>;
  catalog: CatalogCollection;
}

export interface BootHydrationResult {
  metadata: GlobalMetadata;
  metadataStatus: 'missing' | 'valid';
  recoveredOperationIds: string[];
  namespace: DatasetNamespace | null;
  runtime: BootFeatureRuntime | null;
  activeRoutine: ActiveRoutine | null;
  currentTransition: TimeTransition | null;
  destination: BootDestination;
}

export interface BootCoordinatorOptions {
  now?: () => number;
}

function bootError(stage: BootStage, error: unknown): BootCoordinatorError {
  return error instanceof BootCoordinatorError ? error : new BootCoordinatorError(stage, error);
}

function activeDataset(
  metadata: GlobalMetadata,
  datasetManager: DatasetManager
): DatasetNamespace | null {
  if (!metadata.activeDatasetId) return null;
  const dataset = metadata.datasets.find((candidate) => candidate.id === metadata.activeDatasetId);
  if (!dataset || dataset.archivedAt !== null) {
    throw new PersistenceError(
      'metadata',
      'Active dataset metadata does not resolve to an active dataset'
    );
  }
  return datasetManager.namespace(dataset.id);
}

/** Owns the ordered application boot transaction; feature screens consume its results. */
export class BootCoordinator {
  private inFlight: Promise<BootHydrationResult> | null = null;
  private hydratedResult: BootHydrationResult | null = null;
  private readonly resetListeners = new Set<() => void>();
  private readonly now: () => number;

  constructor(
    private readonly database: KeyValueDatabase,
    private readonly datasetManager: DatasetManager,
    options: BootCoordinatorOptions = {}
  ) {
    this.now = options.now ?? (() => Date.now());
  }

  hydrate(): Promise<BootHydrationResult> {
    if (this.hydratedResult) return Promise.resolve(this.hydratedResult);
    if (this.inFlight) return this.inFlight;
    const promise = this.hydrateOnce()
      .then((result) => {
        this.hydratedResult = result;
        return result;
      })
      .finally(() => {
        this.inFlight = null;
      });
    this.inFlight = promise;
    return promise;
  }

  reset(): void {
    if (this.inFlight)
      throw new Error('Cannot reset the boot coordinator while hydration is running');
    this.hydratedResult = null;
    for (const listener of this.resetListeners) listener();
  }

  subscribeToReset(listener: () => void): () => void {
    this.resetListeners.add(listener);
    return () => this.resetListeners.delete(listener);
  }

  exportRawData(): Promise<string> {
    return exportRawStorage(this.database);
  }

  async clearAllData(): Promise<void> {
    if (this.inFlight) throw new Error('Cannot clear local data while hydration is running');
    await this.datasetManager.clearAll();
    this.reset();
  }

  private async hydrateOnce(): Promise<BootHydrationResult> {
    let metadataResult;
    try {
      metadataResult = await new MetadataRepository(this.database).load();
      if (metadataResult.status === 'recovered' || metadataResult.status === 'migration-required') {
        throw (
          metadataResult.error ?? new PersistenceError('metadata', 'Metadata is not safe to use')
        );
      }
    } catch (error) {
      throw bootError('metadata', error);
    }

    let recoveredOperationIds: string[];
    try {
      const report = await new OperationJournal(this.database).recoverUnfinished();
      if (report.failed.length > 0) {
        throw new PersistenceError(
          'journal',
          `Journal recovery failed: ${report.failed.map(({ id, error }) => `${id}: ${error.message}`).join('; ')}`,
          undefined,
          report.failed
        );
      }
      recoveredOperationIds = report.recovered;
    } catch (error) {
      throw bootError('journal', error);
    }

    try {
      // A recovered backup replacement may have changed the active dataset.
      metadataResult = await new MetadataRepository(this.database).load();
      if (metadataResult.status === 'recovered' || metadataResult.status === 'migration-required') {
        throw (
          metadataResult.error ?? new PersistenceError('metadata', 'Metadata is not safe to use')
        );
      }
      const metadata = metadataResult.metadata;
      if (!metadata.activeDatasetId) {
        return {
          metadata,
          metadataStatus: metadataResult.status,
          recoveredOperationIds,
          namespace: null,
          runtime: null,
          activeRoutine: null,
          currentTransition: null,
          destination: { kind: 'onboarding' },
        };
      }
      const namespace = activeDataset(metadata, this.datasetManager);
      if (!namespace) throw new PersistenceError('metadata', 'An active dataset is required');
      return await this.hydrateDataset(
        metadata,
        metadataResult.status,
        namespace,
        recoveredOperationIds
      );
    } catch (error) {
      throw bootError('metadata', error);
    }
  }

  private async hydrateDataset(
    metadata: GlobalMetadata,
    metadataStatus: 'missing' | 'valid',
    namespace: DatasetNamespace,
    recoveredOperationIds: string[]
  ): Promise<BootHydrationResult> {
    const repositories: BootRepositories = {
      catalog: createCatalogRepository(this.database, namespace),
      settings: createSettingsRepository(this.database, namespace),
      tracker: createTrackerRepository(this.database, namespace),
      routine: createRoutineRepository(this.database, namespace),
      habits: createHabitRepository(this.database, namespace),
      backup: new BackupRepository(this.database),
    };

    let settings: Awaited<ReturnType<SettingsService['read']>>;
    try {
      const settingsResult = await repositories.settings.readWithRecovery();
      if (settingsResult.status === 'recovered') {
        throw (
          settingsResult.error ?? new PersistenceError('metadata', 'Settings are not safe to use')
        );
      }
      settings = settingsResult.settings;
    } catch (error) {
      throw bootError('settings', error);
    }

    let catalog: CatalogCollection;
    const catalogService = createCatalogService(repositories.catalog);
    try {
      catalog = await catalogService.read();
    } catch (error) {
      throw bootError('catalog', error);
    }

    const runtimeHolder: { current: BootFeatureRuntime | null } = { current: null };
    const settingsService = createSettingsService(repositories.settings, {
      onUpdated: (nextSettings) => {
        const current = runtimeHolder.current;
        if (!current) return;
        Object.assign(current.settings, nextSettings, {
          alarmSettings: { ...nextSettings.alarmSettings },
        });
        current.services.routineAlarm.setSettings(nextSettings.alarmSettings);
        current.services.reconciliation.updateSettings({
          rolloverHour: nextSettings.logicalDayRolloverHour,
          weekStartsOn: nextSettings.weekStartsOn,
        });
        current.stores.tracker.getState().updateSettings(nextSettings, this.now());
        current.stores.habits.getState().updateSettings(nextSettings);
        void current.stores.tracker
          .getState()
          .hydrate()
          .catch(() => undefined);
        void current.stores.habits
          .getState()
          .refresh()
          .catch(() => undefined);
      },
    });
    const settingsStore = createSettingsStore(settingsService);
    const reconciliationHolder: { current: HabitReconciliationService | null } = { current: null };
    const trackerService = createTrackerService(repositories.tracker, {
      now: this.now,
      onMutation: (mutation) =>
        reconciliationHolder.current
          ? reconciliationHolder.current.reconcileTrackerEdit(mutation)
          : Promise.resolve(),
    });
    const habitService = createHabitService(repositories.habits, { catalog: catalogService });
    const reconciliation = createHabitReconciliationService(
      repositories.habits,
      trackerService,
      catalogService,
      {
        now: this.now(),
        rolloverHour: settings.logicalDayRolloverHour,
        weekStartsOn: settings.weekStartsOn,
      }
    );
    reconciliationHolder.current = reconciliation;
    const routineService = createRoutineService(
      repositories.routine,
      catalogService,
      trackerService,
      { now: this.now }
    );
    const reporting = createReportingService({
      tracker: trackerService,
      catalog: catalogService,
      settings: settingsService,
    });
    const backup = new BackupService(
      repositories.backup,
      this.datasetManager,
      this.database,
      reporting
    );
    const routineAlarm = createRoutineAlarmService();
    routineAlarm.setSettings(settings.alarmSettings);
    const logicalDay = logicalDayKey(this.now(), {
      rolloverHour: settings.logicalDayRolloverHour,
    });
    const dayBounds = logicalDayBounds(logicalDay, {
      rolloverHour: settings.logicalDayRolloverHour,
    });
    const trackerStore = createTrackerStore(trackerService, {
      initialRange: dayBounds,
      now: this.now,
      catalogService,
    });
    const habitsStore = createHabitStore(habitService, {
      now: this.now,
      catalogService,
      logicalDayRolloverHour: settings.logicalDayRolloverHour,
      weekStartsOn: settings.weekStartsOn,
    });
    const services: BootServices = {
      catalog: catalogService,
      settings: settingsService,
      tracker: trackerService,
      routine: routineService,
      habits: habitService,
      reconciliation,
      reporting,
      backup,
      routineAlarm,
    };
    const stores: BootStores = {
      settings: settingsStore,
      tracker: trackerStore,
      habits: habitsStore,
    };
    const runtime: BootFeatureRuntime = {
      database: this.database,
      datasetManager: this.datasetManager,
      namespace,
      repositories,
      services,
      stores,
      settings,
      catalog,
    };
    runtimeHolder.current = runtime;

    try {
      await settingsStore.getState().hydrate();
    } catch (error) {
      throw bootError('settings', error);
    }

    let activeRoutine: ActiveRoutine | null;
    try {
      activeRoutine = await routineService.recover(this.now());
    } catch (error) {
      throw bootError('routine-recovery', error);
    }

    try {
      await trackerStore.getState().hydrate();
    } catch (error) {
      throw bootError('tracker', error);
    }
    try {
      await habitsStore.getState().hydrate();
    } catch (error) {
      throw bootError('habits', error);
    }

    let currentTransition: TimeTransition | null;
    try {
      currentTransition = await trackerService.getActiveTransition(this.now());
    } catch (error) {
      throw bootError('tracker', error);
    }
    const destination: BootDestination =
      activeRoutine?.status === 'awaiting-next-activity'
        ? { kind: 'chooser' }
        : activeRoutine?.status === 'running' || activeRoutine?.status === 'paused'
          ? { kind: 'runner', routineId: activeRoutine.routineId }
          : { kind: 'tabs' };
    return {
      metadata,
      metadataStatus,
      recoveredOperationIds,
      namespace,
      runtime,
      activeRoutine,
      currentTransition,
      destination,
    };
  }
}

export function createBootCoordinator(
  database: KeyValueDatabase = createAsyncStorageDatabase(),
  options?: BootCoordinatorOptions
): BootCoordinator {
  return new BootCoordinator(database, createDatasetManager(database), options);
}

export const bootCoordinator = createBootCoordinator();
