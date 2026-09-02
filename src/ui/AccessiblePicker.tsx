import { Picker, type PickerItemValue, type PickerProps } from '@expo/ui';
import { Children, isValidElement, type ReactNode } from 'react';
import { Platform, View } from 'react-native';

import { useAppTheme } from '@theme';

export interface AccessiblePickerProps<T extends PickerItemValue> extends PickerProps<T> {
  label: string;
}

function pickerItems<T extends PickerItemValue>(children: ReactNode) {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ label?: unknown; value?: unknown }>(child)) return [];
    const { label, value } = child.props;
    if (typeof label !== 'string' || (typeof value !== 'string' && typeof value !== 'number')) {
      return [];
    }
    return [{ label, value: value as T }];
  });
}

function WebPicker<T extends PickerItemValue>({
  children,
  label,
  selectedValue,
  onValueChange,
  enabled = true,
  testID,
}: AccessiblePickerProps<T> & { children?: ReactNode }) {
  const { colorScheme, colors } = useAppTheme();
  const items = pickerItems<T>(children);
  return (
    <select
      aria-label={label}
      data-testid={testID}
      disabled={!enabled}
      onChange={(event) => {
        const item = items[event.currentTarget.selectedIndex];
        if (item) onValueChange(item.value);
      }}
      style={{
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: 10,
        color: colors.text,
        colorScheme,
        fontSize: 16,
        height: 48,
        padding: '0 12px',
        width: '100%',
      }}
      value={String(selectedValue)}
    >
      {items.map((item) => (
        <option
          key={String(item.value)}
          style={{ backgroundColor: colors.surface, color: colors.text }}
          value={String(item.value)}
        >
          {item.label}
        </option>
      ))}
    </select>
  );
}

/** Gives native pickers a label and uses a semantic web select because Expo's picker omits ARIA props. */
export function AccessiblePicker<T extends PickerItemValue>({
  children,
  label,
  testID,
  ...pickerProps
}: AccessiblePickerProps<T> & { children?: ReactNode }) {
  const { colors } = useAppTheme();
  if (Platform.OS === 'web') {
    return (
      <WebPicker
        {...pickerProps}
        label={label}
        onValueChange={pickerProps.onValueChange}
        selectedValue={pickerProps.selectedValue}
        testID={testID}
      >
        {children}
      </WebPicker>
    );
  }

  return (
    <View
      accessibilityLabel={label}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 10,
        borderWidth: 1,
        height: 48,
        width: '100%',
      }}
    >
      <Picker {...pickerProps} testID={testID}>
        {children}
      </Picker>
    </View>
  );
}
