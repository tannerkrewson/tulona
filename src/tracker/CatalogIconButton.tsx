import { AppIcon, type IconValue } from '@icons';
import { useAppTheme } from '@theme';
import { Pressable } from 'react-native';

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
  const { colors } = useAppTheme();

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled, ...(expanded === undefined ? {} : { expanded }) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        backgroundColor: primary ? colors.primary : colors.surfaceMuted,
        borderColor: primary ? colors.primary : colors.border,
        borderRadius: primary ? 23 : 12,
        borderWidth: primary ? 0 : 1,
        height: primary ? 46 : 42,
        justifyContent: 'center',
        opacity: disabled ? 0.45 : pressed ? 0.72 : 1,
        width: primary ? 46 : 42,
      })}
      testID={testID}
    >
      <AppIcon
        accessibilityLabel={label}
        color={primary ? colors.onPrimary : colors.text}
        name={icon}
        size={primary ? 23 : 20}
        strokeWidth={2.5}
      />
    </Pressable>
  );
}
