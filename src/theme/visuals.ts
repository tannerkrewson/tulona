import type { IconName } from '@icons/icon-names';

import type { ThemeColors } from './colors';

export type ActivityVisualState = 'active' | 'inactive';

export interface ActivityStateVisual {
  readonly label: string;
  readonly iconName: IconName;
  readonly colors: ThemeColors['active'];
}

/** Active state has a label and icon as well as a color treatment. */
export function getActivityStateVisual(
  colors: ThemeColors,
  state: ActivityVisualState
): ActivityStateVisual {
  if (state === 'active') {
    return { label: 'Active', iconName: 'check-circle-2', colors: colors.active };
  }

  return { label: 'Inactive', iconName: 'circle', colors: colors.inactive };
}
