import { Column, Text } from '@expo/ui';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { timestampMs, type TimeTransition } from '@domain';
import { useAppTheme } from '@theme';

import { SessionDateTimePicker, type SessionDateTimePickerTarget } from './SessionDateTimePicker';
import { formatSessionDate, formatSessionTime } from './session-time';

export interface HistoricalSessionEditorProps {
  transition: TimeTransition;
  previous: TimeTransition | null;
  following: TimeTransition | null;
  isActive: boolean;
  nowMs: number;
  busy: boolean;
  onSaveStart: (timestamp: number) => Promise<void>;
  onSaveEnd: (timestamp: number) => Promise<void>;
}

/**
 * Historical sessions are derived from transition boundaries. Editing a
 * session's end therefore edits the following boundary, keeping the existing
 * tracker service as the single overlap validator and mutation path. An
 * active session has no end transition: its To value remains Now until the
 * user explicitly chooses a concrete end.
 */
export function HistoricalSessionEditor({
  transition,
  previous,
  following,
  isActive,
  nowMs,
  busy,
  onSaveStart,
  onSaveEnd,
}: HistoricalSessionEditorProps) {
  const { colors } = useAppTheme();
  const [pickerTarget, setPickerTarget] = useState<SessionDateTimePickerTarget | null>(null);
  const [pickerValueMs, setPickerValueMs] = useState<number | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const pickerTargetRef = useRef<SessionDateTimePickerTarget | null>(null);

  const startMs = timestampMs(transition.timestamp);
  const endMs = following ? timestampMs(following.timestamp) : null;
  const canEditEnd = following !== null || isActive;
  const pickerValue = pickerValueMs ?? startMs;
  const pickerMinimumMs =
    pickerTarget === 'start' ? (previous ? timestampMs(previous.timestamp) : undefined) : startMs;
  const pickerMaximumMs = pickerTarget === 'start' ? (endMs ?? nowMs) : nowMs;
  const toValue = following
    ? formatSessionTime(timestampMs(following.timestamp))
    : isActive
      ? 'Now'
      : 'No end recorded';
  const toDateContext = following
    ? formatSessionDate(timestampMs(following.timestamp))
    : isActive
      ? formatSessionDate(nowMs)
      : 'open-ended';

  const closePicker = () => {
    pickerTargetRef.current = null;
    setPickerTarget(null);
    setPickerValueMs(null);
  };

  const openPicker = (target: SessionDateTimePickerTarget) => {
    if (busy || (target === 'end' && !canEditEnd)) return;
    const selectedValue = target === 'start' ? startMs : (endMs ?? (isActive ? nowMs : startMs));
    pickerTargetRef.current = target;
    setPickerError(null);
    setPickerValueMs(selectedValue);
    setPickerTarget(target);
  };

  const handlePickerValueChange = (date: Date, target: SessionDateTimePickerTarget) => {
    if (pickerTargetRef.current !== target) return;
    const nextTimestamp = date.getTime();
    closePicker();
    if (!Number.isFinite(nextTimestamp)) {
      setPickerError('The selected date and time is invalid.');
      return;
    }
    void (target === 'start' ? onSaveStart(nextTimestamp) : onSaveEnd(nextTimestamp));
  };

  const fromAccessibilityLabel = `From, ${formatSessionDate(startMs)}, ${formatSessionTime(startMs)}`;
  const toAccessibilityLabel = following
    ? `To, ${formatSessionDate(timestampMs(following.timestamp))}, ${formatSessionTime(timestampMs(following.timestamp))}`
    : isActive
      ? `To, Now, ${formatSessionDate(nowMs)}`
      : 'To, no recorded end';
  const dateContext = `From ${formatSessionDate(startMs)} · To ${toDateContext}`;

  return (
    <Column spacing={8} style={{ width: '100%' }} testID="activity-session-edit-times">
      <Text textStyle={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>
        Edit session times
      </Text>
      <View
        style={[
          styles.timeControl,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
        testID="activity-session-time-control"
      >
        <Pressable
          accessibilityHint="Opens the native date and time picker for the session start"
          accessibilityLabel={fromAccessibilityLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => openPicker('start')}
          style={({ pressed }) => [
            styles.timeSection,
            { opacity: busy ? 0.45 : pressed ? 0.72 : 1 },
          ]}
          testID="activity-session-from"
        >
          <Text textStyle={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>From</Text>
          <Text
            numberOfLines={1}
            textStyle={{ color: colors.text, fontSize: 24, fontWeight: '700' }}
          >
            {formatSessionTime(startMs)}
          </Text>
        </Pressable>
        <View
          style={[styles.timeDivider, { backgroundColor: colors.border }]}
          testID="activity-session-time-divider"
        />
        <Pressable
          accessibilityHint={
            canEditEnd
              ? 'Opens the native date and time picker for the session end'
              : 'This session has no recorded end to edit'
          }
          accessibilityLabel={toAccessibilityLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy || !canEditEnd }}
          disabled={busy || !canEditEnd}
          onPress={() => openPicker('end')}
          style={({ pressed }) => [
            styles.timeSection,
            { opacity: busy || !canEditEnd ? 0.45 : pressed ? 0.72 : 1 },
          ]}
          testID="activity-session-to"
        >
          <Text textStyle={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>To</Text>
          <Text
            numberOfLines={1}
            textStyle={{ color: colors.text, fontSize: 24, fontWeight: '700' }}
          >
            {toValue}
          </Text>
        </Pressable>
      </View>
      <Text
        numberOfLines={2}
        testID="activity-session-time-context"
        textStyle={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}
      >
        {dateContext}
      </Text>
      <Text textStyle={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
        Changes are checked against neighboring sessions.
      </Text>
      {pickerError ? (
        <Text
          testID="activity-session-picker-error"
          textStyle={{ color: colors.danger.foreground, fontSize: 13 }}
        >
          {pickerError}
        </Text>
      ) : null}
      <SessionDateTimePicker
        maximumDate={pickerTarget ? new Date(pickerMaximumMs) : undefined}
        minimumDate={
          pickerTarget && pickerMinimumMs !== undefined ? new Date(pickerMinimumMs) : undefined
        }
        onDismiss={closePicker}
        onError={(message) => {
          setPickerError(message);
          closePicker();
        }}
        onValueChange={handlePickerValueChange}
        target={pickerTarget}
        value={new Date(pickerValue)}
      />
    </Column>
  );
}

const styles = StyleSheet.create({
  timeControl: {
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 88,
    overflow: 'hidden',
    width: '100%',
  },
  timeSection: {
    alignItems: 'flex-start',
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  timeDivider: {
    alignSelf: 'stretch',
    marginVertical: 16,
    width: 1,
  },
});
