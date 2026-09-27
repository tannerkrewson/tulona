import { Column, Text } from '@expo/ui';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatDuration, timestampMs, type TimeTransition } from '@domain';
import { AppIcon } from '@icons';
import { getAccessibleTextColor, useAppTheme } from '@theme';
import { AppButton, ConfirmationModal, errorText, SlideUpSheet } from '@ui';

import { resolveCatalogItem } from '../catalog/catalog-service';
import { RecoveryActions } from '../orchestration/RecoveryActions';
import { goBackInAppStack } from '../navigation/app-back';
import { loadRoutineRuntime, type RoutineRuntime } from '../routine/routine-runtime';
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
  const [contextError, setContextError] = useState<string | null>(null);
  const contextRequest = useRef(0);
  const transition: TimeTransition | null =
    storeTransition ?? transitionContext?.transition ?? null;
  const isActive = transition?.id === activeTransition?.id && transition?.activityId !== null;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);

  const loadTransitionContext = useCallback(() => {
    const requestId = contextRequest.current + 1;
    contextRequest.current = requestId;
    setTransitionContext(null);
    setContextError(null);
    void runtime.trackerService
      .getTransitionContext(transitionId)
      .then((nextContext) => {
        if (contextRequest.current !== requestId) return;
        setTransitionContext(nextContext);
      })
      .catch((error: unknown) => {
        if (contextRequest.current !== requestId) return;
        setContextError(errorText(error));
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
    : 'previous state';
  const followingName = following?.activityId
    ? (following.activitySnapshot?.name ??
      resolveCatalogItem(catalog, following.activityId, colors.primary)?.item.name ??
      'next activity')
    : following
      ? 'idle time'
      : null;

  const runAction = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const resetToNow = () =>
    runAction(async () => {
      await store.getState().resetActiveStartToNow(transition.id);
      loadTransitionContext();
    });

  const saveHistoricalStart = (nextTimestamp: number) =>
    runAction(async () => {
      await store.getState().editTransition(transition.id, { timestamp: nextTimestamp });
      loadTransitionContext();
    });

  const saveHistoricalEnd = (nextTimestamp: number) =>
    runAction(async () => {
      if (following) {
        await store.getState().editTransition(following.id, { timestamp: nextTimestamp });
      } else if (isActive) {
        // An active session has no end boundary. A concrete To selection
        // explicitly records an idle boundary; untouched Now stays open-ended.
        await store.getState().insertTransition({ activityId: null, timestamp: nextTimestamp });
      } else {
        throw new Error('This session has no recorded end to edit.');
      }
      loadTransitionContext();
    });

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
        <Column spacing={18} style={{ width: '100%' }}>
          <View
            style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}
            testID="activity-session-summary"
          >
            <View style={[styles.activityIcon, { backgroundColor: activityColor }]}>
              <AppIcon color={iconForeground} name={activityIcon} size={24} />
            </View>
            <View style={styles.heroText}>
              <Text
                numberOfLines={1}
                textStyle={{ color: colors.text, fontSize: 25, fontWeight: '700' }}
              >
                {activityName}
              </Text>
              <Text
                numberOfLines={1}
                testID="activity-session-duration"
                textStyle={{ color: activityColor, fontSize: 19, fontWeight: '700' }}
              >
                {endMs === null ? 'In progress' : formatDuration(durationMs)}
              </Text>
            </View>
          </View>

          <View style={[styles.timeSummary, { backgroundColor: colors.surfaceMuted }]}>
            <View style={styles.timePoint}>
              <Text
                numberOfLines={1}
                textStyle={{ color: colors.text, fontSize: 15, fontWeight: '600' }}
              >
                {formatSessionDate(startMs)}
              </Text>
              <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
                {formatSessionTime(startMs)}
              </Text>
            </View>
            <AppIcon color={colors.textMuted} name="chevron-right" size={18} />
            <View style={[styles.timePoint, { alignItems: 'flex-end' }]}>
              <Text
                numberOfLines={1}
                textStyle={{ color: colors.text, fontSize: 15, fontWeight: '600' }}
              >
                {isActive ? 'Now' : endMs === null ? 'Open' : formatSessionDate(endMs)}
              </Text>
              {endMs !== null ? (
                <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
                  {formatSessionTime(endMs)}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.actionRow} testID="activity-session-actions">
            <AppButton
              disabled={busy}
              label="Change activity"
              onPress={() =>
                router.push(
                  `/activity-session/activity-chooser?transitionId=${encodeURIComponent(transition.id)}`
                )
              }
              style={{ height: 48, width: '66%' }}
              testID="activity-session-choose-activity"
              variant="outlined"
            />
            <AppButton
              disabled={busy}
              label="Delete"
              onPress={openDeleteConfirmation}
              style={{ height: 48, width: '29%' }}
              testID="activity-session-delete"
              variant="outlined"
            />
          </View>

          <HistoricalSessionEditor
            key={`${transition.id}-${transition.timestamp}-${following?.timestamp ?? 'open'}`}
            activityLabel={activityName}
            busy={busy}
            following={following}
            followingLabel={followingName}
            isActive={isActive}
            nowMs={nowMs}
            onResetStart={resetToNow}
            onSaveEnd={saveHistoricalEnd}
            onSaveStart={saveHistoricalStart}
            previous={previous}
            previousLabel={previousName}
            transition={transition}
          />

          {actionError ? (
            <Text
              testID="activity-session-action-error"
              textStyle={{ color: colors.danger.foreground, fontSize: 14 }}
            >
              {actionError}
            </Text>
          ) : null}
        </Column>
      </SlideUpSheet>
      <ConfirmationModal
        busy={busy}
        cancelLabel="Cancel"
        cancelTestID="activity-session-cancel-delete"
        confirmLabel={busy ? 'Deleting...' : 'Delete session'}
        confirmTestID="activity-session-confirm-delete"
        message="This removes the recorded session from history and cannot be undone."
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
  hero: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 100,
    padding: 16,
    width: '100%',
  },
  activityIcon: {
    alignItems: 'center',
    borderRadius: 18,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  heroText: { flex: 1, gap: 4, minWidth: 0 },
  timeSummary: {
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
    width: '100%',
  },
  timePoint: { flex: 1, gap: 3, minWidth: 0 },
  actionRow: { flexDirection: 'row', gap: 10, width: '100%' },
});
