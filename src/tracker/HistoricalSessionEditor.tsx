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
  const [pickerMode, setPickerMode] = useState<'time' | 'datetime'>('time');
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
  const closePicker = () => {
    pickerTargetRef.current = null;
    setPickerTarget(null);
    setPickerValueMs(null);
  };

  const openPicker = (target: SessionDateTimePickerTarget, mode: 'time' | 'datetime' = 'time') => {
    setPickerMode(mode);
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
        style={[styles.timeControl, { backgroundColor: colors.surfaceMuted }]}
        testID="activity-session-time-control"
      >
        {(['start', 'end'] as const).map((target) => {
          const editable = !busy && (target === 'start' || canEditEnd);
          const ms = target === 'start' ? startMs : endMs;
          const text =
            target === 'start'
              ? formatSessionTime(startMs)
              : following
                ? toValue
                : isActive
                  ? 'Now'
                  : 'No end recorded';
          return (
            <View
              key={target}
              style={[
                styles.timeSection,
                target === 'end'
                  ? { borderLeftWidth: 1, borderLeftColor: colors.background }
                  : null,
              ]}
            >
              <Text textStyle={{ color: colors.textMuted, fontSize: 12, fontWeight: '600' }}>
                {target === 'start' ? 'FROM' : 'TO'}
              </Text>
              <Pressable
                disabled={!editable}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${target} time, ${text}`}
                onPress={() => openPicker(target, 'time')}
                style={{ minHeight: 44, justifyContent: 'center' }}
                testID={target === 'start' ? 'activity-session-from' : 'activity-session-to'}
              >
                <Text
                  numberOfLines={1}
                  textStyle={{
                    color: ms === null ? colors.textMuted : colors.text,
                    fontSize: 23,
                    fontWeight: '600',
                  }}
                >
                  {text}
                </Text>
              </Pressable>
              <Pressable
                disabled={!editable}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${target} date and time`}
                onPress={() => openPicker(target, 'datetime')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}
                testID={`activity-session-${target}-date`}
              >
                <AppIcon name="calendar-days" size={14} color={colors.textMuted} />
                <Text numberOfLines={1} textStyle={{ color: colors.textMuted, fontSize: 11 }}>
                  {ms === null ? 'Still running' : formatSessionDate(ms)}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
      {pickerTarget === 'start' && previous && previousLabel ? (
        <Text
          textStyle={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}
        >{`Changing the start also changes when ${previousLabel} ends.`}</Text>
      ) : null}
      {pickerTarget === 'end' && following && followingLabel ? (
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
        mode={pickerMode}
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
  timeControl: { borderRadius: 18, width: '100%', flexDirection: 'row', overflow: 'hidden' },
  timeSection: { flex: 1, minWidth: 0, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
});
