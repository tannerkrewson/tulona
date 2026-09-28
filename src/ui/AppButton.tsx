import { Button as ExpoButton, Host, type ButtonProps } from '@expo/ui';

import { useAppTheme } from '@theme';

/** Gives every shared button a consistent, native-sized surface. */
export function AppButton({ variant = 'filled', style, ...props }: ButtonProps) {
  const { colorScheme, colors } = useAppTheme();
  return (
    <Host colorScheme={colorScheme} matchContents seedColor={colors.primary} style={style}>
      <ExpoButton
        {...props}
        style={{ borderRadius: 12, height: 48, paddingHorizontal: 16, ...style }}
        variant={variant}
      />
    </Host>
  );
}
