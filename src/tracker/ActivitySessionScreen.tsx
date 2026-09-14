import { Column, Row, Text } from '@expo/ui';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { formatDuration, timestampMs, type TimeTransition } from '@domain';
import { useAppTheme } from '@theme';
import { AppButton, errorText, Screen } from '@ui';

import { resolveCatalogItem } from '../catalog/catalog-service';
import { RecoveryActions } from '../orchestration/RecoveryActions';
import { loadRoutineRuntime, type RoutineRuntime } from '../routine/routine-runtime';
import type { TransitionContext } from './tracker-service';
import { orderTransitions } from './tracker-engine';

function readableDateTime(value: number | null): string {
  return value === null
    ? 'Now'
    : new Date(value).toLocaleString([], {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
}

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

function SessionError({ message, onRetry }: { message: string; onRetry: () => void }) {
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
      <RecoveryActions onRetry={onRetry} testID="activity-session-recovery" />
    </Column>
  );
}

export interface ActivitySessionScreenProps {
  transitionId: string;
}

export function ActivitySessionScreen({ transitionId }: ActivitySessionScreenProps) {
  const { colors } = useAppTheme();
  const router = useRouter();
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
      <Screen onBack={() => router.back()} title="Session">
        {loadError ? (
          <SessionError
            message={loadError}
            onRetry={() => {
              setLoadError(null);
              setRuntime(null);
              setReloadToken((value) => value + 1);
            }}
          />
        ) : (
          <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>Loading session...</Text>
        )}
      </Screen>
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
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);

  const loadTransitionContext = useCallback(() => {
    const requestId = contextRequest.current + 1;
    contextRequest.current = requestId;
    setTransitionContext(null);
    setContextLoading(true);
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
      <Screen onBack={() => router.back()} title="Session">
        <SessionError
          message={
            persistenceError
              ? errorText(persistenceError)
              : (contextError ?? 'This activity session is no longer available.')
          }
          onRetry={() => {
            void store.getState().hydrate();
            loadTransitionContext();
          }}
        />
      </Screen>
    );
  }

  const resolved = resolveCatalogItem(catalog, transition.activityId ?? '');
  const activityName =
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
  const previousName = previous?.activityId
    ? (resolveCatalogItem(catalog, previous.activityId)?.item.name ?? 'previous activity')
    : 'previous state';
  const canSnapToPrevious =
    previous !== null && timestampMs(previous.timestamp) < timestampMs(transition.timestamp);

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

  const snapToPrevious = () =>
    void runAction(async () => {
      await store.getState().snapTransitionStartToPrevious(transition.id);
      loadTransitionContext();
    });

  const resetToNow = () =>
    void runAction(async () => {
      await store.getState().resetActiveStartToNow(transition.id);
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
      router.back();
    });

  return (
    <Screen onBack={() => router.back()} title={activityName}>
      <Column spacing={16} style={{ width: '100%' }} testID="activity-session-screen">
        <Column
          spacing={14}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 16,
            borderWidth: 1,
            padding: 16,
            width: '100%',
          }}
          testID="activity-session-summary"
        >
          <Column spacing={4} style={{ width: '100%' }}>
            <Text
              numberOfLines={2}
              textStyle={{ color: colors.text, fontSize: 22, fontWeight: '700' }}
            >
              {activityName}
            </Text>
            <Text
              textStyle={{
                color: isActive ? colors.active.foreground : colors.textMuted,
                fontSize: 13,
                fontWeight: '700',
              }}
            >
              {isActive ? 'Active' : 'Recorded'}
            </Text>
          </Column>
          <Row alignment="center" spacing={8} style={{ width: '100%' }}>
            <Column style={{ width: '48%' }}>
              <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>Started</Text>
              <Text textStyle={{ color: colors.text, fontSize: 15 }}>
                {readableDateTime(timestampMs(transition.timestamp))}
              </Text>
            </Column>
            <Column style={{ width: '48%' }}>
              <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>Ended</Text>
              <Text textStyle={{ color: colors.text, fontSize: 15 }}>
                {readableDateTime(endMs)}
              </Text>
            </Column>
          </Row>
          <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
            {endMs === null
              ? isActive
                ? 'In progress'
                : 'End not recorded'
              : formatDuration(durationMs)}
          </Text>
        </Column>

        <Column spacing={10} style={{ width: '100%' }} testID="activity-session-actions">
          <Row alignment="center" spacing={10} style={{ width: '100%' }}>
            <AppButton
              disabled={busy}
              label="Choose activity"
              onPress={() =>
                router.push(
                  `/activity-session/activity-chooser?transitionId=${encodeURIComponent(transition.id)}`
                )
              }
              style={{ height: 44, width: '48%' }}
              testID="activity-session-choose-activity"
              variant="outlined"
            />
            <AppButton
              disabled={busy}
              label="Delete session"
              onPress={openDeleteConfirmation}
              style={{ height: 44, width: '48%' }}
              testID="activity-session-delete"
              variant="outlined"
            />
          </Row>
        </Column>

        <Column
          spacing={12}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 16,
            borderWidth: 1,
            padding: 16,
            width: '100%',
          }}
          testID="activity-session-corrections"
        >
          <Text textStyle={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>
            Correct start time
          </Text>
          <Text textStyle={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
            {contextLoading && !previous
              ? 'Checking for a preceding transition...'
              : previous
                ? `Previous: ${previousName} · ${readableDateTime(timestampMs(previous.timestamp))}`
                : 'No previous transition available'}
          </Text>
          <Row alignment="center" spacing={10} style={{ width: '100%' }}>
            <AppButton
              disabled={busy || !canSnapToPrevious}
              label={
                contextLoading && !previous
                  ? 'Checking previous activity'
                  : canSnapToPrevious
                    ? 'Snap to previous end'
                    : previous
                      ? 'Already at previous end'
                      : 'No previous end available'
              }
              onPress={snapToPrevious}
              style={{ height: 44, width: '48%' }}
              testID="activity-session-snap-previous"
              variant="outlined"
            />
            <AppButton
              disabled={busy || !isActive}
              label={isActive ? 'Reset start to now' : 'Reset start to now (active only)'}
              onPress={resetToNow}
              style={{ height: 44, width: '48%' }}
              testID="activity-session-reset-now"
              variant="outlined"
            />
          </Row>
        </Column>

        {deleteConfirmationOpen ? (
          <Column
            spacing={10}
            style={{
              backgroundColor: colors.danger.background,
              borderColor: colors.danger.foreground,
              borderRadius: 14,
              borderWidth: 1,
              padding: 14,
              width: '100%',
            }}
            testID="activity-session-delete-confirmation"
          >
            <Text textStyle={{ color: colors.danger.foreground, fontSize: 15, fontWeight: '700' }}>
              Delete this session?
            </Text>
            <Text textStyle={{ color: colors.danger.foreground, fontSize: 14, lineHeight: 20 }}>
              This removes the recorded session from history and cannot be undone.
            </Text>
            <Row alignment="center" spacing={10} style={{ width: '100%' }}>
              <AppButton
                disabled={busy}
                label={busy ? 'Deleting...' : 'Delete session'}
                onPress={confirmDeleteSession}
                style={{ height: 44, width: '48%' }}
                testID="activity-session-confirm-delete"
              />
              <AppButton
                disabled={busy}
                label="Cancel"
                onPress={() => setDeleteConfirmationOpen(false)}
                style={{ height: 44, width: '48%' }}
                testID="activity-session-cancel-delete"
                variant="outlined"
              />
            </Row>
          </Column>
        ) : null}

        {actionError ? (
          <Text
            testID="activity-session-action-error"
            textStyle={{ color: colors.danger.foreground, fontSize: 14 }}
          >
            {actionError}
          </Text>
        ) : null}
      </Column>
    </Screen>
  );
}
