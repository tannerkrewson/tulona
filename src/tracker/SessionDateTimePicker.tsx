import DateTimePickerComponent from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { useAppTheme } from '@theme';
import { AppButton } from '@ui';
import { combinePickerDateAndTime } from './session-time';

export type SessionDateTimePickerTarget = 'start' | 'end';
export interface SessionDateTimePickerProps {
  target: SessionDateTimePickerTarget | null;
  title?: string;
  mode?: 'time' | 'datetime';
  value: Date;
  minimumDate?: Date;
  maximumDate?: Date;
  onValueChange: (date: Date, target: SessionDateTimePickerTarget) => void;
  onDismiss: () => void;
  onError: (message: string) => void;
}

/** The wheel lives in its owning sheet; no additional modal or calendar. */
export function SessionDateTimePicker({ target, ...props }: SessionDateTimePickerProps) {
  return target ? (
    <NativePicker key={`${target}-${props.mode}`} target={target} {...props} />
  ) : null;
}
function NativePicker({
  target,
  mode = 'datetime',
  value,
  minimumDate,
  maximumDate,
  onValueChange,
  onDismiss,
  onError,
}: SessionDateTimePickerProps & { target: SessionDateTimePickerTarget }) {
  const { colorScheme, colors } = useAppTheme();
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [androidStage, setAndroidStage] = useState<'date' | 'time'>(
    mode === 'time' ? 'time' : 'date'
  );
  const [androidDate, setAndroidDate] = useState<Date | null>(null);
  const commit = (date: Date) => {
    if (
      !Number.isFinite(date.getTime()) ||
      (minimumDate && date < minimumDate) ||
      (maximumDate && date > maximumDate)
    ) {
      const message = 'Choose a time within the available range.';
      if (Platform.OS === 'android') {
        onError(message);
        onDismiss();
      } else setError(message);
      return;
    }
    onValueChange(date, target);
  };
  const select = (date: Date) => {
    if (Platform.OS === 'android' && androidStage === 'date') {
      setAndroidDate(combinePickerDateAndTime(date, value, true));
      setAndroidStage('time');
      return;
    }
    const nextDate =
      mode === 'time'
        ? combinePickerDateAndTime(value, date)
        : Platform.OS === 'android' && androidDate
          ? combinePickerDateAndTime(androidDate, date)
          : date;
    if (Platform.OS === 'android') commit(nextDate);
    else {
      setDraft(nextDate);
      setError(null);
    }
  };
  if (Platform.OS === 'android')
    return (
      <DateTimePickerComponent
        key={androidStage}
        display="default"
        mode={androidStage}
        presentation="dialog"
        value={androidDate ?? value}
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        onValueChange={(_event, date) => select(date)}
        onDismiss={onDismiss}
        positiveButton={{ label: androidStage === 'date' ? 'Next' : 'Done' }}
        negativeButton={{ label: 'Cancel' }}
        testID="activity-session-native-date-time-picker"
      />
    );
  if (Platform.OS !== 'ios') return null;
  return (
    <View style={{ width: '100%', gap: 10 }} testID="activity-session-native-picker">
      <DateTimePickerComponent
        display="spinner"
        mode={mode}
        themeVariant={colorScheme}
        accentColor={colors.primary}
        value={draft}
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        onValueChange={(_event, date) => select(date)}
        testID="activity-session-native-date-time-picker"
      />
      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.danger.foreground }}>
          {error}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <AppButton
            label="Cancel"
            variant="outlined"
            onPress={onDismiss}
            style={{ width: '100%', height: 44 }}
            testID="activity-session-picker-cancel"
          />
        </View>
        <View style={{ flex: 1 }}>
          <AppButton
            label="Done"
            onPress={() => commit(draft)}
            style={{ width: '100%', height: 44 }}
            testID="activity-session-picker-done"
          />
        </View>
      </View>
    </View>
  );
}
