import type { ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '@theme';

export interface PopoverSurfaceProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export interface PopoverActionProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}

/** One rounded, clipped surface owns both a popover's border and shadow. */
export function PopoverSurface({ children, style, testID }: PopoverSurfaceProps) {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: 16,
          borderWidth: 1,
          boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.15)',
          elevation: 4,
          overflow: 'hidden',
        },
        style,
      ]}
      testID={testID}
    >
      {children}
    </View>
  );
}

/** Compact, consistently sized text action for popover menus. */
export function PopoverAction({ label, onPress, disabled = false, testID }: PopoverActionProps) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        borderRadius: 10,
        height: 44,
        justifyContent: 'center',
        opacity: disabled ? 0.45 : pressed ? 0.72 : 1,
        width: '100%',
      })}
      testID={testID}
    >
      <Text
        style={{
          color: colors.textMuted,
          fontSize: 16,
          fontWeight: '500',
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
