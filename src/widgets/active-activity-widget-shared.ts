import { timestampMs, type CatalogCollection, type TimeTransition } from '@domain';
import { getAccessibleTextColor } from '../theme/colors';

import { resolveCatalogItem } from '../catalog/catalog-service';

export interface ActiveActivityWidgetProps {
  active: boolean;
  name: string;
  startedAtMs: number;
  color: string;
  foregroundColor: '#111111' | '#FFFFFF';
}

export interface ActiveActivityWidgetSyncInput {
  catalog: CatalogCollection | null;
  transition: TimeTransition | null;
  baseColor: string;
  idleColor: string;
}

const isHexColor = (value: string): boolean => /^#[0-9a-f]{6}$/i.test(value.trim());

export function activeActivityWidgetProps({
  catalog,
  transition,
  baseColor,
  idleColor,
}: ActiveActivityWidgetSyncInput): ActiveActivityWidgetProps {
  if (!catalog || !transition?.activityId) {
    const safeIdleColor = isHexColor(idleColor) ? idleColor.trim() : '#E7E7E7';
    return {
      active: false,
      name: 'No active activity',
      startedAtMs: 0,
      color: safeIdleColor,
      foregroundColor: getAccessibleTextColor(safeIdleColor),
    };
  }

  const resolved = resolveCatalogItem(catalog, transition.activityId, baseColor);
  const configuredColor = resolved?.displayColor ?? baseColor;
  const color = isHexColor(configuredColor) ? configuredColor.trim() : '#171717';
  let startedAtMs = 0;
  try {
    startedAtMs = timestampMs(transition.timestamp);
  } catch {
    // A malformed transition is not rendered as an active timer.
  }

  const active = Boolean(resolved && startedAtMs > 0 && Number.isFinite(startedAtMs));
  return {
    active,
    name: resolved?.item.name ?? 'Current activity',
    startedAtMs: active ? startedAtMs : 0,
    color,
    foregroundColor: getAccessibleTextColor(color),
  };
}
