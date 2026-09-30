import { Column, Text } from '@expo/ui';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { timestampMs, type TimeTransition } from '@domain';
import { useAppTheme } from '@theme';
import { AppIcon } from '@icons';

import { SessionDateTimePicker, type SessionDateTimePickerTarget } from './SessionDateTimePicker';
import { formatSessionDate, formatSessionTime } from './session-time';

export interface HistoricalSessionEditorProps {
  transition: TimeTransition;
  previous: TimeTransition | null;
  following: TimeTransition | null;
  activityLabel: string;
  previousLabel: string | null;
  followingLabel: string | null;
  isActive: boolean;
  nowMs: number;
  busy: boolean;
  onSaveStart: (timestamp: number) => Promise<void>;
  onSaveEnd: (timestamp: number) => Promise<void>;
}

/**
 * Sessions are projections between shared tracker transitions. Each picker
 * edits one transition, moving this session and its neighbor together. An
 * active session has no end transition until the user chooses a concrete end.
 */
export function HistoricalSessionEditor({
  transition,
  previous,
  following,
  previousLabel,
  followingLabel,
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
  const canEditEnd = following !== null;
  const pickerValue = pickerValueMs ?? startMs;
  const pickerMinimumMs =
    pickerTarget === 'start'
      ? previous
        ? timestampMs(previous.timestamp) + 1
        : undefined
      : startMs + 1;
  const pickerMaximumMs = pickerTarget === 'start' ? (endMs === null ? nowMs : endMs - 1) : nowMs;
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

  return (
    <Column spacing={8} style={{ width: '100%' }} testID="activity-session-edit-times">
      <View
        style={[
          styles.timeControl,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
        testID="activity-session-time-control"
      >
        <Pressable
          accessibilityHint="Choose the session start date and time"
          accessibilityLabel={`Started ${formatSessionDate(startMs)}, ${formatSessionTime(startMs)}`}
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
          <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>Started</Text>
          <View style={styles.value}>
            <Text textStyle={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
              {formatSessionTime(startMs)}
            </Text>
            <Text textStyle={{ color: colors.textMuted, fontSize: 12 }}>
              {formatSessionDate(startMs)}
            </Text>
          </View>
          <AppIcon name="pencil" color={colors.textMuted} size={16} />
        </Pressable>
        <View
          style={[styles.timeDivider, { backgroundColor: colors.border }]}
          testID="activity-session-time-divider"
        />
        <Pressable
          accessibilityHint={
            canEditEnd
              ? 'Choose the session end date and time'
              : isActive
                ? 'Use Stop tracking above to record an end'
                : 'No end has been recorded'
          }
          accessibilityLabel={
            following
              ? `Ended ${toDateContext}, ${toValue}`
              : isActive
                ? 'Still running'
                : 'No end recorded'
          }
          accessibilityRole="button"
          accessibilityState={{ disabled: busy || !canEditEnd }}
          disabled={busy || !canEditEnd}
          onPress={() => openPicker('end')}
          style={({ pressed }) => [
            styles.timeSection,
            { opacity: busy ? 0.45 : pressed ? 0.72 : 1 },
          ]}
          testID="activity-session-to"
        >
          <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>
            {following ? 'Ended' : 'End'}
          </Text>
          <View style={styles.value}>
            <Text textStyle={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
              {isActive && !following ? 'Still running' : toValue}
            </Text>
            {following ? (
              <Text textStyle={{ color: colors.textMuted, fontSize: 12 }}>{toDateContext}</Text>
            ) : null}
          </View>
          <AppIcon name={canEditEnd ? 'pencil' : 'clock'} color={colors.textMuted} size={16} />
        </Pressable>
      </View>
      {previous && previousLabel ? (
        <Text
          textStyle={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}
        >{`Changing the start also changes when ${previousLabel} ends.`}</Text>
      ) : null}
      {following && followingLabel ? (
        <Text
          textStyle={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}
        >{`Changing the end also changes when ${followingLabel} starts.`}</Text>
      ) : null}
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
  timeControl: { borderRadius: 12, borderWidth: 1, width: '100%' },
  timeSection: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, padding: 14 },
  value: { flex: 1, minWidth: 0, gap: 3, alignItems: 'flex-end' },
  timeDivider: { height: 1, marginHorizontal: 14 },
});
