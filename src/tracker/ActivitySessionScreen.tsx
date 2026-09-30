/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 · Session sheet, utilitarian; existing theme tokens. */
import { Column, Text } from '@expo/ui';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatDuration, timestampMs, type TimeTransition } from '@domain';
import { AppIcon } from '@icons';
import { getAccessibleTextColor, useAppTheme } from '@theme';
import { AppButton, ConfirmationModal, errorText, SlideUpSheet } from '@ui';

import { resolveCatalogItem } from '../catalog/catalog-service';
import { RecoveryActions } from '../orchestration/RecoveryActions';
import { goBackInAppStack } from '../navigation/app-back';
import { loadRoutineRuntime, type RoutineRuntime } from '../routine/routine-runtime';
import { ActiveSessionCorrection } from './ActiveSessionCorrection';
import { HistoricalSessionEditor } from './HistoricalSessionEditor';
import { formatSessionDate, formatSessionTime } from './session-time';
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
}

export function ActivitySessionScreen({ transitionId }: ActivitySessionScreenProps) {
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

  return <ActivitySessionContent runtime={runtime} transitionId={transitionId} />;
}

function ActivitySessionContent({
  runtime,
  transitionId,
}: {
  runtime: RoutineRuntime;
  transitionId: string;
}) {
  const { colors } = useAppTheme();
  const router = useRouter();
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
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);

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
  const startMs = timestampMs(transition.timestamp);
  const activityColor =
    transition.activitySnapshot?.color ?? resolved?.displayColor ?? colors.primary;
  const activityIcon =
    transition.activitySnapshot?.iconName ?? resolved?.item.iconName ?? 'activity';
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

  const openDeleteConfirmation = () => {
    if (busy) return;
    setActionError(null);
    setDeleteConfirmationOpen(true);
  };

  const confirmDeleteSession = () =>
    void runAction(async () => {
      await store.getState().deleteTransition(transition.id, { confirm: true });
      setDeleteConfirmationOpen(false);
      goBackInAppStack(router, '/');
    });

  return (
    <>
      <SlideUpSheet
        contentTestID="activity-session-screen"
        onClose={() => goBackInAppStack(router, '/')}
        testID="activity-session-sheet"
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text textStyle={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>
              {isActive ? 'Currently tracking' : 'Recorded session'}
            </Text>
            <Pressable
              accessibilityLabel="Close session"
              accessibilityRole="button"
              disabled={busy}
              onPress={() => goBackInAppStack(router, '/')}
              style={({ pressed }) => [styles.close, { opacity: busy ? 0.5 : pressed ? 0.7 : 1 }]}
              testID="activity-session-close"
            >
              <AppIcon name="x" color={colors.textMuted} size={22} />
            </Pressable>
          </View>
          <View style={styles.hero} testID="activity-session-summary">
            <View style={[styles.activityIcon, { backgroundColor: activityColor }]}>
              <AppIcon color={iconForeground} name={activityIcon} size={24} />
            </View>
            <View style={styles.heroText}>
              <Text
                numberOfLines={2}
                textStyle={{ color: colors.text, fontSize: 25, fontWeight: '600' }}
              >
                {activityName}
              </Text>
              <Text
                textStyle={{ color: colors.textMuted, fontSize: 13 }}
              >{`${formatSessionDate(startMs)} · Started ${formatSessionTime(startMs)}`}</Text>
            </View>
          </View>
          <View style={styles.duration}>
            <Text
              numberOfLines={1}
              testID="activity-session-duration"
              textStyle={{ color: colors.text, fontSize: 40, fontWeight: '600' }}
            >
              {endMs === null ? 'Open-ended' : formatDuration(durationMs)}
            </Text>
            <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>
              {isActive ? 'Elapsed · still running' : 'Time recorded'}
            </Text>
          </View>
          {isActive ? (
            <ActiveSessionCorrection
              key={`${transition.id}-${transition.timestamp}`}
              transition={transition}
              activityName={activityName}
              catalog={catalog}
              nowMs={nowMs}
              busy={busy}
              onSave={async (nextActivityId, timestamp) => {
                const saved = await runAction(async () => {
                  await store
                    .getState()
                    .switchActiveSession(
                      transition.id,
                      nextActivityId,
                      timestamp,
                      transition.timestamp
                    );
                });
                if (saved) goBackInAppStack(router, '/');
                return saved;
              }}
            />
          ) : null}
          {actionError ? (
            <Text
              testID="activity-session-action-error"
              textStyle={{ color: colors.danger.foreground, fontSize: 14 }}
            >
              {actionError}
            </Text>
          ) : null}
          {notice ? (
            <Text textStyle={{ color: colors.success.foreground, fontSize: 14 }}>{notice}</Text>
          ) : null}
          <View style={[styles.details, { borderColor: colors.border }]}>
            <Text textStyle={{ color: colors.text, fontSize: 20, fontWeight: '600' }}>
              Session details
            </Text>
            <HistoricalSessionEditor
              key={`${transition.id}-${transition.timestamp}-${following?.timestamp ?? 'open'}`}
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
            />
            <Text textStyle={{ color: colors.textMuted, fontSize: 14, lineHeight: 21 }}>
              Wrong activity for the whole session? Reassign all of its recorded time.
            </Text>
            <AppButton
              disabled={busy}
              label="Reassign session"
              variant="outlined"
              onPress={() =>
                router.push(
                  `/activity-session/activity-chooser?transitionId=${encodeURIComponent(transition.id)}`
                )
              }
              style={{ width: '100%', height: 48 }}
              testID="activity-session-choose-activity"
            />
          </View>
          <View
            style={[styles.deleteArea, { borderColor: colors.border }]}
            testID="activity-session-actions"
          >
            <Pressable
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Delete session"
              onPress={openDeleteConfirmation}
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
                Delete session
              </Text>
            </Pressable>
          </View>
        </View>
      </SlideUpSheet>
      <ConfirmationModal
        busy={busy}
        cancelLabel="Cancel"
        cancelTestID="activity-session-cancel-delete"
        confirmLabel={busy ? 'Deleting…' : 'Delete session'}
        confirmTestID="activity-session-confirm-delete"
        message={
          previous
            ? `This removes the start of ${activityName}. ${previousName} will continue through this time${isActive ? (previous.activityId ? ' and become the current activity' : ', leaving the tracker stopped') : ''}. This cannot be undone.`
            : `This removes ${activityName} from recorded history${isActive ? ' and stops tracking it' : ''}. This cannot be undone.`
        }
        onCancel={() => setDeleteConfirmationOpen(false)}
        onConfirm={confirmDeleteSession}
        testID="activity-session-delete-confirmation"
        title="Delete this session?"
        tone="danger"
        visible={deleteConfirmationOpen}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: 22, width: '100%', maxWidth: 620 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', flexDirection: 'row', gap: 14, width: '100%' },
  activityIcon: {
    alignItems: 'center',
    borderRadius: 14,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  heroText: { flex: 1, gap: 5, minWidth: 0 },
  duration: { gap: 4, width: '100%' },
  details: { gap: 14, borderTopWidth: 1, paddingTop: 22, width: '100%' },
  deleteArea: { borderTopWidth: 1, paddingTop: 8, width: '100%' },
  deleteButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
  },
});
