import { ReorderableList } from '@ui/ReorderableList';
import { Column, Text } from '@ui/primitives';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  ActiveRoutine,
  Activity,
  CatalogCollection,
  Folder,
  RoutineDefinition,
} from '@domain';
import { useAppTheme } from '@theme';
import {
  errorText,
  PageFilterMenu,
  PageFilterMenuSelection,
  ROW_SURFACE_LIST_GAP,
  Screen,
} from '@ui';
import { RecoveryActions } from '../orchestration/RecoveryActions';

import { resolveCatalogItem } from '../catalog/catalog-service';
import { loadRoutineRuntime, type RoutineRuntime } from '../routine/routine-runtime';
import {
  chooseRoutineStartConflict,
  type RoutineConflictChoice,
} from '../routine/routine-start-conflict';
import { ActiveActivityBarSpacer } from './ActiveActivityBar';
import { ActivityRow } from './ActivityRow';
import { CatalogHeader } from './CatalogHeader';
import { FolderRow } from './FolderRow';
import { useCatalogOrderDraft } from './useCatalogOrderDraft';

type RootCatalogEntry =
  { kind: 'folder'; folder: Folder } | { kind: 'item'; item: Activity | RoutineDefinition };

type TrackerCatalogView = 'all' | 'activities' | 'routines' | 'folders';

const TRACKER_VIEW_OPTIONS = [
  { value: 'all', label: 'All items', icon: 'activity' },
  { value: 'activities', label: 'Activities', icon: 'play' },
  { value: 'routines', label: 'Routines', icon: 'repeat' },
  { value: 'folders', label: 'Folders', icon: 'folder' },
] as const;

function sortedRootEntries(catalog: CatalogCollection, showArchived: boolean): RootCatalogEntry[] {
  return [
    ...catalog.folders
      .filter((folder) => showArchived || folder.archivedAt === null)
      .map((folder) => ({ kind: 'folder' as const, folder })),
    ...[...catalog.activities, ...catalog.routines]
      .filter((item) => item.folderId === null && (showArchived || item.archivedAt === null))
      .map((item) => ({ kind: 'item' as const, item })),
  ].sort((left, right) => {
    const leftEntity = left.kind === 'folder' ? left.folder : left.item;
    const rightEntity = right.kind === 'folder' ? right.folder : right.item;
    return (
      leftEntity.sortOrder - rightEntity.sortOrder ||
      leftEntity.name.localeCompare(rightEntity.name)
    );
  });
}

function entriesForView(
  catalog: CatalogCollection,
  showArchived: boolean,
  view: TrackerCatalogView
): RootCatalogEntry[] {
  if (view === 'all') return sortedRootEntries(catalog, showArchived);
  if (view === 'folders') {
    return catalog.folders
      .filter((folder) => showArchived || folder.archivedAt === null)
      .map((folder) => ({ kind: 'folder' as const, folder }))
      .sort(
        (left, right) =>
          left.folder.sortOrder - right.folder.sortOrder ||
          left.folder.name.localeCompare(right.folder.name)
      );
  }

  const items = view === 'activities' ? catalog.activities : catalog.routines;
  return items
    .filter((item) => showArchived || item.archivedAt === null)
    .map((item) => ({ kind: 'item' as const, item }))
    .sort(
      (left, right) =>
        left.item.sortOrder - right.item.sortOrder || left.item.name.localeCompare(right.item.name)
    );
}

function CatalogError({
  title,
  message,
  onRetry,
  onBack,
}: {
  title: string;
  message: string;
  onRetry: () => void;
  onBack?: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Column
      spacing={9}
      style={{
        backgroundColor: colors.danger.background,
        borderColor: colors.danger.foreground,
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
        width: '100%',
      }}
      testID="tracker-error"
    >
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 16, fontWeight: '800' }}>
        {title}
      </Text>
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{message}</Text>
      <RecoveryActions onClose={onBack} onRetry={onRetry} testID="tracker-recovery" />
    </Column>
  );
}

export default function ActivitiesScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const [runtime, setRuntime] = useState<RoutineRuntime | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    void loadRoutineRuntime()
      .then(setRuntime)
      .catch((loadError: unknown) => setError(errorText(loadError)));
  };

  useEffect(() => {
    let cancelled = false;
    void loadRoutineRuntime()
      .then((nextRuntime) => {
        if (!cancelled) setRuntime(nextRuntime);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(errorText(loadError));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!runtime) {
    return (
      <Screen title="Tracker">
        {error ? (
          <CatalogError
            title="Activities unavailable"
            message={error}
            onBack={() => router.replace('/')}
            onRetry={load}
          />
        ) : (
          <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>Loading activities...</Text>
        )}
      </Screen>
    );
  }

  return <ActivitiesContent runtime={runtime} />;
}

function ActivitiesContent({ runtime }: { runtime: RoutineRuntime }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const store = runtime.trackerStore;
  const settings = runtime.settings;
  const storedCatalog = store((state) => state.catalog);
  const orderDraft = useCatalogOrderDraft(storedCatalog, runtime);
  const catalog = orderDraft.catalog;
  const activeTransition = store((state) => state.activeTransition);
  const persistenceError = store((state) => state.persistenceError);
  const loading = store((state) => state.loading);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setBusy] = useState(false);
  const busy = actionBusy || orderDraft.busy;
  const [editMode, setEditMode] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [catalogView, setCatalogView] = useState<TrackerCatalogView>('all');
  const [showArchived, setShowArchived] = useState(settings.showArchived);
  const [archiveSettingBusy, setArchiveSettingBusy] = useState(false);
  const lastAction = useRef<(() => Promise<void>) | null>(null);

  useFocusEffect(
    useCallback(() => {
      store.getState().updateSettings(settings, Date.now());
      void store
        .getState()
        .hydrate()
        .catch(() => undefined);
      void runtime.settingsService
        .read()
        .then((currentSettings) => setShowArchived(currentSettings.showArchived))
        .catch(() => undefined);
      return undefined;
    }, [runtime.settingsService, settings, store, setShowArchived])
  );

  if (!catalog) {
    return (
      <Screen title="Tracker">
        <CatalogError
          title="Activities unavailable"
          message={
            persistenceError
              ? errorText(persistenceError)
              : loading
                ? 'Loading activities...'
                : 'No catalog loaded yet.'
          }
          onBack={() => router.replace('/')}
          onRetry={() => void store.getState().hydrate()}
        />
      </Screen>
    );
  }

  const rootEntries = entriesForView(catalog, showArchived, catalogView);
  const visibleError =
    orderDraft.error ?? actionError ?? (persistenceError ? errorText(persistenceError) : null);

  const runAction = async (action: () => Promise<void>) => {
    lastAction.current = action;
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (actionFailure) {
      setActionError(errorText(actionFailure));
    } finally {
      setBusy(false);
    }
  };

  const changeArchivedVisibility = async (nextValue: boolean) => {
    if (archiveSettingBusy) return;
    setArchiveSettingBusy(true);
    setActionError(null);
    try {
      const nextSettings = await runtime.settingsService.setShowArchived(nextValue);
      setShowArchived(nextSettings.showArchived);
    } catch (error) {
      setActionError(errorText(error));
    } finally {
      setArchiveSettingBusy(false);
    }
  };

  const saveOrder = async () => {
    if (await orderDraft.save()) setEditMode(false);
  };

  const activate = (item: Activity | RoutineDefinition) => {
    void runAction(async () => {
      if (activeTransition?.activityId === item.id) {
        await runtime.routineService.switchToActivity(null);
        await store.getState().refresh();
        return;
      }

      if (item.kind === 'routine') {
        const activeRoutine = await runtime.routineService.getActive();
        if (
          activeRoutine &&
          activeRoutine.routineId !== item.id &&
          (activeRoutine.status === 'running' || activeRoutine.status === 'paused')
        ) {
          let resolvedActive = activeRoutine;
          if (activeRoutine.status === 'running') {
            await runtime.routineService.switchToActivity(null);
            resolvedActive = (await runtime.routineService.getActive()) ?? activeRoutine;
          }
          const conflict = { active: resolvedActive, target: item };
          void chooseRoutineStartConflict(resolvedActive, item).then((choice) => {
            if (choice) resolveRoutineConflict(choice, conflict);
          });
          return;
        }

        await prepareRoutineAlarm();
        const started = await runtime.routineService.startRoutine(item.id);
        await store.getState().refresh();
        router.push(`/routine/${started.routineId}`);
        return;
      }

      await runtime.routineService.switchToActivity(item.id);
      await store.getState().refresh();
    });
  };

  const prepareRoutineAlarm = async () => {
    if (!runtime.settings.alarmSettings.enabled || !runtime.settings.alarmSettings.sound) return;
    try {
      await runtime.routineAlarmService.prepare();
    } catch {
      // Alarm playback remains best-effort; the routine can still start.
    }
  };

  const resolveRoutineConflict = (
    choice: RoutineConflictChoice,
    conflict: { active: ActiveRoutine; target: RoutineDefinition }
  ) => {
    void runAction(async () => {
      if (choice === 'resume') {
        await prepareRoutineAlarm();
        await runtime.routineService.resume();
        await store.getState().refresh();
        router.push(`/routine/${conflict.active.routineId}`);
        return;
      }

      await runtime.routineService.cancelAndFinalize();
      await prepareRoutineAlarm();
      const started = await runtime.routineService.startRoutine(conflict.target.id);
      await store.getState().refresh();
      router.push(`/routine/${started.routineId}`);
    });
  };

  const editItem = (item: Activity | RoutineDefinition) =>
    router.push(`/${item.kind === 'routine' ? 'routine-edit' : 'activity'}/${item.id}`);

  return (
    <Screen testID="activities-screen">
      <Column spacing={20} style={{ width: '100%' }}>
        <CatalogHeader
          createActions={[
            {
              label: 'New activity',
              onPress: () => router.push('/activity/new'),
              systemImage: 'timer',
              testID: 'new-activity',
            },
            {
              label: 'New routine',
              onPress: () => router.push('/routine-edit/new'),
              systemImage: 'repeat',
              testID: 'new-routine',
            },
            {
              label: 'New folder',
              onPress: () => router.push('/folder-edit/new'),
              systemImage: 'folder.badge.plus',
              testID: 'new-folder',
            },
          ]}
          createOpen={createOpen}
          editMode={editMode}
          disabled={busy}
          hasOrderDraft={orderDraft.hasDraft}
          onAlphabetize={() =>
            void orderDraft.alphabetize(
              rootEntries.map((entry) =>
                entry.kind === 'folder' ? entry.folder.id : entry.item.id
              )
            )
          }
          onSaveOrder={() => void saveOrder()}
          onCancelOrder={orderDraft.cancel}
          filterMenu={
            <PageFilterMenu
              accessibilityLabel="Choose tracker view"
              onChange={setCatalogView}
              options={TRACKER_VIEW_OPTIONS}
              testID="tracker-view-menu"
              toggles={[
                {
                  label: 'Include archived items',
                  value: showArchived,
                  onChange: (value) => void changeArchivedVisibility(value),
                  testID: 'tracker-show-archived',
                },
              ]}
              value={catalogView}
            />
          }
          onToggleCreate={() => setCreateOpen((open) => !open)}
          onToggleEdit={() => {
            if (editMode && orderDraft.hasDraft) void saveOrder();
            else setEditMode((open) => !open);
            setCreateOpen(false);
          }}
          onHistory={() => router.push('/history')}
          title="Tracker"
        />
        <PageFilterMenuSelection
          defaultValue="all"
          onChange={setCatalogView}
          options={TRACKER_VIEW_OPTIONS}
          testID="tracker-view-menu"
          value={catalogView}
        />
        {visibleError ? (
          <CatalogError
            title="Catalog action failed"
            message={visibleError}
            onBack={() => router.replace('/')}
            onRetry={() => {
              if (lastAction.current) void runAction(lastAction.current);
              else void store.getState().hydrate();
            }}
          />
        ) : null}
        <Column spacing={ROW_SURFACE_LIST_GAP} style={{ width: '100%' }}>
          <ReorderableList
            items={rootEntries}
            getId={(entry) => (entry.kind === 'folder' ? entry.folder.id : entry.item.id)}
            enabled={editMode && !busy}
            onReorder={orderDraft.reorder}
            gap={ROW_SURFACE_LIST_GAP}
            renderItem={(entry) => {
              if (entry.kind === 'folder') {
                const { folder } = entry;
                return (
                  <FolderRow
                    actionsTestID={`folder-actions-${folder.id}`}
                    disabled={busy || folder.archivedAt !== null}
                    editMode={editMode}
                    folder={folder}
                    key={folder.id}
                    onPress={() =>
                      router.push(editMode ? `/folder-edit/${folder.id}` : `/folder/${folder.id}`)
                    }
                    testID={`folder-${folder.id}`}
                  />
                );
              }

              const { item } = entry;
              const resolved = resolveCatalogItem(catalog, item.id, colors.primary);
              const active = activeTransition?.activityId === item.id;
              return (
                <ActivityRow
                  key={item.id}
                  active={active}
                  actionsTestID={`catalog-actions-${item.id}`}
                  color={resolved?.displayColor}
                  disabled={busy || (!editMode && item.archivedAt !== null)}
                  editMode={editMode}
                  item={item}
                  onPress={() => (editMode ? editItem(item) : activate(item))}
                  testID={`catalog-item-${item.id}`}
                />
              );
            }}
          />
          {rootEntries.length === 0 ? (
            <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>
              {catalogView === 'all'
                ? 'No activities or folders yet. Use + to add one.'
                : `No ${TRACKER_VIEW_OPTIONS.find((option) => option.value === catalogView)?.label.toLowerCase() ?? 'items'} found.`}
            </Text>
          ) : null}
          <ActiveActivityBarSpacer />
        </Column>
      </Column>
    </Screen>
  );
}
