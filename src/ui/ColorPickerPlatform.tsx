import { useAppTheme } from '@theme';

import { AccessibleTextInput } from './AccessibleTextInput';

export interface ColorPickerPlatformProps {
  value: string | null;
  onChange: (value: string | null) => void;
  testID: string;
}

const isHexColorValue = (value: string) => /^#[0-9a-f]{6}$/i.test(value.trim());

/** Native fallback for the web-only react-colorful picker. */
export function ColorPickerPlatform({ value, onChange, testID }: ColorPickerPlatformProps) {
  const { colors } = useAppTheme();

  return (
    <AccessibleTextInput
      autoCapitalize="none"
      autoCorrect={false}
      key={value ?? ''}
      defaultValue={value ?? ''}
      label="Custom color"
      onChangeText={(next) => {
        const trimmed = next.trim();
        if (trimmed === '' || isHexColorValue(trimmed)) onChange(trimmed || null);
      }}
      placeholder="#176B87"
      placeholderTextColor={colors.textMuted}
      returnKeyType="done"
      testID={testID}
      textStyle={{ color: colors.text, fontSize: 16 }}
    />
  );
}
