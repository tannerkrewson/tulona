import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import type { ActiveRoutine } from '@domain';
import { useAppTheme } from '@theme';

import { subscribeRoutineChanges } from '../routine/routine-changes';
import { loadRoutineRuntime } from '../routine/routine-runtime';
import { syncActiveActivityWidget } from './active-activity-widget';
import { routineSurfaceProps } from './active-activity-widget-shared';
import { syncRoutineLiveActivity } from './routine-live-activity';

function transitionKey(
  transition: { id: string; activityId: string | null; timestamp: string } | null
) {
  return transition
    ? `${transition.id}:${transition.activityId ?? ''}:${transition.timestamp}`
    : '';
}

/**
 * Keeps the home-screen widget and the routine Live Activity aligned with the same persisted
 * transition and active routine as the app.
 */
export function ActiveActivityWidgetBridge() {
  const { colors } = useAppTheme();
  const baseColor = colors.primary;
  const idleColor = colors.surfaceMuted;

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    let cancelled = false;
    const cleanups: (() => void)[] = [];

    const publish = (runtime: Awaited<ReturnType<typeof loadRoutineRuntime>>) => {
      const store = runtime.trackerStore;
      let activeRoutine: ActiveRoutine | null = null;
      let readToken = 0;

      const publishState = () => {
        const state = store.getState();
        const transition =
          state.activeTransition?.activityId === null ? null : state.activeTransition;
        const input = { activeRoutine, baseColor, catalog: state.catalog, idleColor, transition };
        syncActiveActivityWidget(input);
        syncRoutineLiveActivity(routineSurfaceProps(input));
      };

      const refreshRoutine = () => {
        const token = ++readToken;
        void runtime.routineService
          .getActive()
          .catch(() => null)
          .then((routine) => {
            if (cancelled || token !== readToken) return;
            activeRoutine = routine;
            publishState();
          });
      };

      refreshRoutine();
      cleanups.push(subscribeRoutineChanges(refreshRoutine));
      cleanups.push(
        store.subscribe((state, previousState) => {
          if (
            state.catalog !== previousState.catalog ||
            transitionKey(state.activeTransition) !== transitionKey(previousState.activeTransition)
          ) {
            refreshRoutine();
          }
        })
      );
      const appState = AppState.addEventListener('change', (next) => {
        if (next === 'active') refreshRoutine();
      });
      cleanups.push(() => appState.remove());
    };

    void loadRoutineRuntime()
      .then((runtime) => {
        if (!cancelled) publish(runtime);
      })
      .catch(() => {
        if (!cancelled) {
          syncActiveActivityWidget({ baseColor, catalog: null, idleColor, transition: null });
          syncRoutineLiveActivity(null);
        }
      });

    return () => {
      cancelled = true;
      for (const cleanup of cleanups) cleanup();
    };
  }, [baseColor, idleColor]);

  return null;
}
