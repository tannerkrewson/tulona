import { Column, Row, Text } from '@expo/ui';
import { useState } from 'react';

import { AppIcon, iconCatalog, isIconName, type IconMetadata, type IconName } from '@icons';
import { useAppTheme } from '@theme';

import { AccessibleTextInput } from './AccessibleTextInput';
import { AppButton } from './AppButton';

export interface IconPickerProps {
  value: string | null;
  onChange: (value: IconName | null) => void;
  columns?: number;
  allowClear?: boolean;
  searchPlaceholder?: string;
  testID?: string;
}

export function searchIconCatalog(query: string): readonly IconMetadata[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return iconCatalog;

  return iconCatalog.filter((icon) =>
    [icon.name, icon.label, ...icon.keywords].some((part) =>
      part.toLocaleLowerCase().includes(normalizedQuery)
    )
  );
}

function chunkIcons(icons: readonly IconMetadata[], columns: number): IconMetadata[][] {
  const rows: IconMetadata[][] = [];
  for (let index = 0; index < icons.length; index += columns) {
    rows.push(icons.slice(index, index + columns));
  }
  return rows;
}

/** Searchable icon-name picker with stable, large targets and a compact grid. */
export function IconPicker({
  value,
  onChange,
  columns = 3,
  allowClear = true,
  searchPlaceholder = 'Search icons',
  testID,
}: IconPickerProps) {
  const { colors } = useAppTheme();
  const columnCount = Number.isInteger(columns) && columns > 0 ? columns : 3;
  const [query, setQuery] = useState('');
  const matchingIcons = searchIconCatalog(query);
  const rows = chunkIcons(matchingIcons, columnCount);
  const selectedName = isIconName(value) ? value : null;
  const rootTestID = testID ?? 'icon-picker';

  return (
    <Column spacing={10} style={{ width: '100%' }} testID={testID}>
      <Text textStyle={{ color: colors.textMuted, fontSize: 14, fontWeight: '600' }}>
        Search icons
      </Text>
      <AccessibleTextInput
        autoCapitalize="none"
        autoCorrect={false}
        label="Search icons"
        onChangeText={setQuery}
        placeholder={searchPlaceholder}
        placeholderTextColor={colors.textMuted}
        returnKeyType="search"
        testID={`${rootTestID}-search`}
        textStyle={{ color: colors.text, fontSize: 16 }}
      />
      {allowClear ? (
        <AppButton
          disabled={selectedName == null}
          label="No icon"
          onPress={() => onChange(null)}
          testID={`${rootTestID}-clear`}
          variant="outlined"
        />
      ) : null}
      {rows.length > 0 ? (
        <Column spacing={8} style={{ width: '100%' }} testID={`${rootTestID}-grid`}>
          {rows.map((row, rowIndex) => (
            <Row key={`icon-row-${rowIndex}`} alignment="center" spacing={8}>
              {row.map((icon) => {
                const selected = selectedName === icon.name;
                return (
                  <AppButton
                    key={icon.name}
                    onPress={() => onChange(icon.name)}
                    style={{
                      backgroundColor: selected ? colors.active.background : colors.surface,
                      borderColor: selected ? colors.focus : colors.border,
                      borderRadius: 10,
                      borderWidth: selected ? 2 : 1,
                      height: 84,
                      paddingHorizontal: 6,
                      width: 80,
                    }}
                    testID={`${rootTestID}-${icon.name}`}
                    variant="outlined"
                  >
                    <Column alignment="center" spacing={5}>
                      <AppIcon
                        accessibilityLabel={`${icon.label}${selected ? ' selected' : ''}`}
                        color={selected ? colors.active.foreground : colors.primary}
                        name={icon.name}
                        size={26}
                      />
                      <Text
                        numberOfLines={1}
                        textStyle={{ color: colors.text, fontSize: 11, textAlign: 'center' }}
                      >
                        {icon.label}
                      </Text>
                      {selected ? (
                        <Text
                          textStyle={{
                            color: colors.active.foreground,
                            fontSize: 10,
                            fontWeight: '600',
                          }}
                        >
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
      ) : (
        <Text testID={`${rootTestID}-empty`} textStyle={{ color: colors.textMuted, fontSize: 15 }}>
          No matching icons
        </Text>
      )}
    </Column>
  );
}
