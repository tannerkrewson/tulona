import { Column, Text } from '@expo/ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import type { TimeTransition } from '@domain';
import { useAppTheme } from '@theme';
import { AccessibleTextInput, AppButton } from '@ui';

function localDateTimeValue(timestamp: string): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function parseLocalDateTime(value: string): number | null {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export interface HistoricalSessionEditorProps {
  transition: TimeTransition;
  following: TimeTransition | null;
  busy: boolean;
  onSaveStart: (timestamp: number) => Promise<void>;
  onSaveEnd: (timestamp: number) => Promise<void>;
}

/**
 * Historical sessions are derived from transition boundaries. Editing a
 * session's end therefore edits the following boundary, keeping the existing
 * tracker service as the single overlap validator and mutation path.
 */
export function HistoricalSessionEditor({
  transition,
  following,
  busy,
  onSaveStart,
  onSaveEnd,
}: HistoricalSessionEditorProps) {
  const { colors } = useAppTheme();
  const [startValue, setStartValue] = useState(() => localDateTimeValue(transition.timestamp));
  const [endValue, setEndValue] = useState(() =>
    following ? localDateTimeValue(following.timestamp) : ''
  );
  const [startError, setStartError] = useState<string | null>(null);
  const [endError, setEndError] = useState<string | null>(null);

  useEffect(() => {
    setStartValue(localDateTimeValue(transition.timestamp));
    setStartError(null);
  }, [transition.timestamp]);

  useEffect(() => {
    setEndValue(following ? localDateTimeValue(following.timestamp) : '');
    setEndError(null);
  }, [following?.timestamp]);

  const saveStart = async () => {
    const nextStart = parseLocalDateTime(startValue);
    if (nextStart === null) {
      setStartError('Enter a valid start date and time.');
      return;
    }
    if (following) {
      const end = new Date(following.timestamp).getTime();
      if (nextStart >= end) {
        setStartError('Start must remain before the session end.');
        return;
      }
    }
    setStartError(null);
    await onSaveStart(nextStart);
  };

  const saveEnd = async () => {
    if (!following) return;
    const nextEnd = parseLocalDateTime(endValue);
    const start = new Date(transition.timestamp).getTime();
    if (nextEnd === null) {
      setEndError('Enter a valid end date and time.');
      return;
    }
    if (nextEnd <= start) {
      setEndError('End must remain after the session start.');
      return;
    }
    setEndError(null);
    await onSaveEnd(nextEnd);
  };

  return (
    <Column
      spacing={12}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
        width: '100%',
      }}
      testID="activity-session-edit-times"
    >
      <Column spacing={3} style={{ width: '100%' }}>
        <Text textStyle={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>
          Edit session times
        </Text>
        <Text textStyle={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
          Changes are checked against neighboring sessions.
        </Text>
      </Column>

      <Column spacing={6} style={{ width: '100%' }} testID="activity-session-edit-start">
        <AccessibleTextInput
          label="Session start"
          onChangeText={setStartValue}
          testID="activity-session-start"
          defaultValue={startValue}
          textStyle={{ fontSize: 15 }}
        />
        <View style={{ alignItems: 'flex-end', width: '100%' }}>
          <AppButton
            disabled={busy}
            label="Save start"
            onPress={() => void saveStart()}
            style={{ height: 44, width: 128 }}
            testID="activity-session-save-start"
            variant="outlined"
          />
        </View>
        {startError ? (
          <Text textStyle={{ color: colors.danger.foreground, fontSize: 13 }}>{startError}</Text>
        ) : null}
      </Column>

      <Column spacing={6} style={{ width: '100%' }} testID="activity-session-edit-end">
        {following ? (
          <>
            <AccessibleTextInput
              label="Session end"
              onChangeText={setEndValue}
              testID="activity-session-end"
              defaultValue={endValue}
              textStyle={{ fontSize: 15 }}
            />
            <View style={{ alignItems: 'flex-end', width: '100%' }}>
              <AppButton
                disabled={busy}
                label="Save end"
                onPress={() => void saveEnd()}
                style={{ height: 44, width: 128 }}
                testID="activity-session-save-end"
                variant="outlined"
              />
            </View>
            {endError ? (
              <Text textStyle={{ color: colors.danger.foreground, fontSize: 13 }}>{endError}</Text>
            ) : null}
          </>
        ) : (
          <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
            This session has no recorded end yet.
          </Text>
        )}
      </Column>
    </Column>
  );
}
