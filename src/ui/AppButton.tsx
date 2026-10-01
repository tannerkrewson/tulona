import type { ReactNode } from 'react';
import { Pressable, Text, type TextStyle, type ViewStyle } from 'react-native';

import { useAppTheme } from '@theme';

export type AppButtonVariant = 'filled' | 'outlined' | 'text';

export interface AppButtonProps {
  label?: string;
  children?: ReactNode;
  onPress?: () => void;
  variant?: AppButtonVariant;
  disabled?: boolean;
  hidden?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  testID?: string;
}

/** Gives every shared button a consistent, touch-sized surface. */
export function AppButton({
  label,
  children,
  onPress,
  variant = 'filled',
  disabled = false,
  hidden = false,
  style,
  textStyle,
  testID,
}: AppButtonProps) {
  const { colors } = useAppTheme();
  if (hidden) return null;
  const filled = variant === 'filled';
  const outlined = variant === 'outlined';

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          alignItems: 'center',
          backgroundColor: filled ? colors.primary : 'transparent',
          borderColor: outlined ? colors.border : 'transparent',
          borderCurve: 'continuous',
          borderRadius: 12,
          borderWidth: outlined ? 1 : 0,
          flexDirection: 'row',
          gap: 8,
          height: 48,
          justifyContent: 'center',
          paddingHorizontal: 16,
        },
        style,
        pressed && { opacity: 0.7 },
        disabled && { opacity: 0.45 },
      ]}
      testID={testID}
    >
      {children ?? (
        <Text
          numberOfLines={1}
          style={[
            {
              color: filled ? colors.onPrimary : colors.text,
              fontSize: 16,
              fontWeight: '600',
              textAlign: 'center',
            },
            textStyle,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
