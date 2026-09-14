import { Text } from '@expo/ui';
import { useAppTheme } from '@theme';
import { Pressable, StyleSheet, View } from 'react-native';

import type { HistoryBreakdownMode } from './analytics-data';

export interface BreakdownToggleProps {
  value: HistoryBreakdownMode;
  onChange: (value: HistoryBreakdownMode) => void;
  testID?: string;
}

const OPTIONS: readonly { value: HistoryBreakdownMode; label: string }[] = [
  { value: 'activities', label: 'Activities' },
  { value: 'folders', label: 'Folders' },
];

/** Native-sized Activities/Folders switch shared by every analytics range. */
export function BreakdownToggle({ value, onChange, testID }: BreakdownToggleProps) {
  const { colors } = useAppTheme();

  return (
    <View
      accessibilityLabel="History breakdown"
      style={[styles.container, { backgroundColor: colors.surfaceMuted }]}
      testID={testID}
    >
      {OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityLabel={`${option.label} breakdown`}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.option,
              {
                backgroundColor: selected ? colors.surface : 'transparent',
                borderColor: selected ? colors.border : 'transparent',
              },
              pressed ? styles.pressed : null,
            ]}
            testID={testID ? `${testID}-${option.value}` : `history-breakdown-${option.value}`}
          >
            <Text
              textStyle={{
                color: selected ? colors.text : colors.textMuted,
                fontSize: 14,
                fontWeight: selected ? '700' : '600',
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    width: '100%',
  },
  option: {
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 8,
  },
  pressed: {
    opacity: 0.72,
  },
});
