import { Column, Text } from '@expo/ui';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import type { ActiveRoutine, Activity, RoutineDefinition } from '@domain';
import { useAppTheme } from '@theme';
import { errorText, Screen } from '@ui';
import { RecoveryActions } from '../orchestration/RecoveryActions';

import { resolveCatalogItem } from '../catalog/catalog-service';
import { loadRoutineRuntime, type RoutineRuntime } from '../routine/routine-runtime';
import { RoutineStartConflictModal } from '../routine/RoutineStartConflictModal';
import { ACTIVE_ACTIVITY_BAR_HEIGHT } from './ActiveActivityBar';
import { ActivityRow } from './ActivityRow';
import { CatalogHeader } from './CatalogHeader';
import { CatalogIconButton } from './CatalogIconButton';

export interface FolderDetailScreenProps {
  folderId: string;
}

export function FolderDetailScreen({ folderId }: FolderDetailScreenProps) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const goBackToTracker = () => router.replace('/(tabs)');
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
      <Screen onBack={goBackToTracker} title="Folder">
        {loadError ? (
          <FolderError message={loadError} onBack={goBackToTracker} onRetry={load} />
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
  const goBackToTracker = () => router.replace('/(tabs)');
  const store = runtime.trackerStore;
  const catalog = store((state) => state.catalog);
  const activeTransition = store((state) => state.activeTransition);
  const persistenceError = store((state) => state.persistenceError);
  const loading = store((state) => state.loading);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [routineConflict, setRoutineConflict] = useState<{
    active: ActiveRoutine;
    target: RoutineDefinition;
  } | null>(null);

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
          onBack={goBackToTracker}
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
          onBack={goBackToTracker}
          onRetry={goBackToTracker}
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

  const editItem = (item: Activity | RoutineDefinition) =>
    router.push(`/${item.kind === 'routine' ? 'routine-edit' : 'activity'}/${item.id}`);

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

  const reorderItem = (itemId: string, direction: 'up' | 'down') =>
    void runAction(async () => {
      await runtime.catalogService.reorderItem(itemId, direction);
      await store.getState().hydrate();
    });

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
          setRoutineConflict({ active: resolvedActive, target: item });
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

  const resolveRoutineConflict = (choice: 'resume' | 'cancel-and-start') => {
    const conflict = routineConflict;
    if (!conflict) return;
    void runAction(async () => {
      if (choice === 'resume') {
        await prepareRoutineAlarm();
        await runtime.routineService.resume();
        setRoutineConflict(null);
        await store.getState().refresh();
        router.push(`/routine/${conflict.active.routineId}`);
        return;
      }

      await runtime.routineService.cancelAndFinalize();
      setRoutineConflict(null);
      await prepareRoutineAlarm();
      const started = await runtime.routineService.startRoutine(conflict.target.id);
      await store.getState().refresh();
      router.push(`/routine/${started.routineId}`);
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
          onBack={goBackToTracker}
          onToggleCreate={() => setCreateOpen((open) => !open)}
          onToggleEdit={() => {
            setEditMode((open) => !open);
            setCreateOpen(false);
          }}
          title={folder.name}
        />
        {editMode ? (
          <View style={{ alignItems: 'flex-end', width: '100%' }}>
            <CatalogIconButton
              icon="pencil"
              label="Edit folder"
              onPress={() => router.push(`/folder-edit/${folder.id}`)}
              testID="folder-edit"
            />
          </View>
        ) : null}
        {visibleError ? (
          <FolderError
            message={visibleError}
            onBack={goBackToTracker}
            onRetry={() => void store.getState().hydrate()}
          />
        ) : null}
        <Column spacing={12} style={{ width: '100%' }}>
          {children.map((item) => {
            const resolved = resolveCatalogItem(catalog, item.id, colors.primary);
            const active = activeTransition?.activityId === item.id;
            return (
              <ActivityRow
                key={item.id}
                active={active}
                actionsTestID={`folder-child-actions-${item.id}`}
                color={resolved?.displayColor}
                disabled={busy || (!editMode && item.archivedAt !== null)}
                editMode={editMode}
                item={item}
                onMoveDown={() => reorderItem(item.id, 'down')}
                onMoveUp={() => reorderItem(item.id, 'up')}
                onPress={() => (editMode ? editItem(item) : activate(item))}
                testID={`folder-child-${item.id}`}
              />
            );
          })}
          {children.length === 0 ? (
            <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>
              No activities in this folder yet. Use + to add one.
            </Text>
          ) : null}
          <View style={{ height: ACTIVE_ACTIVITY_BAR_HEIGHT + 20, width: '100%' }} />
        </Column>
      </Column>
      <RoutineStartConflictModal
        activeRoutine={routineConflict?.active ?? null}
        targetRoutine={routineConflict?.target ?? null}
        visible={routineConflict !== null}
        busy={busy}
        onResume={() => resolveRoutineConflict('resume')}
        onCancelAndStart={() => resolveRoutineConflict('cancel-and-start')}
        onKeepPaused={() => setRoutineConflict(null)}
      />
    </Screen>
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
      <RecoveryActions onClose={onBack} onRetry={onRetry} testID="folder-recovery" />
    </Column>
  );
}
