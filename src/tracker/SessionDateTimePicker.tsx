import { Column, Text } from '@expo/ui';
import DateTimePickerComponent from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton } from '@ui';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '@theme';

import { combinePickerDateAndTime } from './session-time';

export type SessionDateTimePickerTarget = 'start' | 'end';

export interface SessionDateTimePickerProps {
  target: SessionDateTimePickerTarget | null;
  title?: string;
  value: Date;
  minimumDate?: Date;
  maximumDate?: Date;
  onValueChange: (date: Date, target: SessionDateTimePickerTarget) => void;
  onDismiss: () => void;
  onError: (message: string) => void;
}

type AndroidPickerStage = 'date' | 'time';

/**
 * Uses the community picker on native platforms. Android v57 exposes date
 * and time dialogs separately, so the two dialogs are composed into one
 * date-and-time edit before the caller receives the final local Date.
 */
export function SessionDateTimePicker({ target, ...props }: SessionDateTimePickerProps) {
  if (!target) return null;
  return <SessionDateTimePickerNative key={target} target={target} {...props} />;
}

function SessionDateTimePickerNative({
  target,
  title,
  value,
  minimumDate,
  maximumDate,
  onValueChange,
  onDismiss,
  onError,
}: Omit<SessionDateTimePickerProps, 'target'> & {
  target: SessionDateTimePickerTarget;
}) {
  const { colorScheme, colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(value);
  const [validationError, setValidationError] = useState<string | null>(null);
  const commit = (date: Date) => {
    const next = date.getTime();
    if (
      !Number.isFinite(next) ||
      (minimumDate && next < minimumDate.getTime()) ||
      (maximumDate && next > maximumDate.getTime())
    ) {
      const message = 'Choose a date and time within this session’s available range.';
      if (Platform.OS === 'android') {
        onError(message);
        onDismiss();
      } else setValidationError(message);
      return;
    }
    onValueChange(date, target);
  };
  const [androidStage, setAndroidStage] = useState<AndroidPickerStage>('date');
  const [androidDate, setAndroidDate] = useState<Date | null>(null);

  const selectNativeValue = (date: Date) => {
    if (!Number.isFinite(date.getTime())) {
      onError('The selected date and time is invalid.');
      onDismiss();
      return;
    }
    if (Platform.OS === 'android' && androidStage === 'date') {
      setAndroidDate(combinePickerDateAndTime(date, value, true));
      setAndroidStage('time');
      return;
    }
    const nextDate =
      Platform.OS === 'android' && androidDate ? combinePickerDateAndTime(androidDate, date) : date;
    if (Platform.OS === 'ios') {
      setDraft(nextDate);
      setValidationError(null);
    } else commit(nextDate);
  };

  if (Platform.OS === 'android') {
    return (
      <DateTimePickerComponent
        key={`${target}-${androidStage}`}
        accentColor={colors.primary}
        display="default"
        is24Hour={false}
        maximumDate={maximumDate}
        minimumDate={minimumDate}
        mode={androidStage}
        negativeButton={{ label: 'Cancel' }}
        onDismiss={onDismiss}
        onValueChange={(_event, date) => selectNativeValue(date)}
        positiveButton={{ label: androidStage === 'date' ? 'Next' : 'Done' }}
        presentation="dialog"
        testID="activity-session-native-date-time-picker"
        value={androidDate ?? value}
      />
    );
  }

  if (Platform.OS !== 'ios') return null;

  return (
    <Modal animationType="slide" onRequestClose={onDismiss} transparent visible>
      <View style={[styles.pickerRoot, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <Pressable
          accessibilityHint="Closes the date and time picker without making changes"
          accessibilityLabel="Cancel date and time picker"
          accessibilityRole="button"
          onPress={onDismiss}
          style={styles.pickerScrim}
        />
        <View
          accessibilityViewIsModal
          importantForAccessibility="yes"
          style={[styles.pickerSurface, { backgroundColor: colors.surface }]}
          testID="activity-session-native-picker-modal"
        >
          <Column spacing={12} style={{ width: '100%' }}>
            <Text textStyle={{ color: colors.text, fontSize: 19, fontWeight: '700' }}>
              {title ?? `${target === 'start' ? 'Start' : 'End'} date and time`}
            </Text>
            <DateTimePickerComponent
              accentColor={colors.primary}
              display="spinner"
              maximumDate={maximumDate}
              minimumDate={minimumDate}
              mode="datetime"
              onDismiss={onDismiss}
              onValueChange={(_event, date) => selectNativeValue(date)}
              testID="activity-session-native-date-time-picker"
              themeVariant={colorScheme}
              value={draft}
            />
            {validationError ? (
              <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>
                {validationError}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8, width: '100%' }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppButton
                  label="Cancel"
                  onPress={onDismiss}
                  variant="outlined"
                  style={{ width: '100%', height: 48 }}
                  testID="activity-session-picker-cancel"
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppButton
                  label="Done"
                  onPress={() => commit(draft)}
                  style={{ width: '100%', height: 48 }}
                  testID="activity-session-picker-done"
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
  pickerRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 20,
  },
  pickerScrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.46)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  pickerSurface: {
    alignSelf: 'center',
    borderRadius: 18,
    maxWidth: 560,
    padding: 20,
    width: '100%',
  },
});
