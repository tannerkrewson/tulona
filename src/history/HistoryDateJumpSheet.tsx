import { Column, Text } from '@expo/ui';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  dateForLogicalDay,
  historyPeriodForDate,
  type HistoryPeriod,
  type HistoryPeriodKind,
  type HistoryPeriodOptions,
} from '@domain';
import { useAppTheme } from '@theme';
import { AccessibleTextInput, AppButton } from '@ui';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function initialDateValue(period: HistoryPeriod, rolloverHour: number): string {
  const date = dateForLogicalDay(period.startLogicalDay, rolloverHour);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function validateDateValue(value: string): string {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new RangeError('Enter a date in YYYY-MM-DD format.');
  }
  // The domain parser treats a date-only string as a local calendar date and
  // rejects impossible dates, which avoids the UTC shift of new Date(value).
  const date = dateForLogicalDay(trimmed as HistoryPeriod['startLogicalDay']);
  if (`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` !== trimmed) {
    throw new RangeError('Enter a valid calendar date.');
  }
  return trimmed;
}

export interface HistoryDateJumpSheetProps {
  visible: boolean;
  period: HistoryPeriod;
  options: HistoryPeriodOptions;
  nowMs: number;
  onClose: () => void;
  onSelect: (period: HistoryPeriod) => void;
}

/** A compact, dependency-free date jump surface shared by all History ranges. */
export function HistoryDateJumpSheet({
  visible,
  period,
  options,
  nowMs,
  onClose,
  onSelect,
}: HistoryDateJumpSheetProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const rolloverHour = options.rolloverHour ?? 0;
  const [value, setValue] = useState(() => initialDateValue(period, rolloverHour));
  const [error, setError] = useState<string | null>(null);

  const selectDate = () => {
    try {
      const date = validateDateValue(value);
      const nextPeriod = historyPeriodForDate(period.kind as HistoryPeriodKind, date, options);
      if (nextPeriod.startMs > nowMs) {
        setError('That period has not started yet.');
        return;
      }
      setError(null);
      onSelect(nextPeriod);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Enter a valid date.');
    }
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          accessibilityLabel="Close date navigation"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.scrim}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 18),
            },
          ]}
          testID="history-date-jump-sheet"
        >
          <Column spacing={14} style={{ width: '100%' }}>
            <View style={styles.header}>
              <Text textStyle={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>
                Go to a date
              </Text>
              <Pressable
                accessibilityLabel="Close date navigation"
                accessibilityRole="button"
                onPress={onClose}
                style={styles.close}
                testID="history-date-jump-close"
              >
                <Text textStyle={{ color: colors.textMuted, fontSize: 24 }}>×</Text>
              </Pressable>
            </View>
            <Text textStyle={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
              {`Choose any date to open its ${period.kind} history period.`}
            </Text>
            <AccessibleTextInput
              autoCorrect={false}
              autoFocus
              label="History date"
              onChangeText={(nextValue) => {
                setValue(nextValue);
                if (error) setError(null);
              }}
              placeholder="YYYY-MM-DD"
              testID="history-date-jump-input"
              defaultValue={value}
              textStyle={{ fontSize: 16 }}
            />
            {error ? (
              <Text textStyle={{ color: colors.danger.foreground, fontSize: 13 }}>{error}</Text>
            ) : null}
            <View style={styles.actions}>
              <View style={styles.actionButton}>
                <AppButton
                  label="Cancel"
                  onPress={onClose}
                  style={{ width: '100%' }}
                  testID="history-date-jump-cancel"
                  variant="outlined"
                />
              </View>
              <View style={styles.actionButton}>
                <AppButton
                  label="Go to date"
                  onPress={selectDate}
                  style={{ width: '100%' }}
                  testID="history-date-jump-submit"
                />
              </View>
            </View>
          </Column>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 36,
    width: '100%',
  },
  close: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  actionButton: {
    flex: 1,
  },
});
