import { Picker, type PickerItemValue, type PickerProps } from '@expo/ui';
import { Children, isValidElement, type ReactNode } from 'react';
import { Platform, View } from 'react-native';

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
      style={{ height: 48, width: '100%' }}
      value={String(selectedValue)}
    >
      {items.map((item) => (
        <option key={String(item.value)} value={String(item.value)}>
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
    <View accessibilityLabel={label} style={{ height: 48, width: '100%' }}>
      <Picker {...pickerProps} testID={testID}>
        {children}
      </Picker>
    </View>
  );
}
