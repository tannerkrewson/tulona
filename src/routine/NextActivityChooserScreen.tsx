import { Column, Row, Text } from '@expo/ui';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import type { ActiveRoutine, CatalogCollection, UUID } from '@domain';
import { AppIcon, type IconName } from '@icons';
import { useAppTheme } from '@theme';
import { RecoveryActions } from '../orchestration/RecoveryActions';
import { AppButton, errorText, Screen } from '@ui';

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
      <Screen scrollable={false}>
        <Column alignment="center" spacing={16} style={{ width: '100%' }}>
          <AppIcon name="repeat" color={colors.primary} size={40} />
          <Text textStyle={{ color: colors.text, fontSize: 25, fontWeight: '700' }}>
            What are you doing now?
          </Text>
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
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const items = [...catalog.activities, ...catalog.routines]
    .filter((item) => item.archivedAt === null && item.folderId === folderId)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const visibleFolders = folderId === null ? folders : [];
  const title = folderId === null ? 'Choose your next activity' : 'Choose from this folder';

  return (
    <Screen>
      <Column spacing={18} style={{ width: '100%' }}>
        <Row alignment="center" spacing={12}>
          <Column
            style={{
              backgroundColor: colors.active.background,
              borderRadius: 12,
              padding: 10,
            }}
          >
            <AppIcon name="repeat" color={colors.active.foreground} size={23} />
          </Column>
          <Column spacing={3}>
            <Text
              numberOfLines={2}
              textStyle={{ color: colors.text, fontSize: 25, fontWeight: '700' }}
            >
              What are you doing now?
            </Text>
            <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
              {`${active.routineSnapshot.name} completed at ${shortTime(active.completedAt)}`}
            </Text>
          </Column>
        </Row>
        <Text textStyle={{ color: colors.textMuted, fontSize: 16, lineHeight: 22 }}>
          Choose the next tracked item. This choice is recorded at the routine completion time, not
          now.
        </Text>
        {folderId !== null ? (
          <AppButton
            disabled={busy}
            label="Back to root"
            onPress={() => setFolderId(null)}
            style={{ height: 48, width: '100%' }}
            variant="outlined"
            testID="chooser-back"
          />
        ) : null}
        <Text textStyle={{ color: colors.text, fontSize: 19, fontWeight: '700' }}>{title}</Text>
        {visibleFolders.map((folder) => (
          <ChooserItem
            key={folder.id}
            iconName={(folder.iconName || 'folder') as IconName}
            label={folder.name}
            actionLabel="Open folder"
            disabled={busy}
            onPress={() => setFolderId(folder.id)}
            testID={`chooser-folder-${folder.id}`}
          />
        ))}
        {items.map((item) => (
          <ChooserItem
            key={item.id}
            iconName={
              (item.iconName || (item.kind === 'routine' ? 'repeat' : 'activity')) as IconName
            }
            label={item.name}
            actionLabel="Choose"
            disabled={busy}
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

function ChooserItem({
  iconName,
  label,
  actionLabel,
  disabled,
  onPress,
  testID,
}: {
  iconName: IconName;
  label: string;
  actionLabel: string;
  disabled: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useAppTheme();
  return (
    <Column
      spacing={8}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 14,
        borderWidth: 1,
        padding: 14,
        width: '100%',
      }}
    >
      <Row alignment="center" spacing={10}>
        <AppIcon name={iconName} color={colors.primary} size={24} />
        <Text textStyle={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>{label}</Text>
      </Row>
      <AppButton
        disabled={disabled}
        label={actionLabel}
        onPress={onPress}
        style={{ height: 50, width: '100%' }}
        variant="outlined"
        testID={testID}
      />
    </Column>
  );
}
