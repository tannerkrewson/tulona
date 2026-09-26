import { Row, Spacer, Text } from '@expo/ui';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppIcon, type IconValue } from '@icons';
import { useAppTheme } from '@theme';

import { IconButton } from './IconButton';

export interface PageFilterMenuOption<T extends string = string> {
  value: T;
  label: string;
  icon?: IconValue;
}

export interface PageFilterMenuToggle {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  testID?: string;
}

export interface PageFilterMenuProps<T extends string = string> {
  value: T;
  defaultValue: T;
  options: readonly PageFilterMenuOption<T>[];
  onChange: (value: T) => void;
  accessibilityLabel: string;
  testID?: string;
  toggles?: readonly PageFilterMenuToggle[];
}

/**
 * An icon button for switching the page's visible collection. Non-default
 * views keep their name in sight and offer one-tap return to the default.
 */
export function PageFilterMenu<T extends string = string>({
  value,
  defaultValue,
  options,
  onChange,
  accessibilityLabel,
  testID = 'page-filter-menu',
  toggles = [],
}: PageFilterMenuProps<T>) {
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(false);
  const currentOption = options.find((option) => option.value === value);
  const defaultOption = options.find((option) => option.value === defaultValue);
  const isDefault = value === defaultValue;

  return (
    <View style={{ position: 'relative', width: '100%', zIndex: open ? 30 : 0 }}>
      {open ? (
        <Pressable
          accessibilityLabel="Close view menu"
          accessibilityRole="button"
          onPress={() => setOpen(false)}
          style={{
            bottom: -1000,
            left: -1000,
            position: 'absolute',
            right: -1000,
            top: -1000,
            zIndex: 1,
          }}
          testID={`${testID}-backdrop`}
        />
      ) : null}
      <Row alignment="center" spacing={8} style={{ width: '100%' }}>
        {isDefault || !currentOption ? null : (
          <View
            style={{ alignItems: 'center', flexDirection: 'row', flexShrink: 1, gap: 4 }}
            testID={`${testID}-label`}
          >
            <Text
              numberOfLines={1}
              textStyle={{ color: colors.text, fontSize: 14, fontWeight: '600' }}
            >
              {`Showing ${currentOption.label}`}
            </Text>
            <Pressable
              accessibilityHint="Returns to the default view"
              accessibilityLabel={`Show ${defaultOption?.label ?? 'default view'}`}
              accessibilityRole="button"
              onPress={() => {
                onChange(defaultValue);
                setOpen(false);
              }}
              style={({ pressed }) => ({
                alignItems: 'center',
                borderRadius: 14,
                height: 28,
                justifyContent: 'center',
                opacity: pressed ? 0.65 : 1,
                width: 28,
              })}
              testID={`${testID}-clear`}
            >
              <AppIcon color={colors.textMuted} name="x" size={16} strokeWidth={2.5} />
            </Pressable>
          </View>
        )}
        <Spacer flexible />
        <IconButton
          accessibilityHint="Opens choices for what this page shows"
          expanded={open}
          icon="settings"
          label={accessibilityLabel}
          onPress={() => setOpen((isOpen) => !isOpen)}
          testID={`${testID}-button`}
          variant="muted"
        />
      </Row>
      {open ? (
        <View
          style={{
            boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.15)',
            position: 'absolute',
            right: 0,
            top: 48,
            width: 248,
            zIndex: 2,
          }}
        >
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: 14,
              borderWidth: 1,
              overflow: 'hidden',
              width: '100%',
            }}
            testID={`${testID}-options`}
          >
            {options.map((option, index) => {
              const selected = option.value === value;
              return (
                <Pressable
                  accessibilityLabel={option.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={option.value}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  style={({ pressed }) => ({
                    alignItems: 'center',
                    backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                    borderBottomColor: colors.border,
                    borderBottomWidth: index < options.length - 1 || toggles.length > 0 ? 1 : 0,
                    flexDirection: 'row',
                    minHeight: 48,
                    paddingHorizontal: 14,
                    opacity: pressed ? 0.8 : 1,
                  })}
                  testID={`${testID}-option-${option.value}`}
                >
                  {option.icon ? (
                    <AppIcon
                      color={selected ? colors.primary : colors.textMuted}
                      name={option.icon}
                      size={18}
                    />
                  ) : null}
                  <View style={{ flex: 1, marginLeft: option.icon ? 10 : 0 }}>
                    <Text
                      numberOfLines={1}
                      textStyle={{
                        color: selected ? colors.text : colors.textMuted,
                        fontSize: 15,
                        fontWeight: selected ? '600' : '500',
                      }}
                    >
                      {option.label}
                    </Text>
                  </View>
                  {selected ? <AppIcon color={colors.primary} name="check" size={18} /> : null}
                </Pressable>
              );
            })}
            {toggles.map((toggle, index) => (
              <Pressable
                accessibilityLabel={toggle.label}
                accessibilityRole="switch"
                accessibilityState={{ checked: toggle.value }}
                key={toggle.testID ?? toggle.label}
                onPress={() => toggle.onChange(!toggle.value)}
                style={({ pressed }) => ({
                  alignItems: 'center',
                  backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                  flexDirection: 'row',
                  minHeight: 48,
                  paddingHorizontal: 14,
                  opacity: pressed ? 0.8 : 1,
                  ...(index > 0 ? { borderTopColor: colors.border, borderTopWidth: 1 } : {}),
                })}
                testID={toggle.testID ?? `${testID}-toggle-${index}`}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    textStyle={{ color: colors.text, fontSize: 15, fontWeight: '500' }}
                  >
                    {toggle.label}
                  </Text>
                </View>
                <View
                  style={{
                    alignItems: 'center',
                    backgroundColor: toggle.value ? colors.primary : 'transparent',
                    borderColor: toggle.value ? colors.primary : colors.border,
                    borderRadius: 8,
                    borderWidth: 1,
                    height: 22,
                    justifyContent: 'center',
                    width: 22,
                  }}
                >
                  {toggle.value ? (
                    <AppIcon color={colors.onPrimary} name="check" size={16} />
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
