/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 · Native utilitarian form; existing theme tokens. */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatDuration, timestampMs, type CatalogCollection, type TimeTransition } from '@domain';
import { AppIcon } from '@icons';
import { useAppTheme } from '@theme';
import { AppButton } from '@ui';
import { SessionDateTimePicker } from './SessionDateTimePicker';
import { formatSessionDate, formatSessionTime } from './session-time';

interface Props {
  transition: TimeTransition;
  activityName: string;
  catalog: CatalogCollection;
  nowMs: number;
  busy: boolean;
  onSave: (activityId: string | null, timestamp: number) => Promise<boolean>;
}

/** A new boundary preserves the original activity up to the real switch or stop time. */
export function ActiveSessionCorrection({
  transition,
  activityName,
  catalog,
  nowMs,
  busy,
  onSave,
}: Props) {
  const { colors } = useAppTheme();
  const [intent, setIntent] = useState<'switch' | 'stop' | null>(null);
  const [activityId, setActivityId] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [search, setSearch] = useState('');
  const [timeMs, setTimeMs] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const startMs = timestampMs(transition.timestamp);
  const boundaryMs = timeMs ?? nowMs;
  const nextActivity = catalog.activities.find((item) => item.id === activityId);
  const options = catalog.activities
    .filter((item) => item.archivedAt === null && item.id !== transition.activityId)
    .filter((item) =>
      `${item.name} ${catalog.folders.find((folder) => folder.id === item.folderId)?.name ?? ''}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase())
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const validTime = boundaryMs > startMs && boundaryMs <= nowMs;
  const begin = (nextIntent: 'switch' | 'stop') => {
    setIntent(nextIntent);
    setTimeMs(null);
    setPickerError(null);
    setChoosing(nextIntent === 'switch');
    setActivityId(null);
    setSearch('');
  };

  return (
    <View
      style={[styles.section, { borderColor: colors.border }]}
      testID="activity-session-correction"
    >
      <Text style={[styles.heading, { color: colors.text }]}>
        {intent === 'stop' ? 'When did you stop?' : 'What happened next?'}
      </Text>
      {!intent ? (
        <>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            Forgot to switch or stop? Record when it actually happened.
          </Text>
          <View style={{ gap: 8, width: '100%' }}>
            <AppButton
              disabled={busy}
              label="Switch activity"
              onPress={() => begin('switch')}
              testID="activity-session-switch"
              style={{ width: '100%', height: 48 }}
            />
            <AppButton
              disabled={busy}
              label="Stop tracking"
              onPress={() => begin('stop')}
              testID="activity-session-stop"
              variant="outlined"
              style={{ width: '100%', height: 48 }}
            />
          </View>
        </>
      ) : (
        <>
          {intent === 'switch' ? (
            <>
              <Text style={[styles.label, { color: colors.textMuted }]}>Next activity</Text>
              <Pressable
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={
                  nextActivity ? `Next activity, ${nextActivity.name}` : 'Choose an activity'
                }
                accessibilityState={{ disabled: busy, expanded: choosing }}
                onPress={() => setChoosing((value) => !value)}
                style={({ pressed }) => [
                  styles.time,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: busy ? 0.5 : pressed ? 0.7 : 1,
                  },
                ]}
                testID="activity-session-next-activity"
              >
                <Text
                  numberOfLines={1}
                  style={{ flex: 1, minWidth: 0, color: colors.text, fontSize: 15 }}
                >
                  {nextActivity?.name ?? 'Choose an activity'}
                </Text>
                <AppIcon
                  name={choosing ? 'chevron-up' : 'chevron-down'}
                  color={colors.textMuted}
                  size={18}
                />
              </Pressable>
              {choosing ? (
                <View style={styles.options} testID="activity-session-switch-choices">
                  <TextInput
                    accessibilityLabel="Find an activity"
                    placeholder="Find an activity"
                    value={search}
                    onChangeText={setSearch}
                    testID="activity-session-switch-search"
                    editable={!busy}
                    style={{
                      color: colors.text,
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      borderWidth: 1,
                      borderRadius: 10,
                      height: 48,
                      paddingHorizontal: 12,
                    }}
                  />
                  <ScrollView
                    style={{ maxHeight: 240 }}
                    contentContainerStyle={{ gap: 6 }}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                  >
                    {options.map((item) => (
                      <Pressable
                        key={item.id}
                        disabled={busy}
                        accessibilityRole="button"
                        accessibilityLabel={`Switch to ${item.name}`}
                        accessibilityState={{ disabled: busy, selected: item.id === activityId }}
                        onPress={() => {
                          setActivityId(item.id);
                          setChoosing(false);
                        }}
                        style={({ pressed }) => [
                          styles.option,
                          {
                            backgroundColor: colors.surfaceMuted,
                            opacity: busy ? 0.5 : pressed ? 0.7 : 1,
                          },
                        ]}
                        testID={`activity-session-switch-choice-${item.id}`}
                      >
                        <AppIcon name={item.iconName ?? 'activity'} color={colors.text} size={20} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text numberOfLines={1} style={[styles.body, { color: colors.text }]}>
                            {item.name}
                          </Text>
                          {item.folderId ? (
                            <Text
                              numberOfLines={1}
                              style={{ color: colors.textMuted, fontSize: 12 }}
                            >
                              {catalog.folders.find((folder) => folder.id === item.folderId)?.name}
                            </Text>
                          ) : null}
                        </View>
                        <AppIcon name="chevron-right" color={colors.textMuted} size={16} />
                      </Pressable>
                    ))}
                    {options.length === 0 ? (
                      <Text style={[styles.body, { color: colors.textMuted }]}>
                        No other activities found. Add an activity in the tracker, or try another
                        search.
                      </Text>
                    ) : null}
                  </ScrollView>
                </View>
              ) : null}
            </>
          ) : null}
          <Text style={[styles.label, { color: colors.textMuted }]}>
            {intent === 'stop' ? 'Stopped at' : 'Switched at'}
          </Text>
          <Pressable
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            accessibilityLabel={`Choose ${intent === 'stop' ? 'stop' : 'switch'} time, ${formatSessionDate(boundaryMs)}, ${formatSessionTime(boundaryMs)}`}
            onPress={() => {
              setPickerError(null);
              setPickerOpen(true);
            }}
            style={({ pressed }) => [
              styles.time,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: busy ? 0.5 : pressed ? 0.7 : 1,
              },
            ]}
            testID="activity-session-switch-time"
          >
            <View style={{ gap: 3, flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 22, fontWeight: '600' }}>
                {timeMs === null ? 'Now' : formatSessionTime(boundaryMs)}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                {formatSessionDate(boundaryMs)}
              </Text>
            </View>
            <AppIcon name="clock" color={colors.textMuted} size={20} />
          </Pressable>
          <View style={styles.actions}>
            {[0, 15, 30].map((minutes) => {
              const quickTime =
                minutes === 0 ? null : Math.floor((nowMs - minutes * 60_000) / 60_000) * 60_000;
              return (
                <View key={minutes} style={{ flex: 1, minWidth: 0 }}>
                  <AppButton
                    disabled={busy || (quickTime !== null && quickTime <= startMs)}
                    label={minutes === 0 ? 'Now' : `${minutes}m ago`}
                    variant="outlined"
                    onPress={() => {
                      setTimeMs(quickTime);
                      setPickerError(null);
                    }}
                    testID={`activity-session-switch-quick-${minutes}`}
                    style={{ width: '100%', height: 44, paddingHorizontal: 8 }}
                  />
                </View>
              );
            })}
          </View>
          <View
            style={[styles.preview, { backgroundColor: colors.surfaceMuted }]}
            testID="activity-session-switch-preview"
          >
            <Text style={[styles.label, { color: colors.textMuted }]}>After saving</Text>
            <View style={{ gap: 4 }}>
              <Text
                numberOfLines={1}
                style={[styles.body, { color: colors.text, fontWeight: '600' }]}
              >
                {activityName}
              </Text>
              <Text style={[styles.body, { color: colors.textMuted }]}>
                {`${formatSessionTime(startMs)} – ${formatSessionTime(boundaryMs)}`}
              </Text>
              <Text style={[styles.body, { color: colors.textMuted }]}>
                {formatDuration(Math.max(0, boundaryMs - startMs))}
              </Text>
            </View>
            <View style={{ gap: 4 }}>
              <Text
                numberOfLines={1}
                style={[styles.body, { color: colors.text, fontWeight: '600' }]}
              >
                {intent === 'stop' ? 'Not tracking' : (nextActivity?.name ?? 'Next activity')}
              </Text>
              <Text style={[styles.body, { color: colors.textMuted }]}>
                {intent === 'stop'
                  ? `Since ${formatSessionTime(boundaryMs)}`
                  : `${formatSessionTime(boundaryMs)} – Now`}
              </Text>
              {intent === 'switch' ? (
                <Text style={[styles.body, { color: colors.textMuted }]}>
                  {formatDuration(Math.max(0, nowMs - boundaryMs))}
                </Text>
              ) : null}
            </View>
          </View>
          {!validTime || pickerError ? (
            <Text
              accessibilityRole="alert"
              style={[styles.body, { color: colors.danger.foreground }]}
            >
              {pickerError ?? 'Choose a time after this session started and no later than now.'}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppButton
                disabled={busy || !validTime || (intent === 'switch' && !nextActivity)}
                label={busy ? 'Saving…' : intent === 'switch' ? 'Save switch' : 'Save stop'}
                onPress={() =>
                  void onSave(intent === 'stop' ? null : activityId, timeMs ?? Date.now())
                }
                testID="activity-session-save-switch"
                style={{ width: '100%', height: 48 }}
              />
            </View>
            <AppButton
              disabled={busy}
              label="Cancel"
              onPress={() => setIntent(null)}
              testID="activity-session-cancel-switch"
              variant="outlined"
              style={{ height: 48 }}
            />
          </View>
          <SessionDateTimePicker
            target={pickerOpen ? 'end' : null}
            value={new Date(boundaryMs)}
            minimumDate={new Date(startMs + 1000)}
            maximumDate={new Date(nowMs)}
            title={intent === 'stop' ? 'When did you stop?' : 'When did you switch?'}
            onDismiss={() => setPickerOpen(false)}
            onError={(message) => {
              setPickerError(message);
              setPickerOpen(false);
            }}
            onValueChange={(date) => {
              setTimeMs(date.getTime());
              setPickerOpen(false);
            }}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12, borderTopWidth: 1, paddingTop: 22, width: '100%' },
  heading: { fontSize: 20, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '600' },
  body: { fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: 'row', gap: 8, width: '100%' },
  options: { gap: 6, width: '100%' },
  option: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    minHeight: 52,
    borderRadius: 10,
    padding: 12,
  },
  time: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  preview: { gap: 6, padding: 14, borderRadius: 12 },
});
