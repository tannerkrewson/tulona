import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter, type Href } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';

import {
  formatCountdownMs,
  timestampMs,
  type ActiveRoutine,
  type CatalogCollection,
  type TimeTransition,
} from '@domain';
import { AppIcon } from '@icons';
import { getAccessibleTextColor, useAppTheme } from '@theme';
import { DurationText, errorText, formatDuration } from '@ui';

import { resolveCatalogItem } from '../catalog/catalog-service';
import { routineTiming } from '../routine/routine-engine';
import { routineOwnsActivity } from '../routine/routine-visuals';
import { loadRoutineRuntime, type RoutineRuntime } from '../routine/routine-runtime';

function isCatalogPath(pathname: string): boolean {
  return pathname === '/' || /^\/folder\/[^/]+$/.test(pathname);
}

const TAB_BAR_HEIGHT = 64;
export const ACTIVE_ACTIVITY_BAR_HEIGHT = 64;
const ACTIVE_BAR_BOTTOM = TAB_BAR_HEIGHT;

export type ActiveActivityBarPlacement = 'overlay' | 'accessory';
export type AccessoryPlacement = 'regular' | 'inline';

/** iOS 26+ hosts the activity control inside the system tab bar accessory. */
export function supportsNativeBottomAccessory(): boolean {
  return Platform.OS === 'ios' && Number.parseInt(String(Platform.Version), 10) >= 26;
}

/** Loads the shared tracker runtime once and hydrates its store. */
export function useActiveActivityRuntime(enabled = true): RoutineRuntime | null {
  const [runtime, setRuntime] = useState<RoutineRuntime | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    void loadRoutineRuntime()
      .then((nextRuntime) => {
        if (cancelled) return;
        setRuntime(nextRuntime);
        return nextRuntime.trackerStore.getState().hydrate();
      })
      .catch(() => {
        if (!cancelled) setRuntime(null);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return runtime;
}

const noopSubscribe = () => () => undefined;

/** Whether there is a current or most recent activity session to show. */
export function useHasActivitySession(runtime: RoutineRuntime | null): boolean {
  const store = runtime?.trackerStore ?? null;
  return useSyncExternalStore(store ? store.subscribe : noopSubscribe, () => {
    if (!store) return false;
    const { activeTransition, lastActivityTransition } = store.getState();
    const displayed =
      activeTransition && activeTransition.activityId !== null
        ? activeTransition
        : lastActivityTransition;
    return Boolean(displayed && displayed.activityId !== null);
  });
}

function activeItem(
  catalog: CatalogCollection | null,
  transition: TimeTransition | null,
  baseColor: string
): ReturnType<typeof resolveCatalogItem> {
  if (!catalog || !transition?.activityId) return null;
  return resolveCatalogItem(catalog, transition.activityId, baseColor);
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

/** The in-app overlay above the JavaScript tab bar, shown on catalog screens. */
export function ActiveActivityBar() {
  const pathname = usePathname();
  const usesAccessory = supportsNativeBottomAccessory();
  const catalogVisible = isCatalogPath(pathname);
  const runtime = useActiveActivityRuntime(catalogVisible && !usesAccessory);

  if (usesAccessory || !catalogVisible || !runtime) return null;
  return <ActiveActivityBarContent placement="overlay" runtime={runtime} />;
}

/** The activity control rendered inside the native tab bar's bottom accessory. */
export function ActiveActivityAccessory({
  accessoryPlacement,
  runtime,
}: {
  accessoryPlacement: AccessoryPlacement;
  runtime: RoutineRuntime;
}) {
  return (
    <ActiveActivityBarContent
      accessoryPlacement={accessoryPlacement}
      placement="accessory"
      runtime={runtime}
    />
  );
}

function ActiveActivityBarContent({
  accessoryPlacement = 'regular',
  placement,
  runtime,
}: {
  accessoryPlacement?: AccessoryPlacement;
  placement: ActiveActivityBarPlacement;
  runtime: RoutineRuntime;
}) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const isWeb = Platform.OS === 'web';
  const isAccessory = placement === 'accessory';
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
  const [activeRoutine, setActiveRoutine] = useState<ActiveRoutine | null>(null);
  const [accessoryHeight, setAccessoryHeight] = useState<number | null>(null);
  const isActive = activeTransition !== null && activeTransition.activityId !== null;
  const activeTransitionId = isActive ? activeTransition.id : null;
  const activeTransitionTimestamp = isActive ? activeTransition.timestamp : null;

  useEffect(() => {
    let cancelled = false;
    void runtime.routineService
      .getActive()
      .then((nextRoutine) => {
        if (!cancelled) setActiveRoutine(nextRoutine);
      })
      .catch(() => {
        if (!cancelled) setActiveRoutine(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTransitionId, runtime]);

  useEffect(() => {
    if (!isActive || activeTransitionTimestamp === null) return undefined;
    const updateNow = () => setNowMs(Date.now());
    updateNow();
    const timer = setInterval(updateNow, 1000);
    return () => clearInterval(timer);
  }, [activeTransitionId, activeTransitionTimestamp, isActive]);

  const displayedTransition = isActive ? activeTransition : lastActivityTransition;
  if (!displayedTransition || displayedTransition.activityId === null) return null;

  const resolved = activeItem(catalog, displayedTransition, colors.primary);
  const activeActivityId = displayedTransition.activityId;
  const name = resolved?.item.name ?? 'Current activity';
  const context = resolved?.folder?.name ?? null;
  const elapsedMs = isActive ? Math.max(0, nowMs - timestampMs(displayedTransition.timestamp)) : 0;
  const previousDurationMs = isActive ? 0 : activityDurationMs(transitions, displayedTransition);
  const configuredColor = resolved?.displayColor;
  const accent =
    configuredColor && /^#[0-9a-f]{6}$/i.test(configuredColor.trim())
      ? configuredColor.trim()
      : colors.primary;
  const onAccent = getAccessibleTextColor(accent);
  const routineInFocus =
    activeRoutine !== null &&
    (activeRoutine.status === 'running' || activeRoutine.status === 'paused') &&
    routineOwnsActivity(activeRoutine, activeActivityId);
  const routineSteps = routineInFocus
    ? [...activeRoutine.routineSnapshot.steps].sort(
        (left, right) => left.sortOrder - right.sortOrder
      )
    : [];
  const routineStep = routineInFocus ? routineSteps[activeRoutine.currentStepIndex] : null;
  const routineTimingValue = routineInFocus ? routineTiming(activeRoutine, nowMs) : null;
  const routineTimer = routineTimingValue
    ? routineTimingValue.remainingMs === null
      ? '—'
      : routineTimingValue.isOvertime
        ? `+${formatCountdownMs(routineTimingValue.overtimeMs)}`
        : formatCountdownMs(routineTimingValue.remainingMs)
    : null;
  const displayName = routineInFocus
    ? (routineStep?.name ??
      catalog?.activities.find((item) => item.id === routineStep?.activityId)?.name ??
      'Routine step')
    : name;
  const displayContext = routineInFocus ? activeRoutine.routineSnapshot.name : context;
  const pausedRoutineStep =
    activeRoutine?.status === 'paused'
      ? [...activeRoutine.routineSnapshot.steps].sort(
          (left, right) => left.sortOrder - right.sortOrder
        )[activeRoutine.currentStepIndex]
      : null;
  const pausedRoutineStepName =
    pausedRoutineStep?.name ??
    (pausedRoutineStep?.activityId
      ? catalog?.activities.find((item) => item.id === pausedRoutineStep.activityId)?.name
      : null) ??
    'Routine step';
  const pausedRoutineTiming =
    activeRoutine?.status === 'paused' ? routineTiming(activeRoutine, nowMs) : null;
  const pausedRoutineRemainingMs = pausedRoutineTiming?.remainingMs;
  const pausedRoutineTimer =
    pausedRoutineRemainingMs === null || pausedRoutineRemainingMs === undefined
      ? '—'
      : pausedRoutineTiming?.isOvertime
        ? `+${formatCountdownMs(pausedRoutineTiming.overtimeMs)}`
        : formatCountdownMs(pausedRoutineRemainingMs);

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
      } else {
        await runtime.routineService.switchToActivity(null);
      }
      await store.getState().refresh();
      setActiveRoutine(await runtime.routineService.getActive());
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
        const resumed = await runtime.routineService.resume();
        setActiveRoutine(resumed);
        await store.getState().refresh();
        router.push(`/routine/${activeRoutine.routineId}` as Href);
      } else if (resolved?.item.kind === 'routine') {
        const started = await runtime.routineService.startRoutine(resolved.item.id);
        setActiveRoutine(started);
        await store.getState().refresh();
        router.push(`/routine/${started.routineId}` as Href);
      } else {
        await runtime.routineService.switchToActivity(activityId);
        setActiveRoutine(await runtime.routineService.getActive());
        await store.getState().refresh();
      }
    } catch (playError) {
      setActionError(errorText(playError));
    } finally {
      setBusy(false);
    }
  };

  const resumePausedRoutine = async () => {
    if (busy || activeRoutine?.status !== 'paused') return;
    setBusy(true);
    setActionError(null);
    try {
      const resumed = await runtime.routineService.resume();
      setActiveRoutine(resumed);
      await store.getState().refresh();
      router.push(`/routine/${resumed.routineId}` as Href);
    } catch (resumeError) {
      setActionError(errorText(resumeError));
    } finally {
      setBusy(false);
    }
  };

  const showResumeRoutine = activeRoutine?.status === 'paused' && !routineInFocus;

  const showSwitch = isActive && !routineInFocus;

  const togglePrimary = () => {
    if (routineInFocus && activeRoutine.status === 'paused') {
      void resumePausedRoutine();
    } else if (showSwitch) {
      router.push(`/activity-session/${displayedTransition.id}?action=switch` as Href);
    } else if (isActive) {
      void pause();
    } else {
      void play();
    }
  };

  const primaryLabel =
    routineInFocus && activeRoutine.status === 'paused'
      ? `Resume ${activeRoutine.routineSnapshot.name}`
      : showSwitch
        ? 'Switch activity'
        : isActive
          ? `Pause ${activeRoutine?.routineSnapshot.name ?? 'routine'}`
          : `Start ${name}`;
  const primaryIcon =
    routineInFocus && activeRoutine.status === 'paused'
      ? 'play'
      : showSwitch
        ? 'arrow-right-left'
        : isActive
          ? 'pause'
          : 'play';
  const primaryFilled = primaryIcon !== 'arrow-right-left';
  const primaryTestID = showSwitch
    ? 'active-activity-switch'
    : isActive
      ? 'active-activity-pause'
      : 'active-activity-play';
  const titleText =
    routineInFocus && activeRoutine.status === 'paused' ? `Paused · ${displayName}` : displayName;
  const timerText =
    routineInFocus && routineTimer !== null
      ? routineTimer
      : formatDuration(isActive ? elapsedMs : previousDurationMs);

  if (isAccessory) {
    const inline = accessoryPlacement === 'inline';
    const buttonSize = accessoryHeight
      ? accessoryHeight - ACCESSORY_BUTTON_INSET * 2
      : inline
        ? 32
        : 40;
    return (
      <View
        onLayout={(event) => setAccessoryHeight(Math.round(event.nativeEvent.layout.height))}
        style={[styles.accessoryRow, inline && styles.accessoryRowInline]}
      >
        <Pressable
          accessibilityHint={
            isActive ? undefined : 'Starts a new tracking session for this activity'
          }
          accessibilityLabel={primaryLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          hitSlop={8}
          onPress={togglePrimary}
          style={({ pressed }) => [
            styles.accessoryButton,
            {
              backgroundColor: isActive ? accent : colors.surfaceMuted,
              borderRadius: buttonSize / 2,
              height: buttonSize,
              opacity: pressed ? 0.7 : 1,
              width: buttonSize,
            },
          ]}
          testID={primaryTestID}
        >
          <AppIcon
            color={isActive ? onAccent : accent}
            fill={primaryFilled ? (isActive ? onAccent : accent) : 'none'}
            name={primaryIcon}
            size={primaryFilled ? (inline ? 15 : 18) : inline ? 16 : 20}
            strokeWidth={primaryFilled ? 0 : 2.5}
          />
        </Pressable>
        <Pressable
          accessibilityLabel={
            routineInFocus
              ? `Open ${activeRoutine.routineSnapshot.name} routine`
              : `Open ${name} session details`
          }
          accessibilityRole="button"
          onPress={() => void openDetails()}
          style={styles.accessoryInfo}
          testID="active-activity-details"
        >
          <View style={styles.infoText}>
            {!inline && displayContext ? (
              <Text
                numberOfLines={1}
                style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700' }}
              >
                {displayContext}
              </Text>
            ) : null}
            <View style={styles.activityTitle}>
              {routineInFocus && !inline ? (
                <AppIcon color={accent} name="repeat" size={16} />
              ) : null}
              <Text
                numberOfLines={1}
                style={{
                  color: colors.text,
                  fontSize: inline ? 14 : 16,
                  fontWeight: '600',
                }}
              >
                {actionError ?? titleText}
              </Text>
            </View>
          </View>
          <Text
            style={{
              color: isActive ? colors.text : colors.textMuted,
              fontSize: inline ? 14 : 16,
              fontVariant: ['tabular-nums'],
              fontWeight: '600',
            }}
          >
            {timerText}
          </Text>
        </Pressable>
        {showResumeRoutine && !inline ? (
          <Pressable
            accessibilityHint="Switches back to the paused routine at its current step"
            accessibilityLabel={`Resume ${activeRoutine.routineSnapshot.name}`}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            hitSlop={8}
            onPress={() => void resumePausedRoutine()}
            style={({ pressed }) => [styles.accessoryResume, { opacity: pressed ? 0.6 : 1 }]}
            testID="active-activity-resume-routine"
          >
            <AppIcon color={colors.text} name="repeat" size={18} />
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.overlay]}>
      <View
        style={[
          styles.bar,
          styles.overlayBar,
          {
            backgroundColor: isWeb ? webSurface : colors.surface,
            borderColor: isWeb ? webBorder : colors.border,
            // The web tab bar's CSS height includes the cold-start-safe
            // home-indicator inset, so the bar can meet it exactly.
            bottom: (isWeb
              ? `calc(${ACTIVE_BAR_BOTTOM}px + var(--tulona-safe-area-bottom))`
              : ACTIVE_BAR_BOTTOM) as unknown as number,
            height: ACTIVE_ACTIVITY_BAR_HEIGHT,
          },
        ]}
        testID="active-activity-bar"
      >
        <Pressable
          accessibilityHint={
            isActive ? undefined : 'Starts a new tracking session for this activity'
          }
          accessibilityLabel={primaryLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={togglePrimary}
          style={[styles.pauseButton, { backgroundColor: isActive ? accent : colors.surfaceMuted }]}
          testID={primaryTestID}
        >
          <AppIcon
            color={isActive ? onAccent : accent}
            fill={primaryFilled ? (isActive ? onAccent : accent) : 'none'}
            name={primaryIcon}
            size={primaryFilled ? 25 : 26}
            strokeWidth={primaryFilled ? 0 : 2.5}
          />
        </Pressable>
        <Pressable
          accessibilityLabel={
            routineInFocus
              ? `Open ${activeRoutine.routineSnapshot.name} routine`
              : `Open ${name} session details`
          }
          accessibilityRole="button"
          onPress={() => void openDetails()}
          style={styles.info}
          testID="active-activity-details"
        >
          <View style={styles.infoRow}>
            <View style={styles.infoText}>
              {displayContext ? (
                <Text
                  numberOfLines={1}
                  style={{ color: colors.textMuted, fontSize: 11, fontWeight: '800' }}
                >
                  {displayContext}
                </Text>
              ) : null}
              <View style={styles.activityTitle}>
                {routineInFocus ? <AppIcon color={accent} name="repeat" size={15} /> : null}
                <Text
                  numberOfLines={1}
                  style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}
                >
                  {routineInFocus && activeRoutine.status === 'paused'
                    ? `Paused · ${displayName}`
                    : displayName}
                </Text>
              </View>
              {actionError ? (
                <Text numberOfLines={1} style={{ color: colors.danger.foreground, fontSize: 11 }}>
                  {actionError}
                </Text>
              ) : null}
            </View>
            {routineInFocus && routineTimer !== null ? (
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>
                {routineTimer}
              </Text>
            ) : (
              <DurationText
                durationMs={isActive ? elapsedMs : previousDurationMs}
                textStyle={{
                  color: colors.text,
                  fontSize: 16,
                  fontWeight: '700',
                }}
              />
            )}
          </View>
        </Pressable>
        {showResumeRoutine ? (
          <Pressable
            accessibilityHint="Switches back to the paused routine at its current step"
            accessibilityLabel={`Resume ${activeRoutine.routineSnapshot.name}`}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => void resumePausedRoutine()}
            style={({ pressed }) => [
              styles.resumeRoutine,
              {
                borderLeftColor: isWeb ? webBorder : colors.border,
                opacity: busy ? 0.45 : pressed ? 0.72 : 1,
              },
            ]}
            testID="active-activity-resume-routine"
          >
            <AppIcon color={colors.primary} name="repeat" size={16} />
            <View style={styles.resumeRoutineText}>
              <Text
                numberOfLines={1}
                style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}
              >
                {activeRoutine.routineSnapshot.name}
              </Text>
              <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 11 }}>
                {`${pausedRoutineStepName} · ${pausedRoutineTimer}`}
              </Text>
            </View>
            <AppIcon color={colors.primary} name="play" size={17} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Equal gap on every side keeps the circle concentric with the capsule's rounded end. */
const ACCESSORY_BUTTON_INSET = 4;

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
    width: '100%',
  },
  overlayBar: {
    position: 'absolute',
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
  activityTitle: { alignItems: 'center', flexDirection: 'row', gap: 6, minWidth: 0 },
  overlay: {
    alignItems: 'stretch',
  },
  accessoryRow: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    paddingLeft: ACCESSORY_BUTTON_INSET,
    paddingRight: 18,
  },
  accessoryRowInline: {
    gap: 8,
    paddingRight: 12,
  },
  accessoryButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  accessoryInfo: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minWidth: 0,
  },
  accessoryResume: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 32,
  },
  pauseButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 68,
  },
  resumeRoutine: {
    alignItems: 'center',
    borderLeftWidth: 1,
    flexDirection: 'row',
    flexShrink: 1,
    gap: 6,
    justifyContent: 'center',
    maxWidth: 176,
    paddingHorizontal: 10,
  },
  resumeRoutineText: { flexShrink: 1, minWidth: 0 },
});
