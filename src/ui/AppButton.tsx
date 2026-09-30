import { Button as ExpoButton, Host, type ButtonProps } from '@expo/ui';

import { useAppTheme } from '@theme';

/** Gives every shared button a consistent, native-sized surface. */
export function AppButton({ variant = 'filled', style, ...props }: ButtonProps) {
  const { colorScheme, colors } = useAppTheme();
  const { width, height = 48, ...buttonStyle } = style ?? {};
  return (
    <Host
      colorScheme={colorScheme}
      matchContents
      seedColor={colors.primary}
      style={{ width, height }}
    >
      <ExpoButton
        {...props}
        style={{
          borderRadius: 12,
          paddingHorizontal: 16,
          ...buttonStyle,
          height,
          // Percentage widths describe this control's share of its parent.
          // The inner native button fills that share instead of applying it twice.
          ...(width === undefined ? {} : { width: '100%' }),
        }}
        variant={variant}
      />
    </Host>
  );
}
