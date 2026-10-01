import type { PickerItemValue } from '@expo/ui';
import { Children, isValidElement, type ReactNode } from 'react';

export function pickerItems<T extends PickerItemValue>(children: ReactNode) {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ label?: unknown; value?: unknown }>(child)) return [];
    const { label, value } = child.props;
    if (typeof label !== 'string' || (typeof value !== 'string' && typeof value !== 'number')) {
      return [];
    }
    return [{ label, value: value as T }];
  });
}
