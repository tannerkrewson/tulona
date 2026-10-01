import type { PickerItemValue, PickerProps } from '@expo/ui';
import { Host, Picker, Text } from '@expo/ui/swift-ui';
import { disabled, frame, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useAppTheme } from '@theme';

import { pickerItems } from './picker-items';

export interface AccessiblePickerProps<T extends PickerItemValue> extends PickerProps<T> {
  label: string;
}

const MENU_HEIGHT = 48;
const WHEEL_HEIGHT = 150;

/** A labelled SwiftUI picker inside a bordered field that matches the text inputs. */
export function AccessiblePicker<T extends PickerItemValue>({
  appearance,
  children,
  enabled = true,
  label,
  onValueChange,
  selectedValue,
  testID,
}: AccessiblePickerProps<T> & { children?: ReactNode }) {
  const { colorScheme, colors } = useAppTheme();
  const wheel = appearance === 'wheel';

  return (
    <View
      accessibilityLabel={label}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 10,
        borderWidth: 1,
        height: wheel ? WHEEL_HEIGHT : MENU_HEIGHT,
        width: '100%',
      }}
    >
      <Host colorScheme={colorScheme} seedColor={colors.primary} style={{ flex: 1, width: '100%' }}>
        <Picker
          modifiers={[
            pickerStyle(wheel ? 'wheel' : 'menu'),
            frame({ alignment: 'leading', maxHeight: Infinity, maxWidth: Infinity }),
            ...(enabled ? [] : [disabled(true)]),
          ]}
          onSelectionChange={(value) => onValueChange(value as T)}
          selection={selectedValue}
          testID={testID}
        >
          {pickerItems<T>(children).map((item) => (
            <Text key={String(item.value)} modifiers={[tag(item.value)]}>
              {item.label}
            </Text>
          ))}
        </Picker>
      </Host>
    </View>
  );
}
