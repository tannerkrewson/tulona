import { Column, Picker, Row, Text } from '@expo/ui';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import {
  formatDuration,
  timestampMs,
  toTimestamp,
  type TimeTransition,
  type TrackableItem,
} from '@domain';
import { useAppTheme } from '@theme';
import { AccessiblePicker, AccessibleTextInput, AppButton, errorText, Screen } from '@ui';

import { resolveCatalogItem } from '../catalog/catalog-service';
import { RecoveryActions } from '../orchestration/RecoveryActions';
import { loadRoutineRuntime, type RoutineRuntime } from '../routine/routine-runtime';

function localInputValue(timestamp: string): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseLocalInput(value: string): number | null {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function readableDateTime(value: number | null): string {
  return value === null
    ? 'Now'
    : new Date(value).toLocaleString([], {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
}

function SessionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Column
      spacing={8}
      style={{
        backgroundColor: colors.danger.background,
        borderColor: colors.danger.foreground,
        borderRadius: 14,
        borderWidth: 1,
        padding: 14,
        width: '100%',
      }}
      testID="activity-session-error"
    >
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 15, fontWeight: '700' }}>
        Session unavailable
      </Text>
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{message}</Text>
      <RecoveryActions onRetry={onRetry} testID="activity-session-recovery" />
    </Column>
  );
}

export interface ActivitySessionScreenProps {
  transitionId: string;
}

export function ActivitySessionScreen({ transitionId }: ActivitySessionScreenProps) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const [runtime, setRuntime] = useState<RoutineRuntime | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void loadRoutineRuntime()
      .then(async (nextRuntime) => {
        await nextRuntime.trackerStore.getState().hydrate();
        if (!cancelled) setRuntime(nextRuntime);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(errorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  if (!runtime) {
    return (
      <Screen onBack={() => router.back()} title="Activity session">
        {loadError ? (
          <SessionError
            message={loadError}
            onRetry={() => {
              setLoadError(null);
              setRuntime(null);
              setReloadToken((value) => value + 1);
            }}
          />
        ) : (
          <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>Loading session...</Text>
        )}
      </Screen>
    );
  }

  return <ActivitySessionContent runtime={runtime} transitionId={transitionId} />;
}

function ActivitySessionContent({
  runtime,
  transitionId,
}: {
  runtime: RoutineRuntime;
  transitionId: string;
}) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const store = runtime.trackerStore;
  const catalog = store((state) => state.catalog);
  const transitions = store((state) => state.transitions);
  const activeTransition = store((state) => state.activeTransition);
  const persistenceError = store((state) => state.persistenceError);
  const transition: TimeTransition | null =
    transitions.find((candidate) => candidate.id === transitionId) ??
    (activeTransition?.id === transitionId ? activeTransition : null);
  const isActive = transition?.id === activeTransition?.id && transition?.activityId !== null;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [editingTime, setEditingTime] = useState(false);
  const [startValue, setStartValue] = useState(() =>
    transition ? localInputValue(transition.timestamp) : ''
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!isActive) return undefined;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isActive]);

  if (!catalog || !transition) {
    return (
      <Screen onBack={() => router.back()} title="Activity session">
        <SessionError
          message={
            persistenceError
              ? errorText(persistenceError)
              : 'This activity session is no longer available.'
          }
          onRetry={() => void store.getState().hydrate()}
        />
      </Screen>
    );
  }

  const resolved = resolveCatalogItem(catalog, transition.activityId ?? '');
  const items = [...catalog.activities, ...catalog.routines].sort((left, right) =>
    left.name.localeCompare(right.name)
  );
  const following = transitions
    .filter(
      (candidate) =>
        candidate.status === 'recorded' &&
        timestampMs(candidate.timestamp) > timestampMs(transition.timestamp)
    )
    .sort((left, right) => timestampMs(left.timestamp) - timestampMs(right.timestamp))[0];
  const endMs = following ? timestampMs(following.timestamp) : isActive ? nowMs : null;
  const durationMs = endMs === null ? 0 : Math.max(0, endMs - timestampMs(transition.timestamp));

  const runAction = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const saveTime = () =>
    void runAction(async () => {
      const nextMs = parseLocalInput(startValue);
      if (nextMs === null) throw new Error('Enter a valid start date and time.');
      await store.getState().editTransition(transition.id, { timestamp: toTimestamp(nextMs) });
      setStartValue(localInputValue(toTimestamp(nextMs)));
      setEditingTime(false);
    });

  const changeActivity = (value: string) =>
    void runAction(async () => {
      await store.getState().reassignTransition(transition.id, value || null);
    });

  return (
    <Screen onBack={() => router.back()} title={resolved?.item.name ?? 'Activity session'}>
      <Column spacing={16} style={{ width: '100%' }} testID="activity-session-screen">
        <Column
          spacing={10}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 16,
            borderWidth: 1,
            padding: 16,
            width: '100%',
          }}
          testID="activity-session-summary"
        >
          <Text textStyle={{ color: colors.textMuted, fontSize: 13, fontWeight: '700' }}>
            {isActive ? 'ACTIVE SESSION' : 'SESSION'}
          </Text>
          <Text textStyle={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>
            {resolved?.item.name ?? 'No activity'}
          </Text>
          <Row alignment="center" spacing={8} style={{ width: '100%' }}>
            <Column style={{ width: '48%' }}>
              <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>Started</Text>
              <Text textStyle={{ color: colors.text, fontSize: 15 }}>
                {readableDateTime(timestampMs(transition.timestamp))}
              </Text>
            </Column>
            <Column style={{ width: '48%' }}>
              <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>Ended</Text>
              <Text textStyle={{ color: colors.text, fontSize: 15 }}>
                {readableDateTime(endMs)}
              </Text>
            </Column>
          </Row>
          <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
            {endMs === null
              ? 'End time is recorded when another activity starts.'
              : formatDuration(durationMs)}
          </Text>
        </Column>

        <Column spacing={8} style={{ width: '100%' }}>
          <Text textStyle={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>Activity</Text>
          <AccessiblePicker
            enabled={!busy}
            label="Activity for this session"
            onValueChange={changeActivity}
            selectedValue={transition.activityId ?? ''}
            testID="activity-session-activity"
          >
            <Picker.Item label="No activity" value="" />
            {items.map((item: TrackableItem) => (
              <Picker.Item key={item.id} label={item.name} value={item.id} />
            ))}
          </AccessiblePicker>
        </Column>

        <Column spacing={8} style={{ width: '100%' }}>
          <Text textStyle={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>
            Start time
          </Text>
          {editingTime ? (
            <Column spacing={8} style={{ width: '100%' }}>
              <AccessibleTextInput
                label="Session start time"
                onChangeText={setStartValue}
                testID="activity-session-start-input"
                defaultValue={startValue}
              />
              <Row alignment="center" spacing={8} style={{ width: '100%' }}>
                <AppButton
                  disabled={busy}
                  label="Save time"
                  onPress={saveTime}
                  style={{ height: 46, width: '48%' }}
                  testID="activity-session-save-time"
                />
                <AppButton
                  disabled={busy}
                  label="Cancel"
                  onPress={() => setEditingTime(false)}
                  style={{ height: 46, width: '48%' }}
                  testID="activity-session-cancel-time"
                  variant="outlined"
                />
              </Row>
            </Column>
          ) : (
            <AppButton
              disabled={busy}
              label="Adjust start time"
              onPress={() => setEditingTime(true)}
              style={{ height: 48 }}
              testID="activity-session-adjust-time"
              variant="outlined"
            />
          )}
        </Column>

        {actionError ? (
          <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{actionError}</Text>
        ) : null}
      </Column>
    </Screen>
  );
}
