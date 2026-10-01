import type { RoutineSurfaceProps } from './active-activity-widget-shared';

/** No-op fallback used by web and Android, where ActivityKit does not exist. */
export function syncRoutineLiveActivity(_props: RoutineSurfaceProps | null): void {}
