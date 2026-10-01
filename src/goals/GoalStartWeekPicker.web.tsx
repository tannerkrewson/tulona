import { Column, Row } from '@ui/primitives';
import type { ChangeEvent } from 'react';
import { Text as NativeText, View } from 'react-native';

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
      <Row alignment="center" spacing={8} style={{ width: '100%' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <NativeText
            numberOfLines={1}
            style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}
            testID="goal-start-week-range"
          >
            {valueLabel}
          </NativeText>
        </View>
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
            boxSizing: 'border-box',
            borderColor: colors.border,
            borderRadius: 10,
            borderStyle: 'solid',
            borderWidth: 1,
            color: colors.text,
            flexBasis: 144,
            flexGrow: 0,
            flexShrink: 0,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            fontSize: 14,
            fontWeight: 600,
            height: 42,
            maxWidth: '48%',
            minWidth: 0,
            paddingLeft: 10,
            paddingRight: 8,
            width: 144,
          }}
          type="date"
          value={localDateValue(value)}
        />
      </Row>
    </Column>
  );
}
