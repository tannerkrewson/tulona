import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { useAppTheme } from '@theme';
import { AppButton } from '@ui';
import { localDateTimeInputValue, parseLocalDateTimeInput } from './session-time';
import type { SessionDateTimePickerProps } from './SessionDateTimePicker';

/** Browser values remain drafts until Done, matching the native wheel picker. */
export function SessionDateTimePicker(props: SessionDateTimePickerProps) {
  if (!props.target) return null;
  return <WebPicker key={props.target} {...props} />;
}

function WebPicker({
  target,
  title,
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
  const label = title ?? `${target === 'start' ? 'Start' : 'End'} date and time`;
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
    <Modal transparent animationType="fade" visible onRequestClose={onDismiss}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel date and time picker"
          onPress={onDismiss}
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: colors.background,
            opacity: 0.75,
          }}
        />
        <View
          accessibilityViewIsModal
          style={{
            alignSelf: 'center',
            maxWidth: 420,
            width: '100%',
            backgroundColor: colors.surface,
            borderRadius: 18,
            padding: 20,
            gap: 16,
          }}
          testID="activity-session-web-picker-modal"
        >
          <Text
            accessibilityRole="header"
            style={{ color: colors.text, fontSize: 20, fontWeight: '600' }}
          >
            {label}
          </Text>
          <input
            aria-label={label}
            autoFocus
            type="datetime-local"
            value={draft}
            step={60}
            min={minimumDate ? localDateTimeInputValue(minimumDate.getTime()) : undefined}
            max={maximumDate ? localDateTimeInputValue(maximumDate.getTime()) : undefined}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'session-picker-error' : undefined}
            onChange={(event) => {
              setDraft(event.target.value);
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
      </View>
    </Modal>
  );
}
