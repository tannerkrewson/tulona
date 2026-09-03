import { Column, Text } from '@expo/ui';
import { Pressable, View } from 'react-native';

import { AppIcon } from '@icons';
import { getAccessibleTextColor, useAppTheme } from '@theme';

import { AppButton } from './AppButton';
import { ColorPickerPlatform } from './ColorPickerPlatform';

export interface ColorOption {
  readonly value: string;
  readonly label: string;
}

export const defaultColorOptions: readonly ColorOption[] = [
  { value: '#176B87', label: 'Teal' },
  { value: '#0F766E', label: 'Emerald' },
  { value: '#0891B2', label: 'Cyan' },
  { value: '#2563EB', label: 'Blue' },
  { value: '#7C3AED', label: 'Violet' },
  { value: '#DB2777', label: 'Pink' },
  { value: '#DC2626', label: 'Red' },
  { value: '#EA580C', label: 'Orange' },
  { value: '#CA8A04', label: 'Amber' },
  { value: '#65A30D', label: 'Lime' },
  { value: '#475569', label: 'Slate' },
  { value: '#6B7280', label: 'Gray' },
];

export interface ColorPickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
  options?: readonly ColorOption[];
  colors?: readonly string[];
  /** Accepted for compatibility; the grid wraps to fill available width. */
  columns?: number;
  allowClear?: boolean;
  testID?: string;
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value.trim());
}

/**
 * A simple preset swatch grid with one custom-color row.
 * Selected state is a check on the swatch itself; no per-swatch text.
 */
export function ColorPicker({
  value,
  onChange,
  options,
  colors: colorValues,
  allowClear = true,
  testID,
}: ColorPickerProps) {
  const { colors } = useAppTheme();
  const configuredOptions =
    options ?? colorValues?.map((color) => ({ value: color, label: color }));
  const availableOptions = (configuredOptions ?? defaultColorOptions).filter((option) =>
    isHexColor(option.value)
  );
  const selectedValue = value?.toLowerCase();
  const rootTestID = testID ?? 'color-picker';

  return (
    <Column spacing={10} style={{ width: '100%' }} testID={testID}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' }}>
        {allowClear ? (
          <AppButton
            disabled={value == null}
            label="Default"
            onPress={() => onChange(null)}
            style={{ height: 44, paddingHorizontal: 14 }}
            testID={testID ? `${testID}-clear` : undefined}
            variant={value == null ? 'filled' : 'outlined'}
          />
        ) : null}
        {availableOptions.map((option) => {
          const selected = selectedValue === option.value.toLowerCase();
          return (
            <Pressable
              key={option.value}
              accessibilityLabel={`${option.label}${selected ? ', selected' : ''}`}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={{
                alignItems: 'center',
                borderColor: selected ? colors.focus : 'transparent',
                borderRadius: 22,
                borderWidth: 2,
                height: 44,
                justifyContent: 'center',
                width: 44,
              }}
              testID={`${rootTestID}-${option.value}`}
            >
              <Column
                alignment="center"
                style={{
                  backgroundColor: option.value,
                  borderRadius: 18,
                  height: 36,
                  width: 36,
                }}
              >
                {selected ? (
                  <AppIcon
                    accessibilityLabel={`${option.label} selected`}
                    color={getAccessibleTextColor(option.value)}
                    name="check"
                    size={18}
                  />
                ) : null}
              </Column>
            </Pressable>
          );
        })}
      </View>
      {selectedValue && !availableOptions.some((o) => o.value.toLowerCase() === selectedValue) ? (
        <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>{`Custom color ${value}`}</Text>
      ) : null}
      <ColorPickerPlatform onChange={onChange} testID={`${rootTestID}-custom`} value={value} />
    </Column>
  );
}
