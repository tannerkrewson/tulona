import { Column, Row, Text } from '@expo/ui';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Activity, CatalogCollection, Folder, RoutineDefinition } from '@domain';
import { useAppTheme } from '@theme';
import { AppButton, errorText, Screen } from '@ui';
import { RecoveryActions } from '../orchestration/RecoveryActions';

import { resolveCatalogItem } from '../catalog/catalog-service';
import { loadRoutineRuntime, type RoutineRuntime } from '../routine/routine-runtime';
import { ActivityRow } from './ActivityRow';
import { CatalogHeader } from './CatalogHeader';
import { FolderRow } from './FolderRow';

function sortedRootItems(catalog: CatalogCollection, showArchived: boolean) {
  return [...catalog.activities, ...catalog.routines]
    .filter((item) => item.folderId === null && (showArchived || item.archivedAt === null))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
}

function sortedFolders(catalog: CatalogCollection, showArchived: boolean): Folder[] {
  return catalog.folders
    .filter((folder) => showArchived || folder.archivedAt === null)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
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
      <RecoveryActions onBack={onBack} onRetry={onRetry} testID="tracker-recovery" />
    </Column>
  );
}

function EditActions({
  onEdit,
  onUp,
  onDown,
  disabled,
  testID,
}: {
  onEdit: () => void;
  onUp: () => void;
  onDown: () => void;
  disabled: boolean;
  testID: string;
}) {
  return (
    <Row alignment="center" spacing={7} style={{ width: '100%' }}>
      <AppButton
        disabled={disabled}
        label="Edit"
        onPress={onEdit}
        style={{ height: 42, width: '32%' }}
        testID={`${testID}-edit`}
        variant="outlined"
      />
      <AppButton
        disabled={disabled}
        label="Up"
        onPress={onUp}
        style={{ height: 42, width: '32%' }}
        testID={`${testID}-up`}
        variant="outlined"
      />
      <AppButton
        disabled={disabled}
        label="Down"
        onPress={onDown}
        style={{ height: 42, width: '32%' }}
        testID={`${testID}-down`}
        variant="outlined"
      />
    </Row>
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
            onBack={() => router.replace('/(tabs)')}
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
  const catalog = store((state) => state.catalog);
  const activeTransition = store((state) => state.activeTransition);
  const persistenceError = store((state) => state.persistenceError);
  const loading = store((state) => state.loading);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const lastAction = useRef<(() => Promise<void>) | null>(null);

  useFocusEffect(
    useCallback(() => {
      store.getState().updateSettings(settings, Date.now());
      void store
        .getState()
        .hydrate()
        .catch(() => undefined);
      return undefined;
    }, [settings, store])
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
          onBack={() => router.replace('/(tabs)')}
          onRetry={() => void store.getState().hydrate()}
        />
      </Screen>
    );
  }

  const folders = sortedFolders(catalog, settings.showArchived);
  const rootItems = sortedRootItems(catalog, settings.showArchived);
  const visibleError = actionError ?? (persistenceError ? errorText(persistenceError) : null);

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

  const activate = (item: Activity | RoutineDefinition) => {
    void runAction(async () => {
      if (activeTransition?.activityId === item.id) {
        const activeRoutine = await runtime.routineService.getActive();
        if (activeRoutine?.status === 'running') {
          await runtime.routineService.pause();
          if (await runtime.trackerService.getActiveTransition()) {
            await runtime.trackerService.switchActivity(null);
          }
        } else await store.getState().switchActivity(null);
        await store.getState().refresh();
        return;
      }

      if (item.kind === 'routine') {
        if (runtime.settings.alarmSettings.enabled && runtime.settings.alarmSettings.sound) {
          try {
            await runtime.routineAlarmService.prepare();
          } catch {
            // Alarm playback remains best-effort; the routine can still start.
          }
        }
        const started = await runtime.routineService.startRoutine(item.id);
        await store.getState().refresh();
        router.push(`/routine/${started.routineId}`);
        return;
      }

      await store.getState().switchActivity(item.id);
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
              testID: 'new-activity',
            },
            {
              label: 'New routine',
              onPress: () => router.push('/routine-edit/new'),
              testID: 'new-routine',
            },
            {
              label: 'New folder',
              onPress: () => router.push('/folder-edit/new'),
              testID: 'new-folder',
            },
          ]}
          createOpen={createOpen}
          editMode={editMode}
          onToggleCreate={() => setCreateOpen((open) => !open)}
          onToggleEdit={() => {
            setEditMode((open) => !open);
            setCreateOpen(false);
          }}
          title="Tracker"
        />
        {visibleError ? (
          <CatalogError
            title="Catalog action failed"
            message={visibleError}
            onBack={() => router.replace('/(tabs)')}
            onRetry={() => {
              if (lastAction.current) void runAction(lastAction.current);
              else void store.getState().hydrate();
            }}
          />
        ) : null}
        <Column spacing={5} style={{ width: '100%' }}>
          {folders.map((folder) => (
            <Column key={folder.id} spacing={6} style={{ width: '100%' }}>
              <FolderRow
                disabled={busy || folder.archivedAt !== null}
                folder={folder}
                onPress={() => router.push(`/folder/${folder.id}`)}
                testID={`folder-${folder.id}`}
              />
              {editMode ? (
                <EditActions
                  disabled={busy || folder.archivedAt !== null}
                  onDown={() =>
                    void runAction(
                      async () =>
                        void (await runtime.catalogService.reorderFolders(folder.id, 'down'))
                    )
                  }
                  onEdit={() => router.push(`/folder-edit/${folder.id}`)}
                  onUp={() =>
                    void runAction(
                      async () =>
                        void (await runtime.catalogService.reorderFolders(folder.id, 'up'))
                    )
                  }
                  testID={`folder-actions-${folder.id}`}
                />
              ) : null}
            </Column>
          ))}
          {rootItems.map((item) => {
            const resolved = resolveCatalogItem(catalog, item.id);
            const active = activeTransition?.activityId === item.id;
            return (
              <Column key={item.id} spacing={6} style={{ width: '100%' }}>
                <ActivityRow
                  active={active}
                  color={resolved?.displayColor}
                  disabled={busy || item.archivedAt !== null}
                  item={item}
                  onPress={() => activate(item)}
                  testID={`catalog-item-${item.id}`}
                />
                {editMode ? (
                  <EditActions
                    disabled={busy || item.archivedAt !== null}
                    onDown={() =>
                      void runAction(
                        async () => void (await runtime.catalogService.reorderItem(item.id, 'down'))
                      )
                    }
                    onEdit={() => editItem(item)}
                    onUp={() =>
                      void runAction(
                        async () => void (await runtime.catalogService.reorderItem(item.id, 'up'))
                      )
                    }
                    testID={`catalog-actions-${item.id}`}
                  />
                ) : null}
              </Column>
            );
          })}
          {folders.length === 0 && rootItems.length === 0 ? (
            <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>
              No activities or folders yet. Use + to add one.
            </Text>
          ) : null}
        </Column>
        <Column style={{ height: activeTransition ? 176 : 84 }} />
      </Column>
    </Screen>
  );
}
