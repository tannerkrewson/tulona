import type { ActiveRoutine, CatalogCollection } from '@domain';

import { inheritRoutineStepMetadata, resolveCatalogItem } from '../catalog/catalog-service';

export function orderedSteps(active: ActiveRoutine) {
  return [...active.routineSnapshot.steps].sort((left, right) => left.sortOrder - right.sortOrder);
}

export function validHexColor(color: string | null | undefined): string | null {
  return color && /^#[0-9a-f]{6}$/i.test(color.trim()) ? color.trim() : null;
}

export function routineStepVisual(
  step: ActiveRoutine['routineSnapshot']['steps'][number],
  trackingMode: ActiveRoutine['routineSnapshot']['trackingMode'],
  catalog: CatalogCollection | null,
  baseColor: string
) {
  if (trackingMode !== 'steps' || !catalog || step.activityId === null) return step;
  const inherited = inheritRoutineStepMetadata(catalog, step);
  const resolved = resolveCatalogItem(catalog, step.activityId, baseColor);
  return {
    ...inherited,
    color: resolved?.displayColor ?? inherited.color ?? null,
    iconName: inherited.iconName ?? resolved?.item.iconName ?? null,
  };
}

export function routineStyle(
  active: ActiveRoutine,
  catalog: CatalogCollection | null,
  baseColor: string
): { accent: string; iconName: string } {
  const routine = catalog?.routines.find((candidate) => candidate.id === active.routineId);
  const resolved = routine && catalog ? resolveCatalogItem(catalog, routine.id, baseColor) : null;
  const accent =
    validHexColor(active.routineSnapshot.color) ??
    resolved?.displayColor ??
    validHexColor(routine?.color) ??
    baseColor;
  return {
    accent,
    iconName: active.routineSnapshot.iconName ?? routine?.iconName ?? 'repeat',
  };
}

/** Whether the tracked activity belongs to the routine rather than an interrupting activity. */
export function routineOwnsActivity(routine: ActiveRoutine, activityId: string): boolean {
  if (routine.routineSnapshot.trackingMode === 'overall') {
    return routine.routineId === activityId;
  }
  return routine.routineSnapshot.steps.some((step) => step.activityId === activityId);
}
