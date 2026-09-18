import { Column, Text } from '@expo/ui';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppIcon } from '@icons';
import { getAccessibleTextColor, useAppTheme } from '@theme';

import { ColorPickerPlatform } from './ColorPickerPlatform';
import { getColorOptions, type ColorOption } from './color-palette';

export { COLOR_PALETTE, getColorOptions, type ColorOption } from './color-palette';

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
  const availableOptions = getColorOptions(colors.primary, configuredOptions)
    .filter((option) => allowClear || !option.isSemanticBase)
    .filter((option) => isHexColor(option.value));
  const selectedValue = value?.toLowerCase();
  const customSelected =
    selectedValue != null &&
    !availableOptions.some((option) => option.value.toLowerCase() === selectedValue);
  const rootTestID = testID ?? 'color-picker';
  const [customPickerOpen, setCustomPickerOpen] = useState(false);
  const selectColor = (nextValue: string | null) => {
    setCustomPickerOpen(false);
    onChange(nextValue);
  };

  return (
    <Column spacing={10} style={{ width: '100%' }} testID={testID}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' }}>
        {availableOptions.map((option) => {
          const selected =
            option.isSemanticBase && value == null
              ? true
              : selectedValue === option.value.toLowerCase();
          return (
            <Pressable
              key={option.value}
              accessibilityLabel={`${option.label}${selected ? ', selected' : ''}`}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => selectColor(option.isSemanticBase ? null : option.value)}
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
              <View
                style={{
                  alignItems: 'center',
                  backgroundColor: option.value,
                  borderRadius: 18,
                  height: 36,
                  justifyContent: 'center',
                  width: 36,
                }}
              >
                {selected ? (
                  <AppIcon
                    accessibilityLabel={`${option.label} selected`}
                    color={getAccessibleTextColor(option.value)}
                    name="check"
                    size={18}
                    strokeWidth={2.8}
                  />
                ) : null}
              </View>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityHint={
            customPickerOpen ? 'Hides the custom color picker' : 'Opens the custom color picker'
          }
          accessibilityLabel={customSelected ? 'Custom color, selected' : 'Custom color'}
          accessibilityRole="button"
          accessibilityState={{ expanded: customPickerOpen, selected: customSelected }}
          onPress={() => setCustomPickerOpen((current) => !current)}
          style={{
            alignItems: 'center',
            borderColor: customSelected ? colors.focus : colors.border,
            borderRadius: 22,
            borderWidth: 2,
            height: 44,
            justifyContent: 'center',
            width: 44,
          }}
          testID={`${rootTestID}-custom-toggle`}
        >
          <View style={{ alignItems: 'center', height: 28, justifyContent: 'center', width: 28 }}>
            <Text textStyle={{ fontSize: 24, lineHeight: 24 }}>🌈</Text>
          </View>
        </Pressable>
      </View>
      {selectedValue && !availableOptions.some((o) => o.value.toLowerCase() === selectedValue) ? (
        <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>{`Custom color ${value}`}</Text>
      ) : null}
      {customPickerOpen ? (
        <Column spacing={8} style={{ width: '100%' }} testID={`${rootTestID}-custom-panel`}>
          <ColorPickerPlatform onChange={onChange} testID={`${rootTestID}-custom`} value={value} />
        </Column>
      ) : null}
    </Column>
  );
}
