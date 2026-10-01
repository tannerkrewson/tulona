import {
  formatCountdownMs,
  timestampMs,
  type ActiveRoutine,
  type CatalogCollection,
  type TimeTransition,
} from '@domain';
import { getAccessibleTextColor } from '../theme/colors';

import { resolveCatalogItem } from '../catalog/catalog-service';
import { routineTiming } from '../routine/routine-engine';
import {
  orderedSteps,
  routineOwnsActivity,
  routineStepVisual,
  routineStyle,
  validHexColor,
} from '../routine/routine-visuals';

/** Countdown details for the routine step that is currently in focus. */
export interface RoutineSurfaceProps {
  routineName: string;
  stepName: string;
  /** e.g. "Step 2 of 4". */
  stepLabel: string;
  /** The next pending step's name, or an empty string on the last step. */
  nextStepName: string;
  color: string;
  foregroundColor: '#111111' | '#FFFFFF';
  paused: boolean;
  /** Whether the step has already run past its planned time. */
  overtime: boolean;
  /** Start of the step's countdown window, so progress can be drawn natively; 0 while paused. */
  stepStartedAtMs: number;
  /** When the step's time runs out; timers count down to it, then count overtime up. 0 while paused. */
  stepEndsAtMs: number;
  /**
   * Static remaining time for paused steps, where no live timer runs. Empty while running so the
   * props only change when something visible does.
   */
  remainingLabel: string;
  url: string;
}

export interface ActiveActivityWidgetProps {
  mode: 'idle' | 'activity' | 'routine';
  name: string;
  startedAtMs: number;
  color: string;
  foregroundColor: '#111111' | '#FFFFFF';
  url: string;
  /** Omitted rather than null: widget timelines live in UserDefaults, which drops plists with nulls. */
  routine?: RoutineSurfaceProps;
}

export interface ActiveActivityWidgetSyncInput {
  catalog: CatalogCollection | null;
  transition: TimeTransition | null;
  activeRoutine?: ActiveRoutine | null;
  baseColor: string;
  idleColor: string;
  nowMs?: number;
}

const APP_URL = 'tulona://';

/**
 * The routine surface shown when the user is inside a running or paused routine, or null when
 * there is no routine or another activity has interrupted it.
 */
export function routineSurfaceProps({
  activeRoutine,
  transition,
  catalog,
  baseColor,
  nowMs = Date.now(),
}: Pick<
  ActiveActivityWidgetSyncInput,
  'activeRoutine' | 'transition' | 'catalog' | 'baseColor' | 'nowMs'
>): RoutineSurfaceProps | null {
  if (!activeRoutine) return null;
  if (activeRoutine.status !== 'running' && activeRoutine.status !== 'paused') return null;
  const trackedId = transition?.activityId ?? null;
  if (trackedId !== null && !routineOwnsActivity(activeRoutine, trackedId)) return null;

  const steps = orderedSteps(activeRoutine);
  const step = steps[activeRoutine.currentStepIndex];
  if (!step) return null;

  const trackingMode = activeRoutine.routineSnapshot.trackingMode;
  const visual = routineStepVisual(step, trackingMode, catalog, baseColor);
  const color =
    (trackingMode === 'steps' ? validHexColor(visual.color) : null) ??
    routineStyle(activeRoutine, catalog, baseColor).accent;
  const runnable = steps.filter((candidate) => candidate.enabled !== false);
  const stepNumber = runnable.findIndex((candidate) => candidate.id === step.id) + 1;
  const sessionFor = (stepId: string) =>
    activeRoutine.stepSessions.find((session) => session.stepId === stepId);
  const next = steps
    .slice(activeRoutine.currentStepIndex + 1)
    .find(
      (candidate) => candidate.enabled !== false && sessionFor(candidate.id)?.status === 'pending'
    );
  const nextName = next ? routineStepVisual(next, trackingMode, catalog, baseColor).name : null;

  const timing = routineTiming(activeRoutine, nowMs);
  const remainingMs = timing.remainingMs ?? 0;
  const paused = activeRoutine.status === 'paused';
  const deadlineMs = timing.deadlineAt ? timestampMs(timing.deadlineAt) : nowMs + remainingMs;
  const stepEndsAtMs = paused ? 0 : deadlineMs;
  const totalMs = step.durationMs + (sessionFor(step.id)?.addedTimeMs ?? 0);

  return {
    routineName: activeRoutine.routineSnapshot.name,
    stepName: visual.name || 'Current step',
    stepLabel: `Step ${Math.max(1, stepNumber)} of ${Math.max(1, runnable.length)}`,
    nextStepName: next ? nextName || 'Next step' : '',
    color,
    foregroundColor: getAccessibleTextColor(color),
    paused,
    overtime: remainingMs < 0,
    stepStartedAtMs: paused ? 0 : stepEndsAtMs - totalMs,
    stepEndsAtMs,
    remainingLabel: !paused
      ? ''
      : remainingMs < 0
        ? `+${formatCountdownMs(-remainingMs)}`
        : formatCountdownMs(remainingMs),
    url: `${APP_URL}routine/${activeRoutine.routineId}`,
  };
}

export function activeActivityWidgetProps({
  catalog,
  transition,
  activeRoutine = null,
  baseColor,
  idleColor,
  nowMs,
}: ActiveActivityWidgetSyncInput): ActiveActivityWidgetProps {
  const routine = routineSurfaceProps({ activeRoutine, transition, catalog, baseColor, nowMs });
  if (routine) {
    return {
      mode: 'routine',
      name: routine.routineName,
      startedAtMs: 0,
      color: routine.color,
      foregroundColor: routine.foregroundColor,
      url: routine.url,
      routine,
    };
  }

  if (!catalog || !transition?.activityId) {
    const safeIdleColor = validHexColor(idleColor) ?? '#E7E7E7';
    return {
      mode: 'idle',
      name: 'Nothing tracked',
      startedAtMs: 0,
      color: safeIdleColor,
      foregroundColor: getAccessibleTextColor(safeIdleColor),
      url: APP_URL,
    };
  }

  const resolved = resolveCatalogItem(catalog, transition.activityId, baseColor);
  const color = validHexColor(resolved?.displayColor ?? baseColor) ?? '#171717';
  let startedAtMs = 0;
  try {
    startedAtMs = timestampMs(transition.timestamp);
  } catch {
    // A malformed transition is not rendered as an active timer.
  }

  const active = Boolean(resolved && startedAtMs > 0 && Number.isFinite(startedAtMs));
  return {
    mode: active ? 'activity' : 'idle',
    name: resolved?.item.name ?? 'Current activity',
    startedAtMs: active ? startedAtMs : 0,
    color,
    foregroundColor: getAccessibleTextColor(color),
    url: active ? `${APP_URL}activity-session/${transition.id}` : APP_URL,
  };
}
