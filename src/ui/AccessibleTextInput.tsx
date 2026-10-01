import { forwardRef } from 'react';
import {
  TextInput,
  type KeyboardTypeOptions,
  type ReturnKeyTypeOptions,
  type TextInput as TextInputHandle,
  type TextStyle,
} from 'react-native';

import { useAppTheme } from '@theme';

export interface AccessibleTextInputProps {
  label: string;
  defaultValue?: string;
  onChangeText?: (text: string) => void;
  onSubmitEditing?: (text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  placeholderTextColor?: string;
  autoFocus?: boolean;
  editable?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  returnKeyType?: ReturnKeyTypeOptions;
  maxLength?: number;
  selectTextOnFocus?: boolean;
  style?: TextStyle;
  textStyle?: TextStyle;
  testID?: string;
}

/** A labelled native text field with the app's shared field surface. */
export const AccessibleTextInput = forwardRef<TextInputHandle, AccessibleTextInputProps>(
  function AccessibleTextInput(
    { label, multiline = false, numberOfLines, onSubmitEditing, style, textStyle, ...inputProps },
    ref
  ) {
    const { colorScheme, colors } = useAppTheme();
    const lineCount = numberOfLines ?? (multiline ? 4 : 1);
    const { height, ...surfaceStyle } = style ?? {};

    return (
      <TextInput
        {...inputProps}
        accessibilityLabel={label}
        keyboardAppearance={colorScheme}
        multiline={multiline}
        numberOfLines={lineCount}
        onSubmitEditing={
          onSubmitEditing ? (event) => onSubmitEditing(event.nativeEvent.text) : undefined
        }
        placeholderTextColor={inputProps.placeholderTextColor ?? colors.textMuted}
        ref={ref}
        selectionColor={colors.primary}
        style={[
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderCurve: 'continuous',
            borderRadius: 10,
            borderWidth: 1,
            color: colors.text,
            fontSize: 16,
            paddingHorizontal: 12,
            width: '100%',
          },
          multiline
            ? {
                minHeight: Math.max(48, lineCount * 22 + 20),
                paddingVertical: 12,
                textAlignVertical: 'top',
              }
            : { height: height ?? 48 },
          surfaceStyle,
          textStyle,
        ]}
      />
    );
  }
);
