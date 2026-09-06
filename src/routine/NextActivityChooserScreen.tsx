import { Column, Text } from '@expo/ui';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import type { ActiveRoutine, CatalogCollection, UUID } from '@domain';
import { useAppTheme } from '@theme';
import { AppButton, errorText, Screen } from '@ui';
import { RecoveryActions } from '../orchestration/RecoveryActions';
import { resolveCatalogItem } from '../catalog/catalog-service';
import { ActivityRow } from '../tracker/ActivityRow';
import { FolderRow } from '../tracker/FolderRow';

import { loadRoutineRuntime, type RoutineRuntime } from './routine-runtime';

function shortTime(timestamp: string | null): string {
  return timestamp
    ? new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : 'unknown time';
}

function ChooserError({ message, children }: { message: string | null; children?: ReactNode }) {
  const { colors } = useAppTheme();
  if (!message) return null;
  return (
    <Column
      spacing={6}
      style={{
        backgroundColor: colors.danger.background,
        borderColor: colors.danger.foreground,
        borderRadius: 14,
        borderWidth: 1,
        padding: 16,
        width: '100%',
      }}
    >
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 16, fontWeight: '700' }}>
        Chooser unavailable
      </Text>
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{message}</Text>
      {children}
    </Column>
  );
}

export function NextActivityChooserScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const [runtime, setRuntime] = useState<RoutineRuntime | null>(null);
  const [active, setActive] = useState<ActiveRoutine | null>(null);
  const [catalog, setCatalog] = useState<CatalogCollection | null>(null);
  const [folderId, setFolderId] = useState<UUID | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastChoice = useRef<UUID | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setError(null);
    void loadRoutineRuntime()
      .then(async (nextRuntime) => {
        const restored = await nextRuntime.routineService.recover();
        const nextCatalog = await nextRuntime.catalogService.read();
        return { nextRuntime, restored, nextCatalog };
      })
      .then(({ nextRuntime, restored, nextCatalog }) => {
        if (cancelled) return;
        setRuntime(nextRuntime);
        setCatalog(nextCatalog);
        if (!restored) {
          setError('There is no routine awaiting a next activity.');
        } else if (restored.status !== 'awaiting-next-activity') {
          router.replace(`/routine/${restored.routineId}`);
        } else {
          setActive(restored);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(errorText(loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void Promise.resolve().then(() => {
      if (!disposed) cleanup = load();
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [load]);

  const choose = async (activityId: UUID) => {
    if (!runtime) return;
    lastChoice.current = activityId;
    setBusy(true);
    setError(null);
    try {
      await runtime.routineService.selectNextActivity(activityId);
      router.replace('/(tabs)');
    } catch (choiceError) {
      setError(errorText(choiceError));
    } finally {
      setBusy(false);
    }
  };

  if (!active || !catalog) {
    return (
      <Screen onBack={() => router.replace('/(tabs)')} title="Choose activity" scrollable={false}>
        <Column alignment="center" spacing={16} style={{ width: '100%' }}>
          <ChooserError message={error ?? 'Restoring the next-activity chooser...'}>
            <RecoveryActions
              onBack={() => router.replace('/(tabs)')}
              onRetry={load}
              testID="chooser-recovery"
            />
          </ChooserError>
        </Column>
      </Screen>
    );
  }

  const folders = [...catalog.folders]
    .filter((folder) => folder.archivedAt === null)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
  const items = [...catalog.activities, ...catalog.routines]
    .filter((item) => item.archivedAt === null && item.folderId === folderId)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
  const visibleFolders = folderId === null ? folders : [];
  const currentFolder = folderId ? folders.find((folder) => folder.id === folderId) : null;
  const title = currentFolder?.name ?? 'Choose activity';

  return (
    <Screen
      onBack={() => (folderId === null ? router.replace('/(tabs)') : setFolderId(null))}
      title={title}
    >
      <Column spacing={18} style={{ width: '100%' }}>
        <Text textStyle={{ color: colors.textMuted, fontSize: 16, lineHeight: 22 }}>
          {`${active.routineSnapshot.name} completed at ${shortTime(active.completedAt)}. Choose the next tracked item.`}
        </Text>
        {visibleFolders.map((folder) => (
          <FolderRow
            key={folder.id}
            disabled={busy}
            folder={folder}
            onPress={() => setFolderId(folder.id)}
            testID={`chooser-folder-${folder.id}`}
          />
        ))}
        {items.map((item) => (
          <ActivityRow
            key={item.id}
            active={false}
            color={resolveCatalogItem(catalog, item.id)?.displayColor}
            disabled={busy}
            item={item}
            onPress={() => void choose(item.id)}
            testID={`chooser-item-${item.id}`}
          />
        ))}
        {visibleFolders.length === 0 && items.length === 0 ? (
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
        <ChooserError message={error}>
          <RecoveryActions
            onBack={() => router.replace('/(tabs)')}
            onRetry={() => {
              if (lastChoice.current) void choose(lastChoice.current);
              else load();
            }}
            testID="chooser-action-recovery"
          />
        </ChooserError>
        <AppButton
          disabled={busy}
          label="Decide later"
          onPress={() => router.replace('/(tabs)')}
          style={{ height: 48, width: '100%' }}
          variant="outlined"
          testID="chooser-decide-later"
        />
      </Column>
    </Screen>
  );
}
