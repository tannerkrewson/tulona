/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 · Session sheet, utilitarian; existing theme tokens. */
import { Column, Text } from '@ui/primitives';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text as NativeText, useWindowDimensions, View } from 'react-native';

import { timestampMs, type TimeTransition } from '@domain';
import { AppIcon } from '@icons';
import { getAccessibleTextColor, useAppTheme } from '@theme';
import { confirmAction, errorText, FormSheet, SlideUpSheet, SYSTEM_RED } from '@ui';

import { resolveCatalogItem } from '../catalog/catalog-service';
import { RecoveryActions } from '../orchestration/RecoveryActions';
import { goBackInAppStack } from '../navigation/app-back';
import { loadRoutineRuntime, type RoutineRuntime } from '../routine/routine-runtime';
import { ActiveSessionCorrection, type SessionCorrectionIntent } from './ActiveSessionCorrection';
import { TRACKER_PLAYBACK_ICON_SIZE } from './catalog-row-geometry';
import { HistoricalSessionEditor } from './HistoricalSessionEditor';
import { SessionActivityChoices } from './SessionActivityChoices';
import type { TransitionContext } from './tracker-service';
import { orderTransitions } from './tracker-engine';

function visibleAdjacentTransition(
  transitions: readonly TimeTransition[],
  transition: TimeTransition,
  direction: 'previous' | 'following'
): TimeTransition | null {
  const ordered = orderTransitions(
    transitions.filter((candidate) => candidate.status === 'recorded')
  );
  const index = ordered.findIndex((candidate) => candidate.id === transition.id);
  if (index < 0) return null;
  const transitionMs = timestampMs(transition.timestamp);
  if (direction === 'previous') {
    return (
      [...ordered.slice(0, index)]
        .reverse()
        .find((candidate) => timestampMs(candidate.timestamp) < transitionMs) ?? null
    );
  }
  return (
    ordered.slice(index + 1).find((candidate) => timestampMs(candidate.timestamp) > transitionMs) ??
    null
  );
}

function SessionControl({
  busy,
  icon,
  label,
  onPress,
  testID,
  backgroundColor,
  foregroundColor,
  filled = false,
}: {
  busy: boolean;
  icon: string;
  label: string;
  onPress: () => void;
  testID: string;
  backgroundColor: string;
  foregroundColor: string;
  filled?: boolean;
}) {
  return (
    <Pressable
      cancelable={false}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.control,
        { backgroundColor, opacity: busy ? 0.5 : pressed ? 0.6 : 1 },
      ]}
      testID={testID}
    >
      <AppIcon
        name={icon}
        size={filled ? 30 : 28}
        color={foregroundColor}
        fill={filled ? foregroundColor : 'none'}
        strokeWidth={filled ? 0 : 2.25}
      />
    </Pressable>
  );
}

function SessionError({
  message,
  onRetry,
  onClose,
}: {
  message: string;
  onRetry: () => void;
  onClose: () => void;
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
      testID="activity-session-error"
    >
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 15, fontWeight: '700' }}>
        Session unavailable
      </Text>
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{message}</Text>
      <RecoveryActions onClose={onClose} onRetry={onRetry} testID="activity-session-recovery" />
    </Column>
  );
}

export interface ActivitySessionScreenProps {
  transitionId: string;
  /** Opens straight into the switch sheet and closes the screen when it is dismissed. */
  quickSwitch?: boolean;
}

export function ActivitySessionScreen({
  transitionId,
  quickSwitch = false,
}: ActivitySessionScreenProps) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const close = useCallback(() => goBackInAppStack(router, '/'), [router]);
  const [runtime, setRuntime] = useState<RoutineRuntime | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void loadRoutineRuntime()
      .then(async (nextRuntime) => {
        await nextRuntime.trackerStore.getState().hydrate();
        if (!cancelled) setRuntime(nextRuntime);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(errorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  if (!runtime) {
    if (quickSwitch && !loadError) return null;
    return (
      <SlideUpSheet onClose={close} testID="activity-session-sheet">
        {loadError ? (
          <SessionError
            message={loadError}
            onClose={close}
            onRetry={() => {
              setLoadError(null);
              setRuntime(null);
              setReloadToken((value) => value + 1);
            }}
          />
        ) : (
          <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>Loading session...</Text>
        )}
      </SlideUpSheet>
    );
  }

  return (
    <ActivitySessionContent
      quickSwitch={quickSwitch}
      runtime={runtime}
      transitionId={transitionId}
    />
  );
}

function ActivitySessionContent({
  quickSwitch,
  runtime,
  transitionId,
}: {
  quickSwitch: boolean;
  runtime: RoutineRuntime;
  transitionId: string;
}) {
  const { colorScheme, colors } = useAppTheme();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const [editingTime, setEditingTime] = useState(false);
  const [choosingActivity, setChoosingActivity] = useState(false);
  const [correction, setCorrection] = useState<SessionCorrectionIntent | null>(
    quickSwitch ? 'switch' : null
  );
  const store = runtime.trackerStore;
  const catalog = store((state) => state.catalog);
  const transitions = store((state) => state.transitions);
  const activeTransition = store((state) => state.activeTransition);
  const persistenceError = store((state) => state.persistenceError);
  const storeTransition: TimeTransition | null =
    transitions.find((candidate) => candidate.id === transitionId) ??
    (activeTransition?.id === transitionId ? activeTransition : null);
  const [transitionContext, setTransitionContext] = useState<TransitionContext | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [contextError, setContextError] = useState<string | null>(null);
  const contextRequest = useRef(0);
  const transition: TimeTransition | null =
    storeTransition ?? transitionContext?.transition ?? null;
  const isActive = transition?.id === activeTransition?.id && transition?.activityId !== null;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadTransitionContext = useCallback(() => {
    const requestId = contextRequest.current + 1;
    contextRequest.current = requestId;
    setContextLoading(true);
    setTransitionContext(null);
    setContextError(null);
    void runtime.trackerService
      .getTransitionContext(transitionId)
      .then((nextContext) => {
        if (contextRequest.current !== requestId) return;
        setTransitionContext(nextContext);
        setContextLoading(false);
      })
      .catch((error: unknown) => {
        if (contextRequest.current !== requestId) return;
        setContextError(errorText(error));
        setContextLoading(false);
      });
  }, [runtime, transitionId]);

  useFocusEffect(
    useCallback(() => {
      loadTransitionContext();
      return () => {
        contextRequest.current += 1;
      };
    }, [loadTransitionContext])
  );

  useEffect(() => {
    if (!isActive) return undefined;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isActive]);

  if (!catalog || !transition) {
    if (quickSwitch && contextLoading && !persistenceError && !contextError) return null;
    return (
      <SlideUpSheet onClose={() => goBackInAppStack(router, '/')} testID="activity-session-sheet">
        {contextLoading && !persistenceError && !contextError ? (
          <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>Loading session...</Text>
        ) : (
          <SessionError
            message={
              persistenceError
                ? errorText(persistenceError)
                : (contextError ?? 'This activity session is no longer available.')
            }
            onClose={() => goBackInAppStack(router, '/')}
            onRetry={() => {
              void store.getState().hydrate();
              loadTransitionContext();
            }}
          />
        )}
      </SlideUpSheet>
    );
  }

  const resolved = resolveCatalogItem(catalog, transition.activityId ?? '', colors.primary);
  const activityName =
    transition.activitySnapshot?.name ??
    resolved?.item.name ??
    (transition.activityId === null ? 'No activity' : 'Unavailable activity');
  const contextMatches = transitionContext?.transition?.id === transition.id;
  const previous =
    contextMatches && transitionContext
      ? transitionContext.previous
      : visibleAdjacentTransition(transitions, transition, 'previous');
  const following =
    contextMatches && transitionContext
      ? transitionContext.following
      : visibleAdjacentTransition(transitions, transition, 'following');
  const endMs = following ? timestampMs(following.timestamp) : isActive ? nowMs : null;
  const durationMs = endMs === null ? 0 : Math.max(0, endMs - timestampMs(transition.timestamp));
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  const stopwatch =
    hours > 0
      ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds}`
      : `${minutes}:${seconds}`;
  const isRoutineItem = resolved?.item.kind === 'routine';
  const activityColor =
    transition.activitySnapshot?.color ?? resolved?.displayColor ?? colors.primary;
  const iconForeground = getAccessibleTextColor(activityColor);
  const previousName = previous?.activityId
    ? (previous.activitySnapshot?.name ??
      resolveCatalogItem(catalog, previous.activityId, colors.primary)?.item.name ??
      'previous activity')
    : 'idle time';
  const followingName = following?.activityId
    ? (following.activitySnapshot?.name ??
      resolveCatalogItem(catalog, following.activityId, colors.primary)?.item.name ??
      'next activity')
    : following
      ? 'idle time'
      : null;

  const runAction = async (action: () => Promise<void>) => {
    if (busy) return false;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      await action();
      return true;
    } catch (error) {
      setActionError(errorText(error));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveHistoricalStart = async (nextTimestamp: number) => {
    const saved = await runAction(async () => {
      await store.getState().editTransition(transition.id, { timestamp: nextTimestamp });
      loadTransitionContext();
    });
    if (saved) setNotice('Start time updated.');
  };

  const saveHistoricalEnd = async (nextTimestamp: number) => {
    const saved = await runAction(async () => {
      if (following) {
        await store.getState().editTransition(following.id, { timestamp: nextTimestamp });
      } else if (isActive) {
        await store
          .getState()
          .switchActiveSession(transition.id, null, nextTimestamp, transition.timestamp);
      } else {
        throw new Error('This session has no recorded end to edit.');
      }
      loadTransitionContext();
    });
    if (saved) setNotice('End time updated.');
  };

  const deleteSession = () => {
    if (busy) return;
    setActionError(null);
    void confirmAction({
      confirmLabel: 'Delete',
      destructive: true,
      message: previous
        ? `${previousName[0]?.toUpperCase() ?? ''}${previousName.slice(1)} will continue through this time${isActive ? (previous.activityId ? ' and become the current activity' : ', leaving the tracker stopped') : ''}. This can’t be undone.`
        : `This removes ${activityName} from your history${isActive ? ' and stops tracking it' : ''}. This can’t be undone.`,
      title: 'Delete Session?',
    }).then((confirmed) => {
      if (!confirmed) return;
      void runAction(async () => {
        await store.getState().deleteTransition(transition.id, { confirm: true });
        goBackInAppStack(router, '/');
      });
    });
  };

  const correctionSheet = isActive ? (
    <ActiveSessionCorrection
      intent={correction}
      onClose={() => {
        setCorrection(null);
        if (quickSwitch) goBackInAppStack(router, '/');
      }}
      transition={transition}
      activityName={activityName}
      catalog={catalog}
      nowMs={nowMs}
      busy={busy}
      error={actionError}
      onSave={async (nextActivityId, timestamp) => {
        const saved = await runAction(async () => {
          await store
            .getState()
            .switchActiveSession(transition.id, nextActivityId, timestamp, transition.timestamp);
        });
        if (saved) goBackInAppStack(router, '/');
        return saved;
      }}
      onReplace={async (nextActivityId) => {
        const saved = await runAction(async () => {
          await store.getState().reassignTransition(transition.id, nextActivityId);
        });
        if (saved) goBackInAppStack(router, '/');
        return saved;
      }}
    />
  ) : null;

  if (quickSwitch && isActive) return correctionSheet;

  return (
    <>
      <SlideUpSheet
        scrollable={false}
        contentTestID="activity-session-screen"
        onClose={() => goBackInAppStack(router, '/')}
        testID="activity-session-sheet"
      >
        <View style={[styles.content, height < 740 ? { gap: 8 } : null]}>
          {!editingTime ? (
            <View style={styles.timer} testID="activity-session-summary">
              <Pressable
                accessibilityLabel={isActive ? activityName : `Change activity, ${activityName}`}
                accessibilityRole={isActive ? 'header' : 'button'}
                cancelable={false}
                disabled={isActive || busy}
                onPress={() => setChoosingActivity(true)}
                style={({ pressed }) => [styles.titleRow, { opacity: pressed ? 0.6 : 1 }]}
                testID="activity-session-title"
              >
                {transition.activityId ? (
                  <AppIcon
                    name={isRoutineItem ? 'repeat' : 'play'}
                    size={isRoutineItem ? 22 : TRACKER_PLAYBACK_ICON_SIZE}
                    color={activityColor}
                    fill={isRoutineItem ? 'none' : activityColor}
                    strokeWidth={isRoutineItem ? 2.5 : 0}
                  />
                ) : null}
                <NativeText
                  numberOfLines={1}
                  style={{ color: colors.text, flexShrink: 1, fontSize: 24, fontWeight: '700' }}
                >
                  {activityName}
                </NativeText>
                {isActive ? null : (
                  <AppIcon name="chevron-down" size={18} color={colors.textMuted} />
                )}
              </Pressable>
              <NativeText
                adjustsFontSizeToFit
                minimumFontScale={0.5}
                numberOfLines={1}
                accessibilityLabel={
                  endMs === null
                    ? 'Open-ended session'
                    : `${stopwatch} ${isActive ? 'elapsed' : 'long'}`
                }
                testID="activity-session-duration"
                style={{
                  color: colors.text,
                  fontSize: Math.min(96, (width - 44) / (stopwatch.length * 0.62)),
                  fontVariant: ['tabular-nums'],
                  fontWeight: '200',
                  letterSpacing: -1,
                  textAlign: 'center',
                }}
              >
                {endMs === null ? '—' : stopwatch}
              </NativeText>
            </View>
          ) : null}
          <HistoricalSessionEditor
            key={`${transition.id}-${transition.timestamp}-${following?.timestamp ?? 'open'}`}
            onEditingChange={setEditingTime}
            activityLabel={activityName}
            busy={busy}
            following={following}
            followingLabel={followingName}
            isActive={isActive}
            nowMs={nowMs}
            onSaveEnd={saveHistoricalEnd}
            onSaveStart={saveHistoricalStart}
            previous={previous}
            previousLabel={previousName}
            transition={transition}
            onEditRunningEnd={() => setCorrection('stop')}
          />
          {actionError ? (
            <NativeText
              accessibilityRole="alert"
              testID="activity-session-action-error"
              style={{ color: colors.danger.foreground, fontSize: 14 }}
            >
              {actionError}
            </NativeText>
          ) : null}
          {notice ? (
            <NativeText style={{ color: colors.success.foreground, fontSize: 14 }}>
              {notice}
            </NativeText>
          ) : null}
          {isActive && !editingTime ? (
            <View
              style={[styles.controls, height < 740 ? { paddingTop: 4 } : null]}
              testID="activity-session-controls"
            >
              <SessionControl
                backgroundColor={colors.surfaceMuted}
                busy={busy}
                foregroundColor={SYSTEM_RED[colorScheme]}
                icon="trash-2"
                label="Delete session"
                onPress={deleteSession}
                testID="activity-session-delete"
              />
              <SessionControl
                backgroundColor={colors.surfaceMuted}
                busy={busy}
                filled
                foregroundColor={colors.text}
                icon="square"
                label="Stop"
                onPress={() => setCorrection('stop')}
                testID="activity-session-stop"
              />
              <SessionControl
                backgroundColor={activityColor}
                busy={busy}
                foregroundColor={iconForeground}
                icon="arrow-right-left"
                label="Switch activity"
                onPress={() => setCorrection('switch')}
                testID="activity-session-switch"
              />
            </View>
          ) : null}
          {!isActive && !editingTime ? (
            <View
              style={[styles.deleteArea, { borderColor: colors.border }]}
              testID="activity-session-actions"
            >
              <Pressable
                cancelable={false}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Delete session"
                onPress={deleteSession}
                style={({ pressed }) => [
                  styles.deleteButton,
                  { opacity: busy ? 0.5 : pressed ? 0.7 : 1 },
                ]}
                testID="activity-session-delete"
              >
                <AppIcon name="trash-2" color={colors.danger.foreground} size={18} />
                <Text
                  textStyle={{ color: colors.danger.foreground, fontSize: 14, fontWeight: '600' }}
                >
                  Delete Session
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </SlideUpSheet>
      {correctionSheet}
      <FormSheet
        onClose={() => {
          if (!busy) setChoosingActivity(false);
        }}
        testID="activity-session-reassign-sheet"
        title="Change Activity"
        visible={choosingActivity}
      >
        <NativeText
          style={{ color: colors.textMuted, fontSize: 15, lineHeight: 21, paddingHorizontal: 16 }}
        >
          {`Log this whole session as something other than ${activityName}.`}
        </NativeText>
        <SessionActivityChoices
          catalog={catalog}
          selectedId={transition.activityId}
          allowNone
          busy={busy}
          onChoose={(id) =>
            void runAction(async () => {
              await store.getState().reassignTransition(transition.id, id);
              loadTransitionContext();
              setChoosingActivity(false);
            })
          }
        />
        {actionError ? (
          <NativeText accessibilityRole="alert" style={{ color: colors.danger.foreground }}>
            {actionError}
          </NativeText>
        ) : null}
      </FormSheet>
    </>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, minHeight: 0, gap: 14, width: '100%', maxWidth: 620 },
  timer: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
    justifyContent: 'center',
    minHeight: 48,
    width: '100%',
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    maxWidth: '100%',
    minHeight: 44,
    paddingHorizontal: 8,
  },
  controls: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingTop: 16,
    paddingBottom: 8,
  },
  control: {
    alignItems: 'center',
    borderRadius: 36,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  deleteArea: { paddingTop: 8, width: '100%' },
  deleteButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'center',
  },
});
