import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@expo/ui';
import { usePathname, useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';

import {
  timestampMs,
  type ActiveRoutine,
  type CatalogCollection,
  type TimeTransition,
} from '@domain';
import { AppIcon } from '@icons';
import { getAccessibleTextColor, useAppTheme } from '@theme';
import { DurationText, errorText } from '@ui';

import { resolveCatalogItem } from '../catalog/catalog-service';
import { loadRoutineRuntime, type RoutineRuntime } from '../routine/routine-runtime';

function isCatalogPath(pathname: string): boolean {
  return pathname === '/' || /^\/folder\/[^/]+$/.test(pathname);
}

const TAB_BAR_HEIGHT = 64;
const ACTIVE_BAR_GAP = 18;
const ACTIVE_BAR_BOTTOM = TAB_BAR_HEIGHT + ACTIVE_BAR_GAP;
const ACTIVE_BAR_HEIGHT = 64;

function activeItem(
  catalog: CatalogCollection | null,
  transition: TimeTransition | null
): ReturnType<typeof resolveCatalogItem> {
  if (!catalog || !transition?.activityId) return null;
  return resolveCatalogItem(catalog, transition.activityId);
}

function routineOwnsActivity(routine: ActiveRoutine, activityId: string): boolean {
  if (routine.routineSnapshot.trackingMode === 'overall') {
    return routine.routineId === activityId;
  }
  return routine.routineSnapshot.steps.some((step) => step.activityId === activityId);
}

/** Finds the persisted length of an idle activity session from its next stop/switch. */
function activityDurationMs(
  transitions: readonly TimeTransition[],
  transition: TimeTransition
): number {
  try {
    const startMs = timestampMs(transition.timestamp);
    const index = transitions.findIndex((candidate) => candidate.id === transition.id);
    if (index < 0) return 0;
    const following = transitions.slice(index + 1).find((candidate) => {
      if (candidate.status !== 'recorded') return false;
      return timestampMs(candidate.timestamp) >= startMs;
    });
    return following ? Math.max(0, timestampMs(following.timestamp) - startMs) : 0;
  } catch {
    return 0;
  }
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
  return <ActiveActivityBarContent runtime={runtime} />;
}

function ActiveActivityBarContent({ runtime }: { runtime: RoutineRuntime }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const isWeb = Platform.OS === 'web';
  const webSurface = 'var(--tulona-surface)';
  const webBorder = 'var(--tulona-border)';
  const store = runtime.trackerStore;
  const catalog = store((state) => state.catalog);
  const activeTransition = store((state) => state.activeTransition);
  const lastActivityTransition = store((state) => state.lastActivityTransition);
  const transitions = store((state) => state.transitions);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const isActive = activeTransition !== null && activeTransition.activityId !== null;
  const activeTransitionId = isActive ? activeTransition.id : null;
  const activeTransitionTimestamp = isActive ? activeTransition.timestamp : null;

  useEffect(() => {
    if (!isActive || activeTransitionTimestamp === null) return undefined;
    const updateNow = () => setNowMs(Date.now());
    updateNow();
    const timer = setInterval(updateNow, 1000);
    return () => clearInterval(timer);
  }, [activeTransitionId, activeTransitionTimestamp, isActive]);

  const displayedTransition = isActive ? activeTransition : lastActivityTransition;
  if (!displayedTransition || displayedTransition.activityId === null) return null;

  const resolved = activeItem(catalog, displayedTransition);
  const activeActivityId = displayedTransition.activityId;
  const name = resolved?.item.name ?? 'Current activity';
  const context = resolved?.folder?.name ?? null;
  const elapsedMs = isActive ? Math.max(0, nowMs - timestampMs(displayedTransition.timestamp)) : 0;
  const previousDurationMs = isActive ? 0 : activityDurationMs(transitions, displayedTransition);
  const configuredColor = resolved?.item.color ?? resolved?.displayColor;
  const accent =
    configuredColor && /^#[0-9a-f]{6}$/i.test(configuredColor.trim())
      ? configuredColor.trim()
      : colors.primary;
  const onAccent = getAccessibleTextColor(accent);

  const openDetails = async () => {
    let activeRoutine: ActiveRoutine | null = null;
    try {
      activeRoutine = await runtime.routineService.getActive();
    } catch {
      // Fall back to the session view if routine state is temporarily unavailable.
    }
    const destination =
      activeRoutine && routineOwnsActivity(activeRoutine, activeActivityId)
        ? `/routine/${activeRoutine.routineId}`
        : `/activity-session/${displayedTransition.id}`;
    router.push(destination as Href);
  };

  const pause = async () => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const activeRoutine = await runtime.routineService.getActive();
      if (activeRoutine?.status === 'running') {
        await runtime.routineService.pause();
      }
      const current = await runtime.trackerService.getActiveTransition();
      if (current && current.activityId !== null) {
        await store.getState().switchActivity(null);
      } else {
        await store.getState().refresh();
      }
    } catch (pauseError) {
      setActionError(errorText(pauseError));
    } finally {
      setBusy(false);
    }
  };

  const play = async () => {
    const activityId = lastActivityTransition?.activityId;
    if (busy || activityId === undefined || activityId === null) return;
    setBusy(true);
    setActionError(null);
    try {
      const activeRoutine = await runtime.routineService.getActive();
      if (activeRoutine?.status === 'paused' && routineOwnsActivity(activeRoutine, activityId)) {
        await runtime.routineService.resume();
        await store.getState().switchActivity(activityId, { source: 'routine' });
        router.push(`/routine/${activeRoutine.routineId}` as Href);
      } else if (resolved?.item.kind === 'routine' && activeRoutine === null) {
        await runtime.routineService.startRoutine(resolved.item.id);
        router.push(`/routine/${resolved.item.id}` as Href);
      } else {
        await store.getState().switchActivity(activityId);
      }
    } catch (playError) {
      setActionError(errorText(playError));
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
            backgroundColor: isWeb ? webSurface : colors.surface,
            borderColor: isWeb ? webBorder : colors.border,
            // Keep the pill a fixed gap above the tab bar. The web tab bar's
            // CSS height includes the cold-start-safe home-indicator inset.
            bottom: (isWeb
              ? `calc(${ACTIVE_BAR_BOTTOM}px + var(--tulona-safe-area-bottom))`
              : ACTIVE_BAR_BOTTOM) as unknown as number,
            height: ACTIVE_BAR_HEIGHT,
          },
        ]}
        testID="active-activity-bar"
      >
        <Pressable
          accessibilityHint={
            isActive ? undefined : 'Starts a new tracking session for this activity'
          }
          accessibilityLabel={isActive ? 'Pause active activity' : `Start ${name}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => void (isActive ? pause() : play())}
          style={[styles.pauseButton, { backgroundColor: isActive ? accent : colors.surfaceMuted }]}
          testID={isActive ? 'active-activity-pause' : 'active-activity-play'}
        >
          <AppIcon
            accessibilityLabel={isActive ? 'Pause' : 'Play'}
            color={isActive ? onAccent : accent}
            fill={isActive ? 'none' : accent}
            name={isActive ? 'pause' : 'play'}
            size={25}
            strokeWidth={isActive ? 3 : 0}
          />
        </Pressable>
        <Pressable
          accessibilityLabel={`Open ${name} session details`}
          accessibilityRole="button"
          onPress={() => void openDetails()}
          style={styles.info}
          testID="active-activity-details"
        >
          <View style={styles.infoRow}>
            <View style={styles.infoText}>
              {context ? (
                <Text
                  numberOfLines={1}
                  textStyle={{ color: colors.textMuted, fontSize: 11, fontWeight: '800' }}
                >
                  {context}
                </Text>
              ) : null}
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
              durationMs={isActive ? elapsedMs : previousDurationMs}
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
    justifyContent: 'center',
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
