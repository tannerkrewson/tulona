import { useEffect, useRef, type ChangeEvent } from 'react';
import { View } from 'react-native';

import { localDateTimeInputValue, parseLocalDateTimeInput } from './session-time';
import type { SessionDateTimePickerProps } from './SessionDateTimePicker';

/**
 * @expo/ui intentionally renders no web picker. Keep the same accessible
 * section targets and open the browser's native datetime-local picker from a
 * visually hidden input so web users never lose time editing silently.
 */
export function SessionDateTimePicker({
  target,
  value,
  minimumDate,
  maximumDate,
  onValueChange,
  onDismiss,
  onError,
}: SessionDateTimePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onErrorRef = useRef(onError);
  const valueMs = value.getTime();
  const minimumMs = minimumDate?.getTime();
  const maximumMs = maximumDate?.getTime();

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    const input = inputRef.current;
    if (!target || !input) return;
    input.value = localDateTimeInputValue(valueMs);
    input.focus({ preventScroll: true });
    const browserInput = input as HTMLInputElement & { showPicker?: () => void };
    try {
      if (typeof browserInput.showPicker === 'function') {
        browserInput.showPicker();
      } else {
        input.click();
      }
    } catch {
      try {
        input.click();
      } catch {
        onErrorRef.current('This browser could not open its native date and time picker.');
      }
    }
  }, [target, valueMs]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.min = minimumMs === undefined ? '' : localDateTimeInputValue(minimumMs);
    input.max = maximumMs === undefined ? '' : localDateTimeInputValue(maximumMs);
  }, [maximumMs, minimumMs]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!target) return;
    const date = parseLocalDateTimeInput(event.currentTarget.value);
    if (!date) {
      onError('The selected date and time is invalid.');
      return;
    }
    onValueChange(date, target);
    onDismiss();
  };

  return (
    <View pointerEvents="none" style={styles.host}>
      <input
        aria-hidden="true"
        max={maximumMs === undefined ? undefined : localDateTimeInputValue(maximumMs)}
        min={minimumMs === undefined ? undefined : localDateTimeInputValue(minimumMs)}
        onBlur={() => {
          if (target) onDismiss();
        }}
        onChange={handleChange}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onDismiss();
        }}
        ref={inputRef}
        style={styles.input}
        tabIndex={-1}
        type="datetime-local"
      />
    </View>
  );
}

const styles = {
  host: {
    height: 1,
    left: 0,
    position: 'absolute' as const,
    top: 0,
    width: 1,
  },
  input: {
    height: 1,
    opacity: 0,
    padding: 0,
    position: 'absolute' as const,
    width: 1,
  },
};
