import { Column, Text } from '@expo/ui';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import type { Activity, RoutineDefinition } from '@domain';
import { useAppTheme } from '@theme';
import { AppButton, errorText, Screen } from '@ui';
import { RecoveryActions } from '../orchestration/RecoveryActions';

import { resolveCatalogItem } from '../catalog/catalog-service';
import { loadRoutineRuntime, type RoutineRuntime } from '../routine/routine-runtime';
import { ActivityRow } from './ActivityRow';
import { CatalogHeader } from './CatalogHeader';

export interface FolderDetailScreenProps {
  folderId: string;
}

export function FolderDetailScreen({ folderId }: FolderDetailScreenProps) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const [runtime, setRuntime] = useState<RoutineRuntime | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = () => {
    setLoadError(null);
    void loadRoutineRuntime()
      .then(setRuntime)
      .catch((error: unknown) => setLoadError(errorText(error)));
  };

  useEffect(() => {
    let cancelled = false;
    void loadRoutineRuntime()
      .then((nextRuntime) => {
        if (!cancelled) setRuntime(nextRuntime);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(errorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!runtime) {
    return (
      <Screen title="Folder">
        {loadError ? (
          <FolderError message={loadError} onBack={() => router.back()} onRetry={load} />
        ) : (
          <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>Loading folder...</Text>
        )}
      </Screen>
    );
  }

  return <FolderContent runtime={runtime} folderId={folderId} />;
}

function FolderContent({ runtime, folderId }: { runtime: RoutineRuntime; folderId: string }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const store = runtime.trackerStore;
  const catalog = store((state) => state.catalog);
  const activeTransition = store((state) => state.activeTransition);
  const persistenceError = store((state) => state.persistenceError);
  const loading = store((state) => state.loading);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      store.getState().updateSettings(runtime.settings, Date.now());
      void store
        .getState()
        .hydrate()
        .catch(() => undefined);
      return undefined;
    }, [runtime.settings, store])
  );

  if (!catalog) {
    return (
      <Screen title="Folder">
        <FolderError
          message={
            persistenceError
              ? errorText(persistenceError)
              : loading
                ? 'Loading folder...'
                : 'No catalog loaded yet.'
          }
          onBack={() => router.back()}
          onRetry={() => void store.getState().hydrate()}
        />
      </Screen>
    );
  }

  const folder = catalog.folders.find((candidate) => candidate.id === folderId);
  if (!folder) {
    return (
      <Screen title="Folder">
        <FolderError
          message="This folder no longer exists."
          onBack={() => router.back()}
          onRetry={() => router.back()}
        />
      </Screen>
    );
  }

  const children = [...catalog.activities, ...catalog.routines]
    .filter(
      (item) =>
        item.folderId === folder.id && (runtime.settings.showArchived || item.archivedAt === null)
    )
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
  const visibleError = actionError ?? (persistenceError ? errorText(persistenceError) : null);

  const runAction = async (action: () => Promise<void>) => {
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

  return (
    <Screen testID="folder-detail-screen">
      <Column spacing={20} style={{ width: '100%' }}>
        <CatalogHeader
          backLabel="Activities"
          createActions={[
            {
              label: 'Add activity',
              onPress: () => router.push(`/activity/new?folderId=${folder.id}`),
              testID: 'folder-add-activity',
            },
            {
              label: 'Add routine',
              onPress: () => router.push(`/routine-edit/new?folderId=${folder.id}`),
              testID: 'folder-add-routine',
            },
          ]}
          createOpen={createOpen}
          editMode={editMode}
          onBack={() => router.back()}
          onToggleCreate={() => setCreateOpen((open) => !open)}
          onToggleEdit={() => {
            setEditMode((open) => !open);
            setCreateOpen(false);
          }}
          title={folder.name}
        />
        {visibleError ? (
          <FolderError
            message={visibleError}
            onBack={() => router.back()}
            onRetry={() => void store.getState().hydrate()}
          />
        ) : null}
        <Column spacing={12} style={{ width: '100%' }}>
          {children.map((item) => {
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
                  testID={`folder-child-${item.id}`}
                />
                {editMode ? (
                  <FolderEditActions
                    disabled={busy || item.archivedAt !== null}
                    onEdit={() =>
                      router.push(
                        `/${item.kind === 'routine' ? 'routine-edit' : 'activity'}/${item.id}`
                      )
                    }
                    testID={`folder-child-actions-${item.id}`}
                  />
                ) : null}
              </Column>
            );
          })}
          {children.length === 0 ? (
            <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>
              No activities in this folder yet. Use + to add one.
            </Text>
          ) : null}
        </Column>
        <Column style={{ height: activeTransition ? 112 : 20 }} />
      </Column>
    </Screen>
  );
}

function FolderEditActions({
  disabled,
  onEdit,
  testID,
}: {
  disabled: boolean;
  onEdit: () => void;
  testID: string;
}) {
  return (
    <Column style={{ paddingHorizontal: 4, width: '100%' }}>
      <AppButton
        disabled={disabled}
        label="Edit activity"
        onPress={onEdit}
        style={{ height: 42, width: '100%' }}
        testID={testID}
        variant="outlined"
      />
    </Column>
  );
}

function FolderError({
  message,
  onRetry,
  onBack,
}: {
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
      testID="folder-error"
    >
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 16, fontWeight: '800' }}>
        Folder unavailable
      </Text>
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{message}</Text>
      <RecoveryActions onBack={onBack} onRetry={onRetry} testID="folder-recovery" />
    </Column>
  );
}
