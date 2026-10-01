import { Column, Text } from '@ui/primitives';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import type { CatalogCollection, TimeTransition, UUID } from '@domain';
import { useAppTheme } from '@theme';
import { errorText, ROW_SURFACE_LIST_GAP, Screen } from '@ui';

import { resolveCatalogItem } from '../catalog/catalog-service';
import { RecoveryActions } from '../orchestration/RecoveryActions';
import { loadRoutineRuntime, type RoutineRuntime } from '../routine/routine-runtime';
import { goBackInAppStack } from '../navigation/app-back';
import { SessionActivityChoices } from './SessionActivityChoices';

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
  transitionId?: string;
  routineId?: string;
  returnToTracker?: boolean;
}

export function ActivitySessionActivityChooserScreen({
  transitionId,
  routineId,
  returnToTracker = false,
}: ActivitySessionActivityChooserScreenProps) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const [runtime, setRuntime] = useState<RoutineRuntime | null>(null);
  const [catalog, setCatalog] = useState<CatalogCollection | null>(null);
  const [transition, setTransition] = useState<TimeTransition | null>(null);
  const [routineName, setRoutineName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const lastChoice = useRef<UUID | null | undefined>(undefined);

  const returnToSession = useCallback(() => {
    if (routineId) {
      goBackInAppStack(router, `/routine/${encodeURIComponent(routineId)}`);
    } else if (returnToTracker) {
      router.replace('/');
    } else {
      goBackInAppStack(router, `/activity-session/${encodeURIComponent(transitionId ?? '')}`);
    }
  }, [returnToTracker, router, routineId, transitionId]);

  useEffect(() => {
    let cancelled = false;
    void loadRoutineRuntime()
      .then(async (nextRuntime) => {
        const nextCatalog = await nextRuntime.catalogService.read();
        if (routineId) {
          const active = await nextRuntime.routineService.getActive();
          if (!active || active.routineId !== routineId) {
            throw new Error('This routine is no longer active.');
          }
          if (active.routineSnapshot.trackingMode !== 'overall') {
            throw new Error('Only an overall-tracked routine can replace its activity.');
          }
          return {
            context: null,
            nextCatalog,
            nextRuntime,
            routineName: active.routineSnapshot.name,
          };
        }
        const context = await nextRuntime.trackerService.getTransitionContext(transitionId ?? '');
        return { context, nextCatalog, nextRuntime, routineName: null };
      })
      .then(({ context, nextCatalog, nextRuntime, routineName: nextRoutineName }) => {
        if (cancelled) return;
        setRuntime(nextRuntime);
        setCatalog(nextCatalog);
        setTransition(context?.transition ?? null);
        setRoutineName(nextRoutineName);
        if (!routineId && !context?.transition)
          setError('This activity session is no longer available.');
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(errorText(loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken, routineId, transitionId]);

  const choose = async (activityId: UUID | null) => {
    if (!runtime || busy || (!routineId && !transition) || (routineId && activityId === null))
      return;
    lastChoice.current = activityId;
    setBusy(true);
    setError(null);
    try {
      if (routineId) {
        await runtime.routineService.stopAndReplaceActivity(activityId as UUID);
        router.replace('/');
      } else if (transition) {
        await runtime.trackerStore.getState().reassignTransition(transition.id, activityId);
        if (returnToTracker) router.replace('/');
        else returnToSession();
      }
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
    setReloadToken((value) => value + 1);
  };

  if (!runtime || !catalog || (!routineId && !transition)) {
    return (
      <Screen onBack={returnToSession} title="Choose activity">
        {error ? (
          <ChooserError message={error}>
            <RecoveryActions
              onClose={returnToSession}
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

  const currentName = routineId
    ? (routineName ?? 'routine')
    : transition?.activityId
      ? (resolveCatalogItem(catalog, transition.activityId, colors.primary)?.item.name ??
        'Unavailable activity')
      : 'No activity';

  return (
    <Screen onBack={returnToSession} title="Choose activity">
      <Column
        spacing={ROW_SURFACE_LIST_GAP}
        style={{ width: '100%' }}
        testID="activity-session-activity-chooser"
      >
        <Text textStyle={{ color: colors.textMuted, fontSize: 15, lineHeight: 21 }}>
          {routineId
            ? `Choose an activity to replace the time logged in ${currentName}.`
            : returnToTracker
              ? 'Choose what to track next.'
              : `Log the entire ${currentName} session as a different activity. To keep this time and start something new, use Switch instead.`}
        </Text>

        <SessionActivityChoices
          catalog={catalog}
          selectedId={transition?.activityId}
          activitiesOnly={Boolean(routineId)}
          allowNone={!routineId && !returnToTracker}
          busy={busy}
          onChoose={(id) => void choose(id)}
        />

        {error ? (
          <ChooserError message={error}>
            <RecoveryActions
              onClose={returnToSession}
              onRetry={retry}
              testID="activity-session-chooser-action-recovery"
            />
          </ChooserError>
        ) : null}
      </Column>
    </Screen>
  );
}
