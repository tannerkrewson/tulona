import { Picker } from '@expo/ui';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { timestampMs, type CatalogCollection, type TimeTransition } from '@domain';
import { useAppTheme } from '@theme';
import { FormContent, FormPickerRow, FormRow, FormSection, FormSheet } from '@ui';
import { SessionActivityChoices } from './SessionActivityChoices';
import { SessionDateTimePicker } from './SessionDateTimePicker';
import { formatSessionDate, formatSessionTime } from './session-time';

export type SessionCorrectionIntent = 'switch' | 'stop';

const MINUTES_AGO = [5, 15, 30, 60] as const;
type WhenChoice = 'now' | 'custom' | 'replace' | `${(typeof MINUTES_AGO)[number]}`;

function minutesAgoLabel(minutes: number): string {
  return minutes === 60 ? '1 hour ago' : `${minutes} minutes ago`;
}

function shortDuration(durationMs: number): string {
  const totalMinutes = Math.floor(Math.max(0, durationMs) / 60_000);
  if (totalMinutes < 1) return 'under a minute';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

interface Props {
  intent: SessionCorrectionIntent | null;
  onClose: () => void;
  transition: TimeTransition;
  activityName: string;
  catalog: CatalogCollection;
  nowMs: number;
  busy: boolean;
  error: string | null;
  onSave: (activityId: string | null, timestamp: number) => Promise<boolean>;
  /** Relabels the whole running session instead of ending it. */
  onReplace: (activityId: string) => Promise<boolean>;
}

/**
 * Ends the running session at a chosen time, either switching to another
 * activity or stopping. "Now" is the default, so the same sheet covers both a
 * live switch and one the user forgot to record.
 */
export function ActiveSessionCorrection({
  intent,
  onClose,
  transition,
  activityName,
  catalog,
  nowMs,
  busy,
  error,
  onSave,
  onReplace,
}: Props) {
  const { colors } = useAppTheme();
  const [openIntent, setOpenIntent] = useState<SessionCorrectionIntent | null>(intent);
  const [shownIntent, setShownIntent] = useState<SessionCorrectionIntent>(intent ?? 'switch');
  const [activityId, setActivityId] = useState<string | null>(null);
  const [when, setWhen] = useState<WhenChoice>('now');
  const [customMs, setCustomMs] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  if (intent !== openIntent) {
    setOpenIntent(intent);
    if (intent) {
      setShownIntent(intent);
      setActivityId(null);
      setWhen('now');
      setCustomMs(null);
      setPicking(false);
      setPickerError(null);
    }
  }

  const stopping = shownIntent === 'stop';
  const startMs = timestampMs(transition.timestamp);
  const minuteFloor = (ms: number) => Math.floor(ms / 60_000) * 60_000;
  const replacing = !stopping && when === 'replace';
  const boundaryMs =
    when === 'now' || when === 'replace'
      ? nowMs
      : when === 'custom'
        ? (customMs ?? nowMs)
        : minuteFloor(nowMs - Number(when) * 60_000);
  const quickChoices = MINUTES_AGO.filter(
    (minutes) => minuteFloor(nowMs - minutes * 60_000) > startMs
  );
  const nextActivity = catalog.activities.find(
    (item) => item.id === activityId && item.archivedAt === null
  );
  const validTime = replacing || (boundaryMs > startMs && boundaryMs <= nowMs);
  const endLabel = when === 'now' ? 'now' : formatSessionTime(boundaryMs);
  const summary = replacing
    ? `${nextActivity?.name ?? 'The activity you choose'} replaces ${activityName} for this whole session, starting ${formatSessionTime(startMs)}.`
    : `${activityName} will be logged from ${formatSessionTime(startMs)} to ${endLabel} (${shortDuration(boundaryMs - startMs)}).${
        stopping
          ? ''
          : nextActivity
            ? ` ${nextActivity.name} starts ${when === 'now' ? 'now' : `at ${endLabel}`}.`
            : ''
      }`;
  const message =
    pickerError ??
    error ??
    (validTime ? null : `Choose a time after ${formatSessionTime(startMs)}.`);

  const chooseWhen = (next: WhenChoice) => {
    setPickerError(null);
    if (next === 'custom') {
      setPicking(true);
      return;
    }
    setPicking(false);
    setWhen(next);
  };

  const save = () => {
    const saving =
      replacing && nextActivity
        ? onReplace(nextActivity.id)
        : onSave(stopping ? null : activityId, when === 'now' ? Date.now() : boundaryMs);
    void saving.then((saved) => {
      if (saved) onClose();
    });
  };

  return (
    <FormSheet
      confirmDisabled={busy || picking || !validTime || (!stopping && !nextActivity)}
      confirmLabel={busy ? 'Saving…' : stopping ? 'Stop' : replacing ? 'Replace' : 'Switch'}
      onClose={() => {
        if (!busy) onClose();
      }}
      onConfirm={save}
      testID="activity-session-correction-sheet"
      title={stopping ? `Stop ${activityName}` : 'Switch Activity'}
      visible={intent !== null}
    >
      <FormSection
        footer={message ?? summary}
        footerTestID="activity-session-switch-preview"
        footerTone={message ? 'danger' : 'muted'}
      >
        <FormPickerRow
          enabled={!busy}
          label={stopping ? 'Stopped' : 'Switched'}
          onValueChange={(next) => chooseWhen(next as WhenChoice)}
          selectedValue={picking ? 'custom' : when}
          testID="activity-session-switch-time"
        >
          <Picker.Item label="Now" value="now" />
          {quickChoices.map((minutes) => (
            <Picker.Item key={minutes} label={minutesAgoLabel(minutes)} value={`${minutes}`} />
          ))}
          <Picker.Item label="Other time" value="custom" />
          {stopping ? null : (
            <Picker.Item
              label={`From ${formatSessionTime(startMs)} (replace ${activityName})`}
              value="replace"
            />
          )}
        </FormPickerRow>
        {when === 'custom' && customMs !== null && !picking ? (
          <FormRow
            disabled={busy}
            label="Time"
            onPress={() => setPicking(true)}
            testID="activity-session-switch-date"
            value={
              formatSessionDate(customMs) === formatSessionDate(nowMs)
                ? formatSessionTime(customMs)
                : `${formatSessionDate(customMs)}, ${formatSessionTime(customMs)}`
            }
          />
        ) : null}
      </FormSection>
      {picking ? (
        <FormContent>
          <SessionDateTimePicker
            target="end"
            mode="datetime"
            value={new Date(customMs ?? minuteFloor(nowMs))}
            minimumDate={new Date(startMs + 1)}
            maximumDate={new Date(nowMs)}
            onDismiss={() => setPicking(false)}
            onError={setPickerError}
            onValueChange={(date) => {
              setCustomMs(date.getTime());
              setWhen('custom');
              setPicking(false);
              setPickerError(null);
            }}
          />
        </FormContent>
      ) : null}
      {stopping ? null : (
        <View style={styles.choices}>
          <Text style={[styles.choicesTitle, { color: colors.textMuted }]}>Switch to</Text>
          <SessionActivityChoices
            catalog={catalog}
            selectedId={activityId}
            excludeId={transition.activityId}
            activeOnly
            activitiesOnly
            busy={busy}
            onChoose={setActivityId}
          />
        </View>
      )}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  choices: { gap: 8, width: '100%' },
  choicesTitle: {
    fontSize: 15,
    fontWeight: '600',
    paddingHorizontal: 16,
  },
});
