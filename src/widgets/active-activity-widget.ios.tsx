import { activeActivityWidget } from './active-activity-widget-layout';
import type { ActiveActivityWidgetSyncInput } from './active-activity-widget-shared';
import { activeActivityWidgetProps } from './active-activity-widget-shared';

export { activeActivityWidget };

let lastPublished = '';

/** Publishes to WidgetKit only when the rendered content changes; each publish reloads the widget. */
export function syncActiveActivityWidget(input: ActiveActivityWidgetSyncInput): void {
  const props = activeActivityWidgetProps(input);
  const published = JSON.stringify(props);
  if (published === lastPublished) return;
  lastPublished = published;
  const routine = props.routine;
  try {
    if (routine && !routine.paused && !routine.overtime && routine.stepEndsAtMs > Date.now()) {
      activeActivityWidget.updateTimeline([
        { date: new Date(), props },
        {
          date: new Date(routine.stepEndsAtMs),
          props: { ...props, routine: { ...routine, overtime: true } },
        },
      ]);
      return;
    }
    activeActivityWidget.updateSnapshot(props);
  } catch {
    lastPublished = '';
  }
}
