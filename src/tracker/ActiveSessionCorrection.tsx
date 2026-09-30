/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 · Layered native correction sheet. */
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { timestampMs, type CatalogCollection, type TimeTransition } from '@domain';
import { AppIcon } from '@icons';
import { useAppTheme } from '@theme';
import { AppButton, SlideUpSheet } from '@ui';
import { SessionActivityChoices } from './SessionActivityChoices';
import { SessionDateTimePicker } from './SessionDateTimePicker';
import { formatSessionDate, formatSessionTime } from './session-time';

interface Props {
  transition: TimeTransition;
  activityName: string;
  catalog: CatalogCollection;
  nowMs: number;
  busy: boolean;
  error: string | null;
  onSave: (activityId: string | null, timestamp: number) => Promise<boolean>;
}
/** A separate sheet keeps corrections out of the simple timer surface. */
export function ActiveSessionCorrection({
  transition,
  activityName,
  catalog,
  nowMs,
  busy,
  error,
  onSave,
}: Props) {
  const { colors } = useAppTheme();
  const [intent, setIntent] = useState<'switch' | 'stop' | null>(null);
  const [activityId, setActivityId] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [timeMs, setTimeMs] = useState<number | null>(null);
  const [pickerMode, setPickerMode] = useState<'time' | 'datetime' | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const startMs = timestampMs(transition.timestamp);
  const boundaryMs = timeMs ?? nowMs;
  const nextActivity = catalog.activities.find(
    (item) => item.id === activityId && item.archivedAt === null
  );
  const validTime = boundaryMs > startMs && boundaryMs <= nowMs;
  const begin = (next: 'switch' | 'stop') => {
    setIntent(next);
    setTimeMs(null);
    setPickerMode(null);
    setPickerError(null);
    setActivityId(null);
  };
  const close = () => {
    if (!busy) setIntent(null);
  };
  const field = {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 16,
    paddingHorizontal: 16,
    minHeight: 64,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
  };
  return (
    <>
      <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'center' }}>
        <Pressable
          disabled={busy}
          accessibilityRole="button"
          onPress={() => begin('switch')}
          style={{ minHeight: 48, paddingHorizontal: 12, justifyContent: 'center' }}
          testID="activity-session-switch"
        >
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
            Switch activity
          </Text>
        </Pressable>
        <Pressable
          disabled={busy}
          accessibilityRole="button"
          onPress={() => begin('stop')}
          style={{ minHeight: 48, paddingHorizontal: 12, justifyContent: 'center' }}
          testID="activity-session-stop"
        >
          <Text style={{ color: colors.textMuted, fontSize: 15 }}>Stop earlier</Text>
        </Pressable>
      </View>
      <Modal visible={intent !== null} transparent animationType="slide" onRequestClose={close}>
        <SlideUpSheet onClose={close} testID="activity-session-correction-sheet">
          <View style={{ width: '100%', maxWidth: 620, gap: 20, paddingTop: 16 }}>
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: '600' }}>
              {intent === 'stop' ? 'Stop earlier' : 'Switch activity'}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 15, lineHeight: 22 }}>
              When did {activityName} {intent === 'stop' ? 'end' : 'change to another activity'}?
            </Text>
            {intent === 'switch' ? (
              <Pressable
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Choose next activity"
                onPress={() => setChoosing(true)}
                style={field}
                testID="activity-session-next-activity"
              >
                <AppIcon name="activity" size={20} color={colors.textMuted} />
                <Text
                  numberOfLines={1}
                  style={{ flex: 1, color: colors.text, fontSize: 18, fontWeight: '600' }}
                >
                  {nextActivity?.name ?? 'Choose activity'}
                </Text>
                <AppIcon name="chevron-right" size={20} color={colors.textMuted} />
              </Pressable>
            ) : null}
            <View style={field}>
              <Pressable
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Choose switch or stop time"
                onPress={() => setPickerMode('time')}
                style={{ flex: 1, minHeight: 64, justifyContent: 'center' }}
                testID="activity-session-switch-time"
              >
                <Text style={{ color: colors.text, fontSize: 24, fontWeight: '600' }}>
                  {timeMs === null ? 'Now' : formatSessionTime(boundaryMs)}
                </Text>
              </Pressable>
              <Pressable
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Choose switch or stop date and time"
                onPress={() => setPickerMode('datetime')}
                style={{ minHeight: 64, justifyContent: 'center', alignItems: 'center', gap: 4 }}
                testID="activity-session-switch-date"
              >
                <AppIcon name="calendar-days" size={20} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  {formatSessionDate(boundaryMs)}
                </Text>
              </Pressable>
            </View>
            <SessionDateTimePicker
              target={pickerMode ? 'end' : null}
              mode={pickerMode ?? 'time'}
              value={new Date(boundaryMs)}
              minimumDate={new Date(startMs + 1)}
              maximumDate={new Date(nowMs)}
              onDismiss={() => setPickerMode(null)}
              onError={setPickerError}
              onValueChange={(date) => {
                setTimeMs(date.getTime());
                setPickerMode(null);
                setPickerError(null);
              }}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[0, 15, 30].map((minutes) => {
                const next =
                  minutes === 0 ? null : Math.floor((nowMs - minutes * 60_000) / 60_000) * 60_000;
                return (
                  <View key={minutes} style={{ flex: 1, minWidth: 0 }}>
                    <AppButton
                      disabled={busy || (next !== null && next <= startMs)}
                      label={minutes === 0 ? 'Now' : `${minutes}m ago`}
                      variant="outlined"
                      onPress={() => {
                        setTimeMs(next);
                        setPickerMode(null);
                        setPickerError(null);
                      }}
                      style={{ width: '100%', height: 44, paddingHorizontal: 8 }}
                      testID={`activity-session-switch-quick-${minutes}`}
                    />
                  </View>
                );
              })}
            </View>
            <View style={{ gap: 14, paddingVertical: 12 }} testID="activity-session-switch-preview">
              <View style={{ gap: 4 }}>
                <Text
                  numberOfLines={2}
                  style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}
                >
                  {activityName}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>
                  {formatSessionTime(startMs)} → {formatSessionTime(boundaryMs)}
                </Text>
              </View>
              <View style={{ gap: 4 }}>
                <Text
                  numberOfLines={2}
                  style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}
                >
                  {intent === 'stop' ? 'Not tracking' : (nextActivity?.name ?? 'Next activity')}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>
                  {formatSessionTime(boundaryMs)} → {intent === 'stop' ? 'Stopped' : 'Now'}
                </Text>
              </View>
            </View>
            {!validTime || pickerError || error ? (
              <Text
                accessibilityRole="alert"
                style={{ color: colors.danger.foreground, fontSize: 14 }}
              >
                {pickerError ??
                  error ??
                  'Choose a time after this session started and no later than now.'}
              </Text>
            ) : null}
            <AppButton
              disabled={
                busy || pickerMode !== null || !validTime || (intent === 'switch' && !nextActivity)
              }
              label={busy ? 'Saving…' : intent === 'stop' ? 'Save stop' : 'Save switch'}
              onPress={() =>
                void onSave(intent === 'stop' ? null : activityId, timeMs ?? Date.now()).then(
                  (saved) => {
                    if (saved) setIntent(null);
                  }
                )
              }
              style={{ width: '100%', height: 52 }}
              testID="activity-session-save-switch"
            />
            <Pressable
              disabled={busy}
              accessibilityRole="button"
              onPress={close}
              style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
              testID="activity-session-cancel-switch"
            >
              <Text style={{ color: colors.textMuted, fontSize: 15 }}>Cancel</Text>
            </Pressable>
          </View>
          <Modal
            visible={choosing}
            transparent
            animationType="slide"
            onRequestClose={() => setChoosing(false)}
          >
            <SlideUpSheet
              onClose={() => setChoosing(false)}
              testID="activity-session-next-activity-sheet"
            >
              <View style={{ width: '100%', maxWidth: 620, gap: 20, paddingTop: 16 }}>
                <Text style={{ color: colors.text, fontSize: 24, fontWeight: '600' }}>
                  Switch to
                </Text>
                <SessionActivityChoices
                  catalog={catalog}
                  selectedId={activityId}
                  excludeId={transition.activityId}
                  activeOnly
                  activitiesOnly
                  onChoose={(id) => {
                    setActivityId(id);
                    setChoosing(false);
                  }}
                />
              </View>
            </SlideUpSheet>
          </Modal>
        </SlideUpSheet>
      </Modal>
    </>
  );
}
