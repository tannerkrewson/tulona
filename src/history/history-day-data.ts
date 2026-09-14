import {
  materializeHistorySessions,
  timestampMs,
  type HistoryPeriod,
  type HistorySession,
  type TimeTransition,
} from '@domain';

import { orderTransitions } from '../tracker/tracker-engine';
import type { DayTimelineEntry } from './day-timeline-layout';

function transitionAt(transition: TimeTransition): number | null {
  try {
    return timestampMs(transition.timestamp);
  } catch {
    return null;
  }
}

function transitionForSession(
  session: HistorySession,
  transitions: readonly TimeTransition[]
): TimeTransition | null {
  return transitions.find((transition) => transition.id === session.transitionId) ?? null;
}

/** Materializes only the selected logical day and annotates quiet continuation affordances. */
export function materializeDayTimelineEntries(
  transitions: readonly TimeTransition[],
  period: HistoryPeriod,
  nowMs: number
): DayTimelineEntry[] {
  const sessions = materializeHistorySessions(transitions, period, nowMs);
  const ordered = orderTransitions(
    transitions.filter((transition) => transition.status === 'recorded')
  );

  return sessions.map((session) => {
    const transition = transitionForSession(session, ordered);
    const rawStartMs = transition ? transitionAt(transition) : session.startMs;
    const rawStart = rawStartMs ?? session.startMs;
    const transitionIndex = transition ? ordered.findIndex(({ id }) => id === transition.id) : -1;
    const followingMs =
      transitionIndex >= 0
        ? ordered
            .slice(transitionIndex + 1)
            .map(transitionAt)
            .find((value): value is number => value !== null && value > rawStart && value <= nowMs)
        : null;
    const rawEndMs = followingMs ?? nowMs;

    return {
      session,
      continuesBefore: rawStart < period.startMs,
      continuesAfter: rawEndMs > period.endMs,
    };
  });
}
