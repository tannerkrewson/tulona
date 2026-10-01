import { Button, ContextMenu, Host, RNHostView } from '@expo/ui/swift-ui';

import type { HabitDayOutcome } from '@domain';
import { useAppTheme } from '@theme';

import type { HabitContextMenuProps } from './HabitContextMenu';

/** Long-press actions for a habit row, using the system context menu and lift preview. */
export function HabitContextMenu({
  children,
  enabled,
  height,
  onDetails,
  onOutcome,
  outcome,
}: HabitContextMenuProps) {
  const { colorScheme } = useAppTheme();
  if (!enabled) return children;
  const toggle = (next: HabitDayOutcome) => onOutcome(outcome === next ? null : next);
  return (
    <Host colorScheme={colorScheme} style={{ height, width: '100%' }}>
      <ContextMenu>
        <ContextMenu.Trigger>
          <RNHostView>{children}</RNHostView>
        </ContextMenu.Trigger>
        <ContextMenu.Items>
          <Button
            label={outcome === 'done' ? 'Clear done' : 'Mark done'}
            onPress={() => toggle('done')}
            systemImage="checkmark"
          />
          <Button
            label={outcome === 'failed' ? 'Clear failed' : 'Mark failed'}
            onPress={() => toggle('failed')}
            systemImage="xmark"
          />
          <Button
            label={outcome === 'skipped' ? 'Clear skipped' : 'Skip day'}
            onPress={() => toggle('skipped')}
            systemImage="forward.end"
          />
          <Button label="View details" onPress={onDetails} systemImage="info.circle" />
        </ContextMenu.Items>
      </ContextMenu>
    </Host>
  );
}

HabitContextMenu.supported = true;
