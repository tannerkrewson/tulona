import { useEffect } from 'react';

import { useAppTheme } from '@theme';

import { loadRoutineRuntime } from '../routine/routine-runtime';
import { syncActiveActivityWidget } from './active-activity-widget';

function transitionKey(
  transition: { id: string; activityId: string | null; timestamp: string } | null
) {
  return transition
    ? `${transition.id}:${transition.activityId ?? ''}:${transition.timestamp}`
    : '';
}

/** Keeps the native home-screen widget aligned with the same persisted transition as the app. */
export function ActiveActivityWidgetBridge() {
  const { colors } = useAppTheme();
  const baseColor = colors.primary;
  const idleColor = colors.surfaceMuted;

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    const publish = (runtime: Awaited<ReturnType<typeof loadRoutineRuntime>>) => {
      const store = runtime.trackerStore;
      const publishState = (state: ReturnType<typeof store.getState>) => {
        syncActiveActivityWidget({
          baseColor,
          catalog: state.catalog,
          idleColor,
          transition: state.activeTransition?.activityId === null ? null : state.activeTransition,
        });
      };

      publishState(store.getState());
      unsubscribe = store.subscribe((state, previousState) => {
        if (
          state.catalog !== previousState.catalog ||
          transitionKey(state.activeTransition) !== transitionKey(previousState.activeTransition)
        ) {
          publishState(state);
        }
      });
    };

    void loadRoutineRuntime()
      .then((runtime) => {
        if (!cancelled) publish(runtime);
      })
      .catch(() => {
        if (!cancelled) {
          syncActiveActivityWidget({
            baseColor,
            catalog: null,
            idleColor,
            transition: null,
          });
        }
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [baseColor, idleColor]);

  return null;
}
