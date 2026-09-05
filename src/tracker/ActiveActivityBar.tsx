import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@expo/ui';
import { usePathname, useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';

import { timestampMs, type CatalogCollection, type TimeTransition } from '@domain';
import { AppIcon } from '@icons';
import { getAccessibleTextColor, useAppTheme } from '@theme';
import { DurationText, errorText, isIOSSafari } from '@ui';

import { resolveCatalogItem } from '../catalog/catalog-service';
import { loadRoutineRuntime, type RoutineRuntime } from '../routine/routine-runtime';

function isCatalogPath(pathname: string): boolean {
  return pathname === '/' || /^\/folder\/[^/]+$/.test(pathname);
}

function activeItem(
  catalog: CatalogCollection | null,
  transition: TimeTransition | null
): ReturnType<typeof resolveCatalogItem> {
  if (!catalog || !transition?.activityId) return null;
  return resolveCatalogItem(catalog, transition.activityId);
}

/** Loads once at the shell boundary so the player survives catalog navigation. */
export function ActiveActivityBar() {
  const pathname = usePathname();
  const catalogVisible = isCatalogPath(pathname);
  const [runtime, setRuntime] = useState<RoutineRuntime | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!catalogVisible) return undefined;

    let cancelled = false;
    void loadRoutineRuntime()
      .then((nextRuntime) => {
        if (cancelled) return;
        setError(null);
        setRuntime(nextRuntime);
        return nextRuntime.trackerStore.getState().hydrate();
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(errorText(loadError));
      });

    return () => {
      cancelled = true;
    };
  }, [catalogVisible]);

  if (!catalogVisible || !runtime || error) return null;
  return <ActiveActivityBarContent pathname={pathname} runtime={runtime} />;
}

function ActiveActivityBarContent({
  pathname,
  runtime,
}: {
  pathname: string;
  runtime: RoutineRuntime;
}) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const iOSSafari = isIOSSafari();
  const webSurface =
    Platform.OS === 'web' ? ('var(--tulona-surface)' as unknown as string) : colors.surface;
  const webBorder =
    Platform.OS === 'web' ? ('var(--tulona-border)' as unknown as string) : colors.border;
  const [activeState, setActiveState] = useState<{
    catalog: CatalogCollection | null;
    activeTransition: TimeTransition | null;
  }>({ catalog: null, activeTransition: null });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const activeTransition = activeState.activeTransition;
  const catalog = activeState.catalog;

  useEffect(() => {
    let cancelled = false;
    const reconcile = async () => {
      try {
        const [nextCatalog, nextTransition] = await Promise.all([
          runtime.catalogService.read(),
          runtime.trackerService.getActiveTransition(),
        ]);
        if (!cancelled) setActiveState({ catalog: nextCatalog, activeTransition: nextTransition });
      } catch {
        // The catalog screen owns the visible persistence error surface.
      }
    };
    void reconcile();
    const timer = setInterval(() => void reconcile(), 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [runtime]);

  useEffect(() => {
    if (!activeTransition) return undefined;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [activeTransition]);

  if (!activeTransition || activeTransition.activityId === null) return null;

  const resolved = activeItem(catalog, activeTransition);
  const name = resolved?.item.name ?? 'Current activity';
  const context = resolved?.folder?.name ?? 'Activities';
  const elapsedMs = Math.max(0, nowMs - timestampMs(activeTransition.timestamp));
  const configuredColor = resolved?.item.color ?? resolved?.displayColor;
  const accent =
    configuredColor && /^#[0-9a-f]{6}$/i.test(configuredColor.trim())
      ? configuredColor.trim()
      : colors.primary;
  const onAccent = getAccessibleTextColor(accent);

  const pause = async () => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const activeRoutine = await runtime.routineService.getActive();
      if (activeRoutine?.status === 'running') {
        await runtime.routineService.pause();
        if (await runtime.trackerService.getActiveTransition()) {
          await runtime.trackerService.switchActivity(null);
        }
      } else {
        await runtime.trackerService.switchActivity(null);
      }
      await runtime.trackerStore.getState().refresh();
      setActiveState((current) => ({ ...current, activeTransition: null }));
    } catch (pauseError) {
      setActionError(errorText(pauseError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.overlay]}>
      <View
        style={[
          styles.bar,
          {
            backgroundColor: webSurface,
            borderColor: webBorder,
            bottom: iOSSafari
              ? (`calc(${pathname === '/' ? 82 : 14}px + var(--tulona-safe-area-bottom))` as unknown as number)
              : pathname === '/'
                ? 82
                : 14,
            // Keep the pill above the home indicator without changing desktop spacing.
            paddingBottom: iOSSafari ? ('var(--tulona-safe-area-bottom)' as unknown as number) : 0,
          },
        ]}
        testID="active-activity-bar"
      >
        <Pressable
          accessibilityLabel="Pause active activity"
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void pause()}
          style={[styles.pauseButton, { backgroundColor: accent }]}
        >
          <AppIcon
            accessibilityLabel="Pause"
            color={onAccent}
            name="pause"
            size={25}
            strokeWidth={3}
          />
        </Pressable>
        <Pressable
          accessibilityLabel={`Open ${name} session details`}
          accessibilityRole="button"
          onPress={() => router.push(`/activity-session/${activeTransition.id}` as Href)}
          style={styles.info}
          testID="active-activity-details"
        >
          <View style={styles.infoRow}>
            <View style={styles.infoText}>
              <Text
                numberOfLines={1}
                textStyle={{ color: colors.textMuted, fontSize: 11, fontWeight: '800' }}
              >
                {context.toUpperCase()}
              </Text>
              <Text
                numberOfLines={1}
                textStyle={{ color: colors.text, fontSize: 18, fontWeight: '700' }}
              >
                {name}
              </Text>
              {actionError ? (
                <Text
                  numberOfLines={1}
                  textStyle={{ color: colors.danger.foreground, fontSize: 11 }}
                >
                  {actionError}
                </Text>
              ) : null}
            </View>
            <DurationText
              durationMs={elapsedMs}
              textStyle={{ color: colors.text, fontSize: 15, fontWeight: '700' }}
            />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    maxWidth: 720,
    overflow: 'hidden',
    position: 'absolute',
    width: '94%',
  },
  info: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  infoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minWidth: 0,
  },
  infoText: {
    flex: 1,
    minWidth: 0,
  },
  overlay: {
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  pauseButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 68,
  },
});
