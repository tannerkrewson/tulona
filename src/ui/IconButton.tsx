import { AppIcon, type IconValue } from '@icons';
import { useAppTheme } from '@theme';
import { Pressable } from 'react-native';

export type IconButtonVariant = 'plain' | 'muted' | 'primary';

export interface IconButtonProps {
  icon: IconValue;
  label: string;
  onPress: () => void;
  testID?: string;
  disabled?: boolean;
  expanded?: boolean;
  variant?: IconButtonVariant;
  iconSize?: number;
  accessibilityHint?: string;
}

/** Shared icon-only control with a consistent touch target and horizontal spacing. */
export function IconButton({
  icon,
  label,
  onPress,
  testID,
  disabled = false,
  expanded,
  variant = 'muted',
  iconSize,
  accessibilityHint,
}: IconButtonProps) {
  const { colors } = useAppTheme();
  const primary = variant === 'primary';
  const plain = variant === 'plain';
  const size = primary ? 46 : 42;

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled, ...(expanded === undefined ? {} : { expanded }) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        backgroundColor: primary ? colors.primary : plain ? 'transparent' : colors.surfaceMuted,
        borderColor: primary || plain ? 'transparent' : colors.border,
        borderRadius: primary ? 23 : 12,
        borderWidth: primary || plain ? 0 : 1,
        height: size,
        justifyContent: 'center',
        marginHorizontal: 4,
        opacity: disabled ? 0.45 : pressed ? 0.72 : 1,
        width: size,
      })}
      testID={testID}
    >
      <AppIcon
        accessibilityLabel={label}
        color={primary ? colors.onPrimary : plain ? colors.primary : colors.text}
        name={icon}
        size={iconSize ?? (primary ? 23 : 20)}
        strokeWidth={2.5}
      />
    </Pressable>
  );
}
