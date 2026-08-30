import { Button, Column, Row, Text } from '@expo/ui';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import type { Activity, RoutineDefinition } from '@domain';
import { isIconName, AppIcon } from '@icons';
import { getAccessibleTextColor, useAppTheme } from '@theme';
import { ActivityTile, Screen } from '@ui';

import { resolveCatalogItem } from '../catalog/catalog-service';
import { loadRoutineRuntime, type RoutineRuntime } from '../routine/routine-runtime';
import { createTrackerStore } from './tracker-store';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Column
      spacing={8}
      style={{
        backgroundColor: colors.danger.background,
        borderColor: colors.danger.foreground,
        borderRadius: 14,
        borderWidth: 1,
        padding: 14,
        width: '100%',
      }}
      testID="folder-action-error"
    >
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 15, fontWeight: '700' }}>
        Folder action failed
      </Text>
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{message}</Text>
      <Button label="Retry" onPress={onRetry} testID="retry-folder-action" />
    </Column>
  );
}

export interface FolderContentScreenProps {
  folderId: string;
}

export function FolderContentScreen({ folderId }: FolderContentScreenProps) {
  const { colors } = useAppTheme();
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
      <Screen title="Folder" description="Activities and routines in this folder">
        {loadError ? (
          <ErrorPanel message={loadError} onRetry={load} />
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
  const [store] = useState(() =>
    createTrackerStore(runtime.trackerService, {
      initialRange: { startMs: Date.now() - 86_400_000, endMs: Date.now() },
      catalogService: runtime.catalogService,
    })
  );
  const catalog = store((state) => state.catalog);
  const activeTransition = store((state) => state.activeTransition);
  const persistenceError = store((state) => state.persistenceError);
  const loading = store((state) => state.loading);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(runtime.settings.showArchived);
  const [lastAction, setLastAction] = useState<(() => Promise<void>) | null>(null);

  useFocusEffect(
    useCallback(() => {
      void store
        .getState()
        .hydrate()
        .catch(() => undefined);
      return undefined;
    }, [store])
  );

  if (!catalog) {
    const message = persistenceError?.message;
    return (
      <Screen title="Folder" description="Activities and routines in this folder">
        {message ? (
          <ErrorPanel message={message} onRetry={() => void store.getState().hydrate()} />
        ) : (
          <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>
            {loading ? 'Loading folder...' : 'No folder loaded yet.'}
          </Text>
        )}
      </Screen>
    );
  }

  const folder = catalog.folders.find((candidate) => candidate.id === folderId);
  if (!folder) {
    return (
      <Screen title="Folder" description="Activities and routines in this folder">
        <ErrorPanel message="This folder no longer exists." onRetry={() => router.back()} />
      </Screen>
    );
  }

  const children = [...catalog.activities, ...catalog.routines]
    .filter((item) => item.folderId === folder.id && (showArchived || item.archivedAt === null))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
  const visibleError = actionError ?? persistenceError?.message;

  const runAction = async (action: () => Promise<void>) => {
    setLastAction(() => action);
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const activate = (item: Activity | RoutineDefinition) => {
    void runAction(async () => {
      if (activeTransition?.activityId === item.id) return;
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
      } else {
        await store.getState().switchActivity(item.id);
      }
    });
  };

  return (
    <Screen title={folder.name} description="Folder children inherit this folder's display color.">
      <Column spacing={16} style={{ width: '100%' }}>
        <Row alignment="center" spacing={10}>
          <Column
            alignment="center"
            style={{
              backgroundColor: folder.color ?? colors.primary,
              borderRadius: 14,
              height: 54,
              width: 54,
            }}
          >
            <AppIcon
              accessibilityLabel={`${folder.name} folder icon`}
              color={getAccessibleTextColor(folder.color ?? colors.primary)}
              name={isIconName(folder.iconName) ? folder.iconName : 'folder'}
              size={27}
            />
          </Column>
          <Column spacing={3} style={{ width: '100%' }}>
            <Text textStyle={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>
              {folder.name}
            </Text>
            <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
              {`${children.length} visible ${children.length === 1 ? 'child' : 'children'}`}
            </Text>
          </Column>
        </Row>
        <Column spacing={8} style={{ width: '100%' }}>
          <Row alignment="center" spacing={8}>
            <Button
              disabled={busy}
              label="Add activity"
              onPress={() => router.push(`/activity/new?folderId=${folder.id}`)}
              testID="folder-add-activity"
            />
            <Button
              disabled={busy}
              label="Add routine"
              onPress={() => router.push(`/routine-edit/new?folderId=${folder.id}`)}
              testID="folder-add-routine"
              variant="outlined"
            />
            <Button
              disabled={busy}
              label="Edit folder"
              onPress={() => router.push(`/folder-edit/${folder.id}`)}
              testID="folder-edit"
              variant="outlined"
            />
          </Row>
          <Row alignment="center" spacing={8}>
            <Button
              disabled={busy}
              label="Back to tracker"
              onPress={() => router.back()}
              variant="text"
            />
            <Button
              label={showArchived ? 'Hide archived' : 'Show archived'}
              onPress={() => setShowArchived((visible) => !visible)}
              testID="folder-toggle-archived"
              variant="outlined"
            />
          </Row>
        </Column>
        {visibleError ? (
          <ErrorPanel
            message={visibleError}
            onRetry={() => void (lastAction ? runAction(lastAction) : store.getState().hydrate())}
          />
        ) : null}
        <Column spacing={10} style={{ width: '100%' }}>
          {children.map((item) => {
            const resolved = resolveCatalogItem(catalog, item.id);
            const active = activeTransition?.activityId === item.id;
            return (
              <Column key={item.id} spacing={6} style={{ width: '100%' }}>
                <ActivityTile
                  active={active}
                  color={resolved?.displayColor}
                  disabled={busy || item.archivedAt !== null}
                  iconName={
                    isIconName(item.iconName)
                      ? item.iconName
                      : item.kind === 'routine'
                        ? 'repeat'
                        : 'activity'
                  }
                  name={item.name}
                  onPress={() => activate(item)}
                  supportingText={
                    item.kind === 'routine'
                      ? `Routine - ${item.steps.length} ${item.steps.length === 1 ? 'step' : 'steps'}`
                      : 'Activity'
                  }
                  testID={`folder-child-${item.id}`}
                />
                {active ? (
                  <Row alignment="center" spacing={8}>
                    <Text
                      textStyle={{
                        color: colors.active.foreground,
                        fontSize: 13,
                        fontWeight: '700',
                      }}
                    >
                      Active now
                    </Text>
                    <Button
                      disabled={busy}
                      label="Edit"
                      onPress={() =>
                        router.push(
                          `/${item.kind === 'routine' ? 'routine-edit' : 'activity'}/${item.id}`
                        )
                      }
                      variant="text"
                    />
                  </Row>
                ) : (
                  <Button
                    disabled={busy}
                    label="Edit"
                    onPress={() =>
                      router.push(
                        `/${item.kind === 'routine' ? 'routine-edit' : 'activity'}/${item.id}`
                      )
                    }
                    variant="text"
                  />
                )}
              </Column>
            );
          })}
          {children.length === 0 ? (
            <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>
              No activities or routines in this folder yet.
            </Text>
          ) : null}
        </Column>
      </Column>
    </Screen>
  );
}
