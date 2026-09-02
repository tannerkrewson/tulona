import { Column, Row, Text } from '@expo/ui';
import { useState } from 'react';

import {
  AppIcon,
  iconCatalog,
  isEmoji,
  isIconName,
  type IconMetadata,
  type IconValue,
} from '@icons';
import { useAppTheme } from '@theme';

import { AccessibleTextInput } from './AccessibleTextInput';
import { AppButton } from './AppButton';
import { EmojiPickerPlatform } from './EmojiPickerPlatform';

export interface IconPickerProps {
  value: IconValue | null;
  onChange: (value: IconValue | null) => void;
  columns?: number;
  allowClear?: boolean;
  searchPlaceholder?: string;
  testID?: string;
}

type PickerMode = 'emoji' | 'lucide';

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

function LucideIconGrid({
  value,
  onChange,
  columns,
  rootTestID,
  searchPlaceholder,
}: {
  value: IconValue | null;
  onChange: (value: IconValue) => void;
  columns: number;
  rootTestID: string;
  searchPlaceholder: string;
}) {
  const { colors } = useAppTheme();
  const [query, setQuery] = useState('');
  const matchingIcons = searchIconCatalog(query);
  const rows = chunkIcons(matchingIcons, columns);
  const selectedName = isIconName(value) ? value : null;

  return (
    <Column spacing={10} style={{ width: '100%' }}>
      <Text textStyle={{ color: colors.textMuted, fontSize: 14, fontWeight: '600' }}>
        Search Lucide icons
      </Text>
      <AccessibleTextInput
        autoCapitalize="none"
        autoCorrect={false}
        label="Search Lucide icons"
        onChangeText={setQuery}
        placeholder={searchPlaceholder}
        placeholderTextColor={colors.textMuted}
        returnKeyType="search"
        testID={`${rootTestID}-search`}
        textStyle={{ color: colors.text, fontSize: 16 }}
      />
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

/** Combines system emoji selection with every Lucide icon in the app registry. */
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
  const [mode, setMode] = useState<PickerMode>(() => (isEmoji(value) ? 'emoji' : 'lucide'));
  const rootTestID = testID ?? 'icon-picker';

  return (
    <Column spacing={10} style={{ width: '100%' }} testID={testID}>
      <Row spacing={8} style={{ width: '100%' }}>
        <AppButton
          label="Emoji"
          onPress={() => setMode('emoji')}
          style={{
            backgroundColor: mode === 'emoji' ? colors.primary : colors.surface,
            borderColor: colors.border,
            width: '48%',
          }}
          testID={`${rootTestID}-emoji-tab`}
          variant={mode === 'emoji' ? 'filled' : 'outlined'}
        />
        <AppButton
          label="Lucide icons"
          onPress={() => setMode('lucide')}
          style={{
            backgroundColor: mode === 'lucide' ? colors.primary : colors.surface,
            borderColor: colors.border,
            width: '48%',
          }}
          testID={`${rootTestID}-lucide-tab`}
          variant={mode === 'lucide' ? 'filled' : 'outlined'}
        />
      </Row>
      {allowClear ? (
        <AppButton
          disabled={value == null}
          label="No icon"
          onPress={() => onChange(null)}
          testID={`${rootTestID}-clear`}
          variant="outlined"
        />
      ) : null}
      {mode === 'emoji' ? (
        <EmojiPickerPlatform onChange={onChange} testID={rootTestID} value={value} />
      ) : (
        <LucideIconGrid
          columns={columnCount}
          onChange={onChange}
          rootTestID={rootTestID}
          searchPlaceholder={searchPlaceholder}
          value={value}
        />
      )}
    </Column>
  );
}
