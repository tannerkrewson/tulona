import { Column, Text } from '@expo/ui';

import { isEmoji, type IconValue } from '@icons';
import { useAppTheme } from '@theme';

import { AccessibleTextInput } from './AccessibleTextInput';

export interface EmojiPickerPlatformProps {
  value: IconValue | null;
  onChange: (value: IconValue | null) => void;
  testID: string;
}

/** Native fallback for the web-only Frimousse picker. */
export function EmojiPickerPlatform({ value, onChange, testID }: EmojiPickerPlatformProps) {
  const { colors } = useAppTheme();

  return (
    <Column spacing={8} style={{ width: '100%' }}>
      <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
        Enter an emoji with the system keyboard.
      </Text>
      <AccessibleTextInput
        key={value ?? ''}
        defaultValue={isEmoji(value) ? value : ''}
        label="Emoji"
        onChangeText={(next) => {
          const trimmed = next.trim();
          if (trimmed === '' || isEmoji(trimmed)) onChange(trimmed || null);
        }}
        placeholder="Choose an emoji"
        placeholderTextColor={colors.textMuted}
        testID={testID}
        textStyle={{ color: colors.text, fontSize: 24 }}
      />
    </Column>
  );
}
