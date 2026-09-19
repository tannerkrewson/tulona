import type {
  ActiveActivityWidgetProps,
  ActiveActivityWidgetSyncInput,
} from './active-activity-widget-shared';
import { activeActivityWidgetProps } from './active-activity-widget-shared';

export type {
  ActiveActivityWidgetProps,
  ActiveActivityWidgetSyncInput,
} from './active-activity-widget-shared';

export interface ActiveActivityWidgetHandle {
  updateSnapshot(props: ActiveActivityWidgetProps): void;
  reload(): void;
}

/** No-op fallback used by web and Android, where the iOS WidgetKit target does not exist. */
export const activeActivityWidget: ActiveActivityWidgetHandle = {
  updateSnapshot: () => undefined,
  reload: () => undefined,
};

export function syncActiveActivityWidget(input: ActiveActivityWidgetSyncInput): void {
  activeActivityWidget.updateSnapshot(activeActivityWidgetProps(input));
}
