import { Column, Text } from '@expo/ui';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import type { CatalogCollection, Folder, TimeTransition, TrackableItem, UUID } from '@domain';
import { useAppTheme } from '@theme';
import { AppButton, errorText, ROW_SURFACE_LIST_GAP, Screen } from '@ui';

import { resolveCatalogItem } from '../catalog/catalog-service';
import { RecoveryActions } from '../orchestration/RecoveryActions';
import { loadRoutineRuntime, type RoutineRuntime } from '../routine/routine-runtime';
import { goBackInAppStack } from '../navigation/app-back';
import { ActivityRow } from './ActivityRow';
import { FolderRow } from './FolderRow';

function sortItems(left: TrackableItem, right: TrackableItem): number {
  return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name);
}

function sortFolders(left: Folder, right: Folder): number {
  return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name);
}

function displayItem(item: TrackableItem): TrackableItem {
  return item.archivedAt === null ? item : { ...item, name: `${item.name} (archived)` };
}

function displayFolder(folder: Folder): Folder {
  return folder.archivedAt === null ? folder : { ...folder, name: `${folder.name} (archived)` };
}

function ChooserError({ message, children }: { message: string; children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <Column
      spacing={8}
      style={{
        backgroundColor: colors.danger.background,
        borderColor: colors.danger.foreground,
        borderRadius: 14,
        borderWidth: 1,
        padding: 16,
        width: '100%',
      }}
      testID="activity-session-chooser-error"
    >
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 16, fontWeight: '700' }}>
        Activity chooser unavailable
      </Text>
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{message}</Text>
      {children}
    </Column>
  );
}

export interface ActivitySessionActivityChooserScreenProps {
  transitionId?: string;
  routineId?: string;
  returnToTracker?: boolean;
}

export function ActivitySessionActivityChooserScreen({
  transitionId,
  routineId,
  returnToTracker = false,
}: ActivitySessionActivityChooserScreenProps) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const [runtime, setRuntime] = useState<RoutineRuntime | null>(null);
  const [catalog, setCatalog] = useState<CatalogCollection | null>(null);
  const [transition, setTransition] = useState<TimeTransition | null>(null);
  const [folderId, setFolderId] = useState<UUID | null>(null);
  const [routineName, setRoutineName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const lastChoice = useRef<UUID | null | undefined>(undefined);

  const returnToSession = useCallback(() => {
    if (routineId) {
      goBackInAppStack(router, `/routine/${encodeURIComponent(routineId)}`);
    } else if (returnToTracker) {
      router.replace('/');
    } else {
      goBackInAppStack(router, `/activity-session/${encodeURIComponent(transitionId ?? '')}`);
    }
  }, [returnToTracker, router, routineId, transitionId]);

  useEffect(() => {
    let cancelled = false;
    void loadRoutineRuntime()
      .then(async (nextRuntime) => {
        const nextCatalog = await nextRuntime.catalogService.read();
        if (routineId) {
          const active = await nextRuntime.routineService.getActive();
          if (!active || active.routineId !== routineId) {
            throw new Error('This routine is no longer active.');
          }
          if (active.routineSnapshot.trackingMode !== 'overall') {
            throw new Error('Only an overall-tracked routine can replace its activity.');
          }
          return {
            context: null,
            nextCatalog,
            nextRuntime,
            routineName: active.routineSnapshot.name,
          };
        }
        const context = await nextRuntime.trackerService.getTransitionContext(transitionId ?? '');
        return { context, nextCatalog, nextRuntime, routineName: null };
      })
      .then(({ context, nextCatalog, nextRuntime, routineName: nextRoutineName }) => {
        if (cancelled) return;
        setRuntime(nextRuntime);
        setCatalog(nextCatalog);
        setTransition(context?.transition ?? null);
        setRoutineName(nextRoutineName);
        if (!routineId && !context?.transition)
          setError('This activity session is no longer available.');
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(errorText(loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken, routineId, transitionId]);

  const choose = async (activityId: UUID | null) => {
    if (!runtime || busy || (!routineId && !transition) || (routineId && activityId === null))
      return;
    lastChoice.current = activityId;
    setBusy(true);
    setError(null);
    try {
      if (routineId) {
        await runtime.routineService.stopAndReplaceActivity(activityId as UUID);
        router.replace('/');
      } else if (transition) {
        await runtime.trackerStore.getState().reassignTransition(transition.id, activityId);
        if (returnToTracker) router.replace('/');
        else returnToSession();
      }
    } catch (choiceError) {
      setError(errorText(choiceError));
    } finally {
      setBusy(false);
    }
  };

  const retry = () => {
    if (lastChoice.current !== undefined) {
      const choice = lastChoice.current;
      void choose(choice);
      return;
    }
    setError(null);
    setRuntime(null);
    setCatalog(null);
    setTransition(null);
    setFolderId(null);
    setReloadToken((value) => value + 1);
  };

  if (!runtime || !catalog || (!routineId && !transition)) {
    return (
      <Screen onBack={returnToSession} title="Choose activity">
        {error ? (
          <ChooserError message={error}>
            <RecoveryActions
              onClose={returnToSession}
              onRetry={retry}
              testID="activity-session-chooser-recovery"
            />
          </ChooserError>
        ) : (
          <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>
            Loading activity choices...
          </Text>
        )}
      </Screen>
    );
  }

  const items = (
    routineId ? catalog.activities : [...catalog.activities, ...catalog.routines]
  ).sort(sortItems);
  const folders = [...catalog.folders].sort(sortFolders);
  const visibleFolders = folderId === null ? folders : [];
  const visibleItems = items.filter((item) => item.folderId === folderId);
  const currentFolder = folderId === null ? null : folders.find((folder) => folder.id === folderId);
  const currentName = routineId
    ? (routineName ?? 'routine')
    : transition?.activityId
      ? (resolveCatalogItem(catalog, transition.activityId, colors.primary)?.item.name ??
        'Unavailable activity')
      : 'No activity';

  return (
    <Screen
      onBack={() => (folderId === null ? returnToSession() : setFolderId(null))}
      title={currentFolder?.name ?? 'Choose activity'}
    >
      <Column
        spacing={ROW_SURFACE_LIST_GAP}
        style={{ width: '100%' }}
        testID="activity-session-activity-chooser"
      >
        <Text textStyle={{ color: colors.textMuted, fontSize: 15, lineHeight: 21 }}>
          {routineId
            ? `Choose an activity to replace the time logged in ${currentName}.`
            : returnToTracker
              ? 'Choose what to track next.'
              : `Choose a replacement for ${currentName}. Activities and routines are both available.`}
        </Text>

        {folderId === null && !routineId && !returnToTracker ? (
          <AppButton
            disabled={busy}
            label={transition?.activityId === null ? 'No activity (selected)' : 'No activity'}
            onPress={() => void choose(null)}
            style={{ height: 54, width: '100%' }}
            testID="activity-session-choice-none"
            variant="outlined"
          />
        ) : null}

        {visibleFolders.map((folder) => (
          <FolderRow
            key={folder.id}
            disabled={busy}
            folder={displayFolder(folder)}
            onPress={() => setFolderId(folder.id)}
            testID={`activity-session-folder-${folder.id}`}
          />
        ))}

        {visibleItems.map((item) => (
          <ActivityRow
            key={item.id}
            active={transition?.activityId === item.id}
            color={resolveCatalogItem(catalog, item.id, colors.primary)?.displayColor}
            disabled={busy}
            item={displayItem(item)}
            onPress={() => void choose(item.id)}
            testID={`activity-session-choice-${item.id}`}
          />
        ))}

        {visibleFolders.length === 0 && visibleItems.length === 0 ? (
          <Column
            spacing={6}
            style={{
              backgroundColor: colors.surfaceMuted,
              borderColor: colors.border,
              borderRadius: 14,
              borderWidth: 1,
              padding: 16,
              width: '100%',
            }}
          >
            <Text textStyle={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>
              Nothing available here
            </Text>
            <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
              Add an activity or routine to the catalog before choosing it.
            </Text>
          </Column>
        ) : null}

        {error ? (
          <ChooserError message={error}>
            <RecoveryActions
              onClose={returnToSession}
              onRetry={retry}
              testID="activity-session-chooser-action-recovery"
            />
          </ChooserError>
        ) : null}
      </Column>
    </Screen>
  );
}
