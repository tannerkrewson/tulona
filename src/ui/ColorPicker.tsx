import { Column, Row, Text } from '@expo/ui';

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
  columns?: number;
  allowClear?: boolean;
  testID?: string;
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value.trim());
}

function chunkOptions(options: readonly ColorOption[], columns: number): ColorOption[][] {
  const rows: ColorOption[][] = [];
  for (let index = 0; index < options.length; index += columns) {
    rows.push(options.slice(index, index + columns));
  }
  return rows;
}

/** A compact, accessible palette that returns persisted hex color values. */
export function ColorPicker({
  value,
  onChange,
  options,
  colors: colorValues,
  columns = 4,
  allowClear = true,
  testID,
}: ColorPickerProps) {
  const { colors } = useAppTheme();
  const columnCount = Number.isInteger(columns) && columns > 0 ? columns : 4;
  const configuredOptions =
    options ?? colorValues?.map((color) => ({ value: color, label: color }));
  const availableOptions = (configuredOptions ?? defaultColorOptions).filter((option) =>
    isHexColor(option.value)
  );
  const rows = chunkOptions(availableOptions, columnCount);
  const selectedValue = value?.toLowerCase();
  const rootTestID = testID ?? 'color-picker';

  return (
    <Column spacing={10} style={{ width: '100%' }} testID={testID}>
      {allowClear ? (
        <AppButton
          disabled={value == null}
          label="Use default color"
          onPress={() => onChange(null)}
          testID={testID ? `${testID}-clear` : undefined}
          variant="outlined"
        />
      ) : null}
      <ColorPickerPlatform onChange={onChange} testID={`${rootTestID}-custom`} value={value} />
      <Column spacing={8} style={{ width: '100%' }}>
        {rows.map((row, rowIndex) => (
          <Row key={`color-row-${rowIndex}`} alignment="center" spacing={8}>
            {row.map((option) => {
              const selected = selectedValue === option.value.toLowerCase();
              return (
                <AppButton
                  key={option.value}
                  onPress={() => onChange(option.value)}
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: selected ? colors.focus : colors.border,
                    borderRadius: 10,
                    borderWidth: selected ? 2 : 1,
                    height: 72,
                    paddingHorizontal: 6,
                    width: 58,
                  }}
                  variant="outlined"
                >
                  <Column alignment="center" spacing={4}>
                    <Column
                      alignment="center"
                      style={{
                        backgroundColor: option.value,
                        borderColor: colors.border,
                        borderRadius: 8,
                        borderWidth: 1,
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
                    <Text numberOfLines={1} textStyle={{ color: colors.textMuted, fontSize: 10 }}>
                      {option.label}
                    </Text>
                    {selected ? (
                      <Text textStyle={{ color: colors.focus, fontSize: 9, fontWeight: '600' }}>
                        Selected
                      </Text>
                    ) : null}
                  </Column>
                </AppButton>
              );
            })}
          </Row>
        ))}
      </Column>
    </Column>
  );
}
