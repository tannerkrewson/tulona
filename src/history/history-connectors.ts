export interface DayTimelineConnector {
  transitionId: string;
  railX: number;
  railY: number;
  rowX: number;
  rowY: number;
  routeOffset: number;
}

const ROUTE_OFFSETS = [0, -3, 3, -6, 6] as const;

/** Deterministic small offsets keep coincident connectors legible without crossing routes. */
export function connectorRouteOffset(index: number): number {
  return ROUTE_OFFSETS[Math.abs(index) % ROUTE_OFFSETS.length];
}

export function dayTimelineConnectorPath(connector: DayTimelineConnector): string {
  const routeX = connector.railX + 18 + connector.routeOffset;
  const firstControlX = connector.railX + 7;
  const secondControlX = routeX;
  return `M ${connector.railX} ${connector.railY} C ${firstControlX} ${connector.railY}, ${secondControlX} ${connector.rowY}, ${connector.rowX} ${connector.rowY}`;
}
