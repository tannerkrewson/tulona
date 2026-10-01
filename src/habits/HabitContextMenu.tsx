import type { ReactElement } from 'react';

import type { HabitDayOutcome } from '@domain';

export interface HabitContextMenuProps {
  children: ReactElement;
  enabled: boolean;
  height: number;
  onDetails: () => void;
  onOutcome: (outcome: HabitDayOutcome | null) => void;
  outcome: HabitDayOutcome | null;
}

/** Platforms without a system context menu keep the row's own long-press menu. */
export function HabitContextMenu({ children }: HabitContextMenuProps) {
  return children;
}

HabitContextMenu.supported = false;
