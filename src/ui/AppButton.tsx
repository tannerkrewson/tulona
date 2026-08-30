import { Button as ExpoButton, type ButtonProps } from '@expo/ui';

/** Gives every shared button a comfortable target without changing Expo's interaction colors. */
export function AppButton({ variant = 'filled', style, ...props }: ButtonProps) {
  return <ExpoButton {...props} style={{ height: 48, ...style }} variant={variant} />;
}
