import { Text, type TextStyle } from 'react-native';

import { useAppTheme } from '@theme';

export interface DurationTextProps {
  durationMs: number;
  textStyle?: TextStyle;
  testID?: string;
}

/** Formats a non-negative duration as mm:ss, or h:mm:ss after an hour. */
export function formatDuration(durationMs: number): string {
  const totalSeconds = Number.isFinite(durationMs) ? Math.max(0, Math.floor(durationMs / 1000)) : 0;
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;

  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(totalMinutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function DurationText({ durationMs, textStyle, testID }: DurationTextProps) {
  const { colors } = useAppTheme();

  return (
    <Text
      testID={testID}
      style={{ color: colors.text, fontSize: 16, fontWeight: '600', ...textStyle }}
    >
      {formatDuration(durationMs)}
    </Text>
  );
}
