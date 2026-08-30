import { AppState } from 'react-native';
import { Column, Row, Text } from '@expo/ui';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import type {
  Activity,
  CatalogCollection,
  Folder,
  RoutineDefinition,
  TimeTransition,
} from '@domain';
import { AppIcon, isIconName } from '@icons';
import { getAccessibleTextColor, useAppTheme } from '@theme';
import { ActivityTile, AppButton, errorText, Screen } from '@ui';
import { RecoveryActions } from '../orchestration/RecoveryActions';

import { resolveCatalogItem } from '../catalog/catalog-service';
import { loadRoutineRuntime, type RoutineRuntime } from '../routine/routine-runtime';
import { AdjustStartSheet } from './AdjustStartSheet';
import { CurrentActivityHeader } from './CurrentActivityHeader';

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

function LoadError({
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
      spacing={10}
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
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 16, fontWeight: '700' }}>
        Tracker unavailable
      </Text>
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{message}</Text>
      <RecoveryActions
        onBack={onBack}
        onRetry={onRetry}
        retryTestID="retry-tracker"
        testID="tracker-recovery"
      />
    </Column>
  );
}

function ActionError({
  message,
  onRetry,
  onBack,
}: {
  message: string | null;
  onRetry: (() => void) | null;
  onBack?: () => void;
}) {
  const { colors } = useAppTheme();
  if (!message) return null;
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
      testID="tracker-action-error"
    >
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 15, fontWeight: '700' }}>
        Tracker action failed
      </Text>
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{message}</Text>
      {onRetry ? (
        <RecoveryActions
          onBack={onBack}
          onRetry={onRetry}
          retryTestID="retry-tracker-action"
          testID="tracker-action-recovery"
        />
      ) : null}
    </Column>
  );
}

export default function TrackerCatalogScreen() {
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
      <Screen title="Tracker" description="Your current activity and catalog">
        {error ? (
          <LoadError message={error} onBack={() => router.replace('/(tabs)')} onRetry={load} />
        ) : (
          <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>Loading tracker...</Text>
        )}
      </Screen>
    );
  }

  return <TrackerCatalogContent runtime={runtime} />;
}

function TrackerCatalogContent({ runtime }: { runtime: RoutineRuntime }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const store = runtime.trackerStore;
  const settings = runtime.settings;
  const catalog = store((state) => state.catalog);
  const activeTransition = store((state) => state.activeTransition);
  const persistenceError = store((state) => state.persistenceError);
  const loading = store((state) => state.loading);
  const sheet = store((state) => state.sheet);
  const [displayNowMs, setDisplayNowMs] = useState(() => Date.now());
  const [showArchived, setShowArchived] = useState(runtime.settings.showArchived);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastAction = useRef<(() => Promise<void>) | null>(null);
  const routeVisible = useRef(false);

  useFocusEffect(
    useCallback(() => {
      routeVisible.current = true;
      setShowArchived(settings.showArchived);
      store.getState().updateSettings(settings, Date.now());
      void store
        .getState()
        .hydrate()
        .catch(() => undefined);
      return () => {
        routeVisible.current = false;
      };
    }, [settings, store])
  );

  useEffect(() => {
    let appVisible = true;
    const tick = () => {
      if (routeVisible.current && appVisible) setDisplayNowMs(Date.now());
    };
    const subscription = AppState.addEventListener('change', (state) => {
      appVisible = state === 'active';
      if (appVisible) tick();
    });
    const timer = setInterval(tick, 1000);
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  if (!catalog) {
    const message = persistenceError ? errorText(persistenceError) : null;
    return (
      <Screen title="Tracker" description="Your current activity and catalog">
        {message ? (
          <LoadError
            message={message}
            onBack={() => router.replace('/(tabs)')}
            onRetry={() => void store.getState().hydrate()}
          />
        ) : (
          <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>
            {loading ? 'Loading tracker...' : 'No catalog loaded yet.'}
          </Text>
        )}
      </Screen>
    );
  }

  const rootItems = sortedRootItems(catalog, showArchived);
  const folders = sortedFolders(catalog, showArchived);
  const activePrevious = previousTransition(store.getState().transitions, activeTransition);
  const visibleActionError = actionError ?? (persistenceError ? errorText(persistenceError) : null);
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

  const retry = () => {
    const action = lastAction.current;
    if (action) void runAction(action);
    else void store.getState().hydrate();
  };

  const activate = (item: Activity | RoutineDefinition) => {
    void runAction(async () => {
      if (activeTransition?.activityId === item.id) {
        store.getState().setSheet('adjust-start');
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
    <Screen title="Tracker" description="Switch activities instantly, or start a saved routine.">
      <Column spacing={16} style={{ width: '100%' }}>
        <CurrentActivityHeader
          activeTransition={activeTransition}
          catalog={catalog}
          nowMs={displayNowMs}
          onAdjustStart={() => store.getState().setSheet('adjust-start')}
        />
        {sheet === 'adjust-start' &&
        activeTransition !== null &&
        activeTransition.activityId !== null ? (
          <AdjustStartSheet
            activeTransition={activeTransition}
            catalog={catalog}
            nowMs={displayNowMs}
            onAdjust={async (timestamp) => {
              await store.getState().adjustLatestStart(timestamp);
            }}
            onClose={() => store.getState().setSheet(null)}
            onHistory={() => {
              store.getState().setSheet(null);
              router.push('/history');
            }}
            previousTransition={activePrevious}
          />
        ) : null}
        <ActionError
          message={visibleActionError}
          onBack={() => router.replace('/(tabs)')}
          onRetry={retry}
        />
        <Column spacing={8} style={{ width: '100%' }}>
          <Column spacing={8} style={{ width: '100%' }}>
            <AppButton
              disabled={busy}
              label="New activity"
              onPress={() => router.push('/activity/new')}
              style={{ height: 50, width: '100%' }}
              testID="new-activity"
            />
            <AppButton
              disabled={busy}
              label="New routine"
              onPress={() => router.push('/routine-edit/new')}
              style={{ height: 50, width: '100%' }}
              testID="new-routine"
              variant="outlined"
            />
            <AppButton
              disabled={busy}
              label="New folder"
              onPress={() => router.push('/folder-edit/new')}
              style={{ height: 50, width: '100%' }}
              testID="new-folder"
              variant="outlined"
            />
          </Column>
          <AppButton
            label={showArchived ? 'Hide archived' : 'Show archived'}
            onPress={() => setShowArchived((visible) => !visible)}
            style={{ height: 48, width: '100%' }}
            testID="toggle-archived"
            variant="outlined"
          />
        </Column>
        <CatalogSection title="Folders" iconName="folder">
          {folders.map((folder) => (
            <FolderTile
              key={folder.id}
              busy={busy}
              catalog={catalog}
              folder={folder}
              onEdit={() => router.push(`/folder-edit/${folder.id}`)}
              onPress={() => router.push(`/folder/${folder.id}`)}
            />
          ))}
          {folders.length === 0 ? <EmptyCatalog text="No folders yet." /> : null}
        </CatalogSection>
        <CatalogSection title="Root activities and routines" iconName="activity">
          {rootItems.map((item) => {
            const resolved = resolveCatalogItem(catalog, item.id);
            const active = activeTransition?.activityId === item.id;
            return (
              <Column key={item.id} spacing={7} style={{ width: '100%' }}>
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
                      ? `Routine - ${item.steps.length} ${item.steps.length === 1 ? 'step' : 'steps'}${item.archivedAt ? ' - Archived' : ''}`
                      : `Activity${item.archivedAt ? ' - Archived' : ''}`
                  }
                  testID={`catalog-item-${item.id}`}
                />
                <Column spacing={8} style={{ width: '100%' }}>
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
                  {active ? (
                    <AppButton
                      disabled={busy}
                      label="Adjust start"
                      onPress={() => store.getState().setSheet('adjust-start')}
                      style={{ height: 48, width: '100%' }}
                      testID={`adjust-start-${item.id}`}
                      variant="outlined"
                    />
                  ) : null}
                </Column>
              </Column>
            );
          })}
          {rootItems.length === 0 ? (
            <EmptyCatalog text="No root activities or routines yet." />
          ) : null}
        </CatalogSection>
      </Column>
    </Screen>
  );
}

function CatalogSection({
  title,
  iconName,
  children,
}: {
  title: string;
  iconName: 'activity' | 'folder';
  children: ReactNode;
}) {
  const { colors } = useAppTheme();
  return (
    <Column spacing={10} style={{ width: '100%' }}>
      <Row alignment="center" spacing={8}>
        <AppIcon color={colors.primary} name={iconName} size={20} />
        <Text textStyle={{ color: colors.text, fontSize: 19, fontWeight: '800' }}>{title}</Text>
      </Row>
      {children}
    </Column>
  );
}

function FolderTile({
  catalog,
  folder,
  busy,
  onPress,
  onEdit,
}: {
  catalog: CatalogCollection;
  folder: Folder;
  busy: boolean;
  onPress: () => void;
  onEdit: () => void;
}) {
  const { colors } = useAppTheme();
  const childCount = [...catalog.activities, ...catalog.routines].filter(
    (item) => item.folderId === folder.id && item.archivedAt === null
  ).length;
  const color = folder.color ?? colors.primary;
  return (
    <Column spacing={7} style={{ width: '100%' }}>
      <AppButton
        disabled={busy}
        onPress={onPress}
        style={{
          backgroundColor: colors.surface,
          borderColor: color,
          borderRadius: 16,
          borderWidth: 2,
          height: 76,
          paddingHorizontal: 14,
          width: '100%',
        }}
        testID={`folder-${folder.id}`}
        variant="outlined"
      >
        <Row alignment="center" spacing={12} style={{ width: '100%' }}>
          <Column
            alignment="center"
            style={{ backgroundColor: color, borderRadius: 12, height: 48, width: 48 }}
          >
            <AppIcon
              accessibilityLabel={`${folder.name} folder icon`}
              color={getAccessibleTextColor(color)}
              name={isIconName(folder.iconName) ? folder.iconName : 'folder'}
              size={24}
            />
          </Column>
          <Column spacing={3} style={{ width: '100%' }}>
            <Text textStyle={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>
              {folder.name}
            </Text>
            <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>
              {`${childCount} ${childCount === 1 ? 'child' : 'children'}${folder.archivedAt ? ' - Archived' : ''}`}
            </Text>
          </Column>
          <AppIcon color={colors.textMuted} name="chevron-down" size={19} />
        </Row>
      </AppButton>
      <AppButton
        disabled={busy}
        label="Edit folder"
        onPress={onEdit}
        style={{ height: 48, width: '100%' }}
        variant="outlined"
      />
    </Column>
  );
}

function EmptyCatalog({ text }: { text: string }) {
  const { colors } = useAppTheme();
  return <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>{text}</Text>;
}

function previousTransition(
  transitions: readonly TimeTransition[],
  active: TimeTransition | null
): TimeTransition | null {
  if (!active) return null;
  const ordered = [...transitions]
    .filter((transition) => transition.status === 'recorded')
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  const index = ordered.findIndex((transition) => transition.id === active.id);
  return index > 0 ? ordered[index - 1] : null;
}
