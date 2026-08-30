import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { loadRoutineRuntime } from './routine-runtime';

/** Restores durable routine state when the foreground app boots or refreshes. */
export function RoutineStartupRestoration() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    void loadRoutineRuntime()
      .then((runtime) => runtime.routineService.recover())
      .then((active) => {
        if (cancelled || !active) return;
        if (active.status === 'awaiting-next-activity') {
          router.replace('/routine-chooser');
        } else if (active.status === 'running' || active.status === 'paused') {
          router.replace(`/routine/${active.routineId}`);
        }
      })
      .catch(() => {
        // The destination screen reports dataset and recovery errors visibly.
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
