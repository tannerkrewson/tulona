import { Column, Row, Text } from '@expo/ui';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import type { Activity, RoutineDefinition } from '@domain';
import { AppIcon, isIconValue } from '@icons';
import { getAccessibleTextColor, useAppTheme } from '@theme';
import { ActivityTile, AppButton, errorText, Screen } from '@ui';
import { RecoveryActions } from '../orchestration/RecoveryActions';

import { resolveCatalogItem } from '../catalog/catalog-service';
import { loadRoutineRuntime, type RoutineRuntime } from '../routine/routine-runtime';

function ErrorPanel({
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
      <RecoveryActions
        onBack={onBack}
        onRetry={onRetry}
        retryTestID="retry-folder-action"
        testID="folder-recovery"
      />
    </Column>
  );
}

export interface FolderContentScreenProps {
  folderId: string;
}

export function FolderContentScreen({ folderId }: FolderContentScreenProps) {
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
      <Screen title="Folder" description="Activities and routines in this folder">
        {loadError ? (
          <ErrorPanel message={loadError} onBack={() => router.back()} onRetry={load} />
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
  const settings = runtime.settings;
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
      setShowArchived(settings.showArchived);
      store.getState().updateSettings(settings, Date.now());
      void store
        .getState()
        .hydrate()
        .catch(() => undefined);
      return undefined;
    }, [settings, store])
  );

  if (!catalog) {
    const message = persistenceError ? errorText(persistenceError) : null;
    return (
      <Screen title="Folder" description="Activities and routines in this folder">
        {message ? (
          <ErrorPanel
            message={message}
            onBack={() => router.back()}
            onRetry={() => void store.getState().hydrate()}
          />
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
        <ErrorPanel
          message="This folder no longer exists."
          onBack={() => router.back()}
          onRetry={() => router.back()}
        />
      </Screen>
    );
  }

  const children = [...catalog.activities, ...catalog.routines]
    .filter((item) => item.folderId === folder.id && (showArchived || item.archivedAt === null))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
  const visibleError = actionError ?? (persistenceError ? errorText(persistenceError) : null);

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
              name={isIconValue(folder.iconName) ? folder.iconName : 'folder'}
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
          <Column spacing={8} style={{ width: '100%' }}>
            <AppButton
              disabled={busy}
              label="Add activity"
              onPress={() => router.push(`/activity/new?folderId=${folder.id}`)}
              style={{ height: 50, width: '100%' }}
              testID="folder-add-activity"
            />
            <AppButton
              disabled={busy}
              label="Add routine"
              onPress={() => router.push(`/routine-edit/new?folderId=${folder.id}`)}
              style={{ height: 50, width: '100%' }}
              testID="folder-add-routine"
              variant="outlined"
            />
            <AppButton
              disabled={busy}
              label="Edit folder"
              onPress={() => router.push(`/folder-edit/${folder.id}`)}
              style={{ height: 50, width: '100%' }}
              testID="folder-edit"
              variant="outlined"
            />
          </Column>
          <Column spacing={8} style={{ width: '100%' }}>
            <AppButton
              disabled={busy}
              label="Back to tracker"
              onPress={() => router.back()}
              style={{ height: 48, width: '100%' }}
              variant="outlined"
            />
            <AppButton
              label={showArchived ? 'Hide archived' : 'Show archived'}
              onPress={() => setShowArchived((visible) => !visible)}
              style={{ height: 48, width: '100%' }}
              testID="folder-toggle-archived"
              variant="outlined"
            />
          </Column>
        </Column>
        {visibleError ? (
          <ErrorPanel
            message={visibleError}
            onBack={() => router.back()}
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
                    isIconValue(item.iconName)
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
                  <Column spacing={8} style={{ width: '100%' }}>
                    <Text
                      textStyle={{
                        color: colors.active.foreground,
                        fontSize: 13,
                        fontWeight: '700',
                      }}
                    >
                      Active now
                    </Text>
                    <AppButton
                      disabled={busy}
                      label="Edit"
                      onPress={() =>
                        router.push(
                          `/${item.kind === 'routine' ? 'routine-edit' : 'activity'}/${item.id}`
                        )
                      }
                      style={{ height: 48, width: '100%' }}
                      variant="outlined"
                    />
                  </Column>
                ) : (
                  <AppButton
                    disabled={busy}
                    label="Edit"
                    onPress={() =>
                      router.push(
                        `/${item.kind === 'routine' ? 'routine-edit' : 'activity'}/${item.id}`
                      )
                    }
                    style={{ height: 48, width: '100%' }}
                    variant="outlined"
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
