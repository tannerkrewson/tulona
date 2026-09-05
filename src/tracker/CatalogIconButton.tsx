import { type IconValue } from '@icons';
import { IconButton } from '@ui';

export interface CatalogIconButtonProps {
  icon: IconValue;
  label: string;
  onPress: () => void;
  testID?: string;
  disabled?: boolean;
  primary?: boolean;
  expanded?: boolean;
}

/** Compact, labeled icon-only control for catalog navigation and actions. */
export function CatalogIconButton({
  icon,
  label,
  onPress,
  testID,
  disabled = false,
  primary = false,
  expanded,
}: CatalogIconButtonProps) {
  return (
    <IconButton
      disabled={disabled}
      expanded={expanded}
      icon={icon}
      label={label}
      onPress={onPress}
      testID={testID}
      variant={primary ? 'primary' : 'muted'}
    />
  );
}
