import { useState } from 'react';
import { Text, View } from 'react-native';

import { useAppTheme } from '@theme';
import { AppButton } from '@ui';
import { localDateTimeInputValue, parseLocalDateTimeInput } from './session-time';
import type { SessionDateTimePickerProps } from './SessionDateTimePicker';

/** Browser values remain drafts until Done, matching the native wheel picker. */
export function SessionDateTimePicker(props: SessionDateTimePickerProps) {
  if (!props.target) return null;
  return <WebPicker key={`${props.target}-${props.mode}`} {...props} />;
}

function WebPicker({
  target,
  title,
  mode = 'datetime',
  value,
  minimumDate,
  maximumDate,
  onValueChange,
  onDismiss,
}: SessionDateTimePickerProps) {
  const { colors, colorScheme } = useAppTheme();
  const [initialDate] = useState(value);
  const [draft, setDraft] = useState(() => localDateTimeInputValue(value.getTime()));
  const [error, setError] = useState<string | null>(null);
  const label =
    title ??
    `${target === 'start' ? 'Start' : 'End'} ${mode === 'time' ? 'time' : 'date and time'}`;
  const inputValue = mode === 'time' ? draft.slice(11) : draft;
  const commit = () => {
    const date =
      draft === localDateTimeInputValue(initialDate.getTime())
        ? initialDate
        : parseLocalDateTimeInput(draft);
    if (
      !target ||
      !date ||
      (minimumDate && date < minimumDate) ||
      (maximumDate && date > maximumDate)
    ) {
      setError('Choose a valid date and time within this session’s available range.');
      return;
    }
    onValueChange(date, target);
  };
  return (
    <View style={{ width: '100%', gap: 10 }} testID="activity-session-web-picker">
      <input
        aria-label={label}
        autoFocus
        type={mode === 'time' ? 'time' : 'datetime-local'}
        value={inputValue}
        step={60}
        min={
          mode === 'datetime' && minimumDate
            ? localDateTimeInputValue(minimumDate.getTime())
            : undefined
        }
        max={
          mode === 'datetime' && maximumDate
            ? localDateTimeInputValue(maximumDate.getTime())
            : undefined
        }
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'session-picker-error' : undefined}
        onChange={(event) => {
          setDraft(
            mode === 'time'
              ? `${localDateTimeInputValue(initialDate.getTime()).slice(0, 10)}T${event.target.value}`
              : event.target.value
          );
          setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onDismiss();
          if (event.key === 'Enter') commit();
        }}
        style={{
          boxSizing: 'border-box',
          width: '100%',
          minWidth: 0,
          height: 48,
          borderRadius: 10,
          border: `1px solid ${colors.border}`,
          padding: 12,
          background: colors.surfaceMuted,
          color: colors.text,
          font: 'inherit',
          colorScheme,
        }}
      />
      {error ? (
        <Text
          nativeID="session-picker-error"
          accessibilityRole="alert"
          style={{ color: colors.danger.foreground, fontSize: 14 }}
        >
          {error}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppButton
            label="Cancel"
            variant="outlined"
            onPress={onDismiss}
            style={{ width: '100%', height: 48 }}
            testID="activity-session-picker-cancel"
          />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppButton
            label="Done"
            onPress={commit}
            style={{ width: '100%', height: 48 }}
            testID="activity-session-picker-done"
          />
        </View>
      </View>
    </View>
  );
}
