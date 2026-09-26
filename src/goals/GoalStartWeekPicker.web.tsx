import { Column, Text } from '@expo/ui';
import type { ChangeEvent } from 'react';
import { View } from 'react-native';

import { useAppTheme } from '@theme';
import type { GoalStartWeekPickerProps } from './GoalStartWeekPicker';

function localDateValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateFromLocalValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function GoalStartWeekPicker({
  value,
  valueLabel,
  maximumDate,
  onValueChange,
}: GoalStartWeekPickerProps) {
  const { colors } = useAppTheme();
  const maximumValue = localDateValue(maximumDate);
  return (
    <Column spacing={8} style={{ width: '100%' }}>
      <Text
        textStyle={{ color: colors.text, fontSize: 16, fontWeight: '600' }}
        testID="goal-start-week-range"
      >
        {valueLabel}
      </Text>
      <View style={{ width: '100%' }}>
        <input
          aria-label="Starting week"
          data-testid="goal-start-week-date"
          max={maximumValue}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const date = dateFromLocalValue(event.currentTarget.value);
            if (date) onValueChange(date);
          }}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 10,
            borderStyle: 'solid',
            borderWidth: 1,
            color: colors.text,
            font: 'inherit',
            height: 48,
            paddingLeft: 12,
            paddingRight: 12,
            width: '100%',
          }}
          type="date"
          value={localDateValue(value)}
        />
      </View>
    </Column>
  );
}
