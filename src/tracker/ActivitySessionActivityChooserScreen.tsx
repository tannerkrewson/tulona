import { Column, Text } from '@expo/ui';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import type { CatalogCollection, Folder, TimeTransition, TrackableItem, UUID } from '@domain';
import { useAppTheme } from '@theme';
import { AppButton, errorText, Screen } from '@ui';

import { resolveCatalogItem } from '../catalog/catalog-service';
import { RecoveryActions } from '../orchestration/RecoveryActions';
import { loadRoutineRuntime, type RoutineRuntime } from '../routine/routine-runtime';
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
  transitionId: string;
}

export function ActivitySessionActivityChooserScreen({
  transitionId,
}: ActivitySessionActivityChooserScreenProps) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const [runtime, setRuntime] = useState<RoutineRuntime | null>(null);
  const [catalog, setCatalog] = useState<CatalogCollection | null>(null);
  const [transition, setTransition] = useState<TimeTransition | null>(null);
  const [folderId, setFolderId] = useState<UUID | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const lastChoice = useRef<UUID | null | undefined>(undefined);

  const returnToSession = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(`/activity-session/${encodeURIComponent(transitionId)}`);
  }, [router, transitionId]);

  useEffect(() => {
    let cancelled = false;
    void loadRoutineRuntime()
      .then(async (nextRuntime) => {
        const [nextCatalog, context] = await Promise.all([
          nextRuntime.catalogService.read(),
          nextRuntime.trackerService.getTransitionContext(transitionId),
        ]);
        return { context, nextCatalog, nextRuntime };
      })
      .then(({ context, nextCatalog, nextRuntime }) => {
        if (cancelled) return;
        setRuntime(nextRuntime);
        setCatalog(nextCatalog);
        setTransition(context.transition);
        if (!context.transition) setError('This activity session is no longer available.');
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(errorText(loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken, transitionId]);

  const choose = async (activityId: UUID | null) => {
    if (!runtime || !transition || busy) return;
    lastChoice.current = activityId;
    setBusy(true);
    setError(null);
    try {
      await runtime.trackerStore.getState().reassignTransition(transition.id, activityId);
      returnToSession();
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

  if (!runtime || !catalog || !transition) {
    return (
      <Screen onBack={returnToSession} title="Choose activity">
        {error ? (
          <ChooserError message={error}>
            <RecoveryActions
              onBack={returnToSession}
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

  const items = [...catalog.activities, ...catalog.routines].sort(sortItems);
  const folders = [...catalog.folders].sort(sortFolders);
  const visibleFolders = folderId === null ? folders : [];
  const visibleItems = items.filter((item) => item.folderId === folderId);
  const currentFolder = folderId === null ? null : folders.find((folder) => folder.id === folderId);
  const currentName = transition.activityId
    ? (resolveCatalogItem(catalog, transition.activityId)?.item.name ?? 'Unavailable activity')
    : 'No activity';

  return (
    <Screen
      onBack={() => (folderId === null ? returnToSession() : setFolderId(null))}
      title={currentFolder?.name ?? 'Choose activity'}
    >
      <Column spacing={16} style={{ width: '100%' }} testID="activity-session-activity-chooser">
        <Text textStyle={{ color: colors.textMuted, fontSize: 15, lineHeight: 21 }}>
          {`Choose a replacement for ${currentName}. Activities and routines are both available.`}
        </Text>

        {folderId === null ? (
          <AppButton
            disabled={busy}
            label={transition.activityId === null ? 'No activity (selected)' : 'No activity'}
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
            active={transition.activityId === item.id}
            color={resolveCatalogItem(catalog, item.id)?.displayColor}
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
              onBack={returnToSession}
              onRetry={retry}
              testID="activity-session-chooser-action-recovery"
            />
          </ChooserError>
        ) : null}
      </Column>
    </Screen>
  );
}
