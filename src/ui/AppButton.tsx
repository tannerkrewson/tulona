import { Button as ExpoButton, type ButtonProps } from '@expo/ui';

/** Gives every shared button a consistent, native-sized surface. */
export function AppButton({ variant = 'filled', style, ...props }: ButtonProps) {
  return (
    <ExpoButton
      {...props}
      style={{ borderRadius: 12, height: 48, paddingHorizontal: 16, ...style }}
      variant={variant}
    />
  );
}
