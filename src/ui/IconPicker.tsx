import { Column, Row, ScrollView, Text } from '@expo/ui';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

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
  /** Accepted for compatibility; the grid wraps to fill available width. */
  columns?: number;
  allowClear?: boolean;
  searchPlaceholder?: string;
  testID?: string;
}

type PickerMode = 'emoji' | 'lucide';

const COMMON_EMOJIS: readonly string[] = [
  '😀',
  '🎉',
  '❤️',
  '🔥',
  '⭐',
  '✅',
  '🏃',
  '📚',
  '💼',
  '🍎',
  '🎵',
  '😴',
];

export function searchIconCatalog(query: string): readonly IconMetadata[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return iconCatalog;

  return iconCatalog.filter((icon) =>
    [icon.name, icon.label, ...icon.keywords].some((part) =>
      part.toLocaleLowerCase().includes(normalizedQuery)
    )
  );
}

function LucideIconGrid({
  value,
  onChange,
  rootTestID,
  searchPlaceholder,
}: {
  value: IconValue | null;
  onChange: (value: IconValue) => void;
  rootTestID: string;
  searchPlaceholder: string;
}) {
  const { colors } = useAppTheme();
  const [query, setQuery] = useState('');
  const matchingIcons = searchIconCatalog(query);
  const selectedName = isIconName(value) ? value : null;

  return (
    <Column spacing={8} style={{ width: '100%' }}>
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
      {matchingIcons.length > 0 ? (
        <ScrollView style={{ height: 264, width: '100%' }}>
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, width: '100%' }}
            testID={`${rootTestID}-grid`}
          >
            {matchingIcons.map((icon) => {
              const selected = selectedName === icon.name;
              return (
                <Pressable
                  key={icon.name}
                  accessibilityLabel={`${icon.label}${selected ? ', selected' : ''}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => onChange(icon.name)}
                  style={{
                    alignItems: 'center',
                    backgroundColor: selected ? colors.primary : colors.surface,
                    borderColor: selected ? colors.primary : colors.border,
                    borderRadius: 12,
                    borderWidth: 1,
                    height: 52,
                    justifyContent: 'center',
                    width: 52,
                  }}
                  testID={`${rootTestID}-${icon.name}`}
                >
                  <AppIcon
                    accessibilityLabel={`${icon.label}${selected ? ' selected' : ''}`}
                    color={selected ? colors.onPrimary : colors.primary}
                    name={icon.name}
                    size={24}
                  />
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      ) : (
        <Text testID={`${rootTestID}-empty`} textStyle={{ color: colors.textMuted, fontSize: 15 }}>
          No matching icons
        </Text>
      )}
    </Column>
  );
}

function EmojiQuickRow({
  value,
  onChange,
  rootTestID,
}: {
  value: IconValue | null;
  onChange: (value: IconValue) => void;
  rootTestID: string;
}) {
  const { colors } = useAppTheme();
  return (
    <ScrollView direction="horizontal" style={{ width: '100%' }}>
      <Row spacing={4}>
        {COMMON_EMOJIS.map((emoji) => {
          const selected = value === emoji;
          return (
            <Pressable
              key={emoji}
              accessibilityLabel={`${emoji}${selected ? ', selected' : ''}`}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(emoji)}
              style={{
                alignItems: 'center',
                backgroundColor: selected ? colors.active.background : colors.surface,
                borderColor: selected ? colors.focus : colors.border,
                borderRadius: 12,
                borderWidth: 1,
                height: 48,
                justifyContent: 'center',
                width: 48,
              }}
              testID={`${rootTestID}-quick-${emoji}`}
            >
              <AppIcon accessibilityLabel={`${emoji} emoji`} name={emoji} size={26} />
            </Pressable>
          );
        })}
      </Row>
    </ScrollView>
  );
}

function ModeSegment({
  mode,
  onChange,
  rootTestID,
}: {
  mode: PickerMode;
  onChange: (mode: PickerMode) => void;
  rootTestID: string;
}) {
  const { colors } = useAppTheme();
  const modes: readonly { id: PickerMode; label: string; testID: string }[] = [
    { id: 'emoji', label: 'Emoji', testID: `${rootTestID}-emoji-tab` },
    { id: 'lucide', label: 'Icons', testID: `${rootTestID}-lucide-tab` },
  ];
  return (
    <Row
      spacing={4}
      style={{
        backgroundColor: colors.surfaceMuted,
        borderRadius: 12,
        padding: 4,
        width: '100%',
      }}
    >
      {modes.map((option) => {
        const selected = mode === option.id;
        return (
          <AppButton
            key={option.id}
            label={option.label}
            onPress={() => onChange(option.id)}
            style={{
              backgroundColor: selected ? colors.surface : 'transparent',
              borderRadius: 8,
              height: 36,
              paddingHorizontal: 0,
              width: '48%',
            }}
            testID={option.testID}
            variant={selected ? 'outlined' : 'text'}
          />
        );
      })}
    </Row>
  );
}

/** One segmented picker for emoji and Lucide icons with a compact grid. */
export function IconPicker({
  value,
  onChange,
  allowClear = true,
  searchPlaceholder = 'Search icons',
  testID,
}: IconPickerProps) {
  const [mode, setMode] = useState<PickerMode>(() => (isEmoji(value) ? 'emoji' : 'lucide'));
  const rootTestID = testID ?? 'icon-picker';

  return (
    <Column spacing={10} style={{ width: '100%' }} testID={testID}>
      <ModeSegment mode={mode} onChange={setMode} rootTestID={rootTestID} />
      {mode === 'emoji' ? (
        <Column spacing={8} style={{ width: '100%' }}>
          {Platform.OS !== 'web' ? (
            <EmojiQuickRow onChange={onChange} rootTestID={rootTestID} value={value} />
          ) : null}
          <EmojiPickerPlatform onChange={onChange} testID={rootTestID} value={value} />
        </Column>
      ) : (
        <LucideIconGrid
          onChange={onChange}
          rootTestID={rootTestID}
          searchPlaceholder={searchPlaceholder}
          value={value}
        />
      )}
      {allowClear && value != null ? (
        <AppButton
          label="No icon"
          onPress={() => onChange(null)}
          style={{ height: 40 }}
          testID={`${rootTestID}-clear`}
          variant="text"
        />
      ) : null}
    </Column>
  );
}
