import { Button, Column, Picker, Row, Text, TextInput } from '@expo/ui';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  dateForLogicalDay,
  formatDuration,
  logicalDayBounds,
  logicalDayKey,
  shiftLogicalDay,
  toTimestamp,
  type CatalogCollection,
  type TimeInterval,
  type TimeTransition,
  type TrackableItem,
} from '@domain';
import { useAppTheme } from '@theme';
import { AppIcon } from '@icons';
import { Screen } from '@ui';

import { resolveCatalogItem } from '../catalog/catalog-service';
import { loadRoutineRuntime, type RoutineRuntime } from '../routine/routine-runtime';
import { createTrackerStore } from './tracker-store';
import { orderTransitions } from './tracker-engine';

const NONE = '__none__';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function dayDate(day: string, rolloverHour: number): Date {
  return dateForLogicalDay(day as import('@domain').LogicalDayKey, rolloverHour);
}

function validDay(value: string | string[] | undefined): import('@domain').LogicalDayKey | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate)
    ? (candidate as import('@domain').LogicalDayKey)
    : null;
}

function shiftDay(
  day: import('@domain').LogicalDayKey,
  amount: number,
  rolloverHour: number
): import('@domain').LogicalDayKey {
  return shiftLogicalDay(day, amount, { rolloverHour });
}

function localInputValue(timestamp: string): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseLocalInput(value: string): number | null {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDate(day: string, rolloverHour: number): string {
  return dayDate(day, rolloverHour).toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function catalogName(catalog: CatalogCollection, transition: TimeTransition | null): string {
  if (!transition || transition.activityId === null) return 'No activity';
  return resolveCatalogItem(catalog, transition.activityId)?.item.name ?? 'Unavailable activity';
}

function colorForTransition(catalog: CatalogCollection, transition: TimeTransition | null): string {
  if (!transition || transition.activityId === null) return '#64748B';
  return resolveCatalogItem(catalog, transition.activityId)?.displayColor ?? '#176B87';
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
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
      testID="history-error"
    >
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 15, fontWeight: '700' }}>
        History action failed
      </Text>
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{message}</Text>
      <Button label="Retry" onPress={onRetry} testID="retry-history" />
    </Column>
  );
}

export default function HistoryScreen() {
  const { colors } = useAppTheme();
  const params = useLocalSearchParams<{ day?: string }>();
  const [runtime, setRuntime] = useState<RoutineRuntime | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(() => validDay(params.day));
  const [fallbackTimestamp] = useState(() => Date.now());

  const load = useCallback(() => {
    setLoadError(null);
    void loadRoutineRuntime()
      .then(setRuntime)
      .catch((error: unknown) => setLoadError(errorText(error)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadRoutineRuntime()
      .then((nextRuntime) => {
        if (!cancelled) setRuntime(nextRuntime);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(errorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!runtime) {
    return (
      <Screen title="History" description="Derived time for one logical day">
        {loadError ? (
          <ErrorPanel message={loadError} onRetry={load} />
        ) : (
          <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>Loading history...</Text>
        )}
      </Screen>
    );
  }

  const day =
    selectedDay ??
    logicalDayKey(fallbackTimestamp, { rolloverHour: runtime.settings.logicalDayRolloverHour });
  return (
    <HistoryDay
      key={day}
      day={day}
      onChangeDay={setSelectedDay}
      rolloverHour={runtime.settings.logicalDayRolloverHour}
      runtime={runtime}
    />
  );
}

function HistoryDay({
  runtime,
  day,
  onChangeDay,
  rolloverHour,
}: {
  runtime: RoutineRuntime;
  day: string;
  onChangeDay: (day: import('@domain').LogicalDayKey) => void;
  rolloverHour: number;
}) {
  const { colors } = useAppTheme();
  const bounds = logicalDayBounds(day, { rolloverHour });
  const [store] = useState(() =>
    createTrackerStore(runtime.trackerService, {
      initialRange: { startMs: bounds.startMs, endMs: bounds.endMs },
      catalogService: runtime.catalogService,
    })
  );
  const catalog = store((state) => state.catalog);
  const intervals = store((state) => state.intervals);
  const transitions = store((state) => state.transitions);
  const nowMs = store((state) => state.nowMs);
  const persistenceError = store((state) => state.persistenceError);
  const loading = store((state) => state.loading);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ kind: 'delete' | 'merge'; id: string } | null>(null);
  const [insertOpen, setInsertOpen] = useState(false);
  const [insertValue, setInsertValue] = useState(() =>
    localInputValue(new Date(Math.min(Date.now(), bounds.endMs - 60_000)).toISOString())
  );
  const [insertActivityId, setInsertActivityId] = useState('');
  const [boundaryValue, setBoundaryValue] = useState('');
  const lastAction = useRef<(() => Promise<void>) | null>(null);

  useFocusEffect(
    useCallback(() => {
      void store
        .getState()
        .hydrate()
        .catch(() => undefined);
      return undefined;
    }, [store])
  );

  if (!catalog) {
    const message = persistenceError?.message;
    return (
      <Screen title="History" description="Derived time for one logical day">
        {message ? (
          <ErrorPanel message={message} onRetry={() => void store.getState().hydrate()} />
        ) : (
          <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>
            {loading ? 'Loading history...' : 'No history loaded yet.'}
          </Text>
        )}
      </Screen>
    );
  }

  const orderedTransitions = orderTransitions(
    transitions.filter((transition) => transition.status === 'recorded')
  );
  const totalMs = intervals.reduce(
    (total, interval) =>
      total + (interval.activityId === null ? 0 : interval.endMs - interval.startMs),
    0
  );
  const futureDay = bounds.startMs > nowMs;
  const visibleError = actionError ?? persistenceError?.message;

  const runAction = async (action: () => Promise<void>) => {
    lastAction.current = action;
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

  const beginEdit = (transition: TimeTransition) => {
    setEditingId(transition.id);
    setBoundaryValue(localInputValue(transition.timestamp));
    setActionError(null);
  };

  const saveBoundary = (transition: TimeTransition) => {
    void runAction(async () => {
      const nextMs = parseLocalInput(boundaryValue);
      if (nextMs === null) throw new Error('Enter a valid date and time.');
      await store.getState().editTransition(transition.id, { timestamp: toTimestamp(nextMs) });
      setEditingId(null);
    });
  };

  const reassign = async (transition: TimeTransition, value: string): Promise<boolean> => {
    let persisted = false;
    await runAction(async () => {
      await store.getState().reassignTransition(transition.id, value === NONE ? null : value);
      persisted = true;
    });
    return persisted;
  };

  const confirmPending = () => {
    if (!pending) return;
    const action =
      pending.kind === 'delete'
        ? () => store.getState().deleteTransition(pending.id, { confirm: true })
        : () => store.getState().mergeTransition(pending.id, { confirm: true });
    void runAction(async () => {
      await action();
      setPending(null);
    });
  };

  const insertMissed = () => {
    void runAction(async () => {
      const timestamp = parseLocalInput(insertValue);
      if (timestamp === null) throw new Error('Enter a valid date and time.');
      if (!insertActivityId) throw new Error('Choose the activity that was missed.');
      await store.getState().insertMissedSwitch({
        activityId: insertActivityId,
        timestamp: toTimestamp(timestamp),
        note: 'Inserted from daily history',
      });
      setInsertOpen(false);
    });
  };

  return (
    <Screen
      title="History"
      description="Derived intervals for a logical day; corrections update the journal."
    >
      <Column spacing={16} style={{ width: '100%' }}>
        <Row alignment="center" spacing={8}>
          <Button
            disabled={busy}
            label="Previous day"
            onPress={() => onChangeDay(shiftDay(day, -1, rolloverHour))}
            testID="history-previous-day"
            variant="outlined"
          />
          <Column alignment="center" spacing={2} style={{ width: '100%' }}>
            <Text textStyle={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>
              {formatDate(day, rolloverHour)}
            </Text>
            <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>{day}</Text>
          </Column>
          <Button
            disabled={busy || futureDay}
            label="Next day"
            onPress={() => onChangeDay(shiftDay(day, 1, rolloverHour))}
            testID="history-next-day"
            variant="outlined"
          />
        </Row>
        <Row alignment="center" spacing={10}>
          <Column
            spacing={2}
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: 14,
              borderWidth: 1,
              padding: 14,
              width: 180,
            }}
          >
            <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>Tracked total</Text>
            <Text textStyle={{ color: colors.text, fontSize: 23, fontWeight: '800' }}>
              {formatDuration(totalMs)}
            </Text>
          </Column>
          <Button
            disabled={busy || futureDay}
            label={insertOpen ? 'Close missed switch' : 'Insert missed switch'}
            onPress={() => setInsertOpen((open) => !open)}
            testID="toggle-missed-switch"
            variant="outlined"
          />
        </Row>
        {insertOpen ? (
          <InsertSwitchPanel
            activities={[...catalog.activities, ...catalog.routines]}
            activityId={insertActivityId}
            busy={busy}
            onActivityChange={setInsertActivityId}
            onCancel={() => setInsertOpen(false)}
            onInsert={insertMissed}
            onTimeChange={setInsertValue}
            timeValue={insertValue}
          />
        ) : null}
        {visibleError ? (
          <ErrorPanel
            message={visibleError}
            onRetry={() =>
              void (lastAction.current ? runAction(lastAction.current) : store.getState().hydrate())
            }
          />
        ) : null}
        <Column spacing={12} style={{ width: '100%' }} testID="history-timeline">
          {intervals.map((interval) => {
            const transition = transitions.find(
              (candidate: TimeTransition) => candidate.id === interval.transitionId
            );
            if (!transition) return null;
            const index = orderedTransitions.findIndex(
              (candidate: TimeTransition) => candidate.id === transition.id
            );
            const canMerge = index > 0;
            const color = colorForTransition(catalog, transition);
            const name = catalogName(catalog, transition);
            return (
              <HistoryInterval
                key={`${interval.transitionId}-${interval.startMs}`}
                activities={[...catalog.activities, ...catalog.routines]}
                boundaryValue={boundaryValue}
                busy={busy}
                canMerge={canMerge}
                editing={editingId === transition.id}
                interval={interval}
                name={name}
                onBeginEdit={() => beginEdit(transition)}
                onBoundaryChange={setBoundaryValue}
                onCancelEdit={() => setEditingId(null)}
                onDelete={() => setPending({ kind: 'delete', id: transition.id })}
                onMerge={() => setPending({ kind: 'merge', id: transition.id })}
                onReassign={(value) => reassign(transition, value)}
                onSave={() => saveBoundary(transition)}
                transition={transition}
                color={color}
              />
            );
          })}
          {intervals.length === 0 ? (
            <Column
              alignment="center"
              spacing={8}
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: 16,
                borderWidth: 1,
                padding: 22,
                width: '100%',
              }}
            >
              <AppIcon color={colors.textMuted} name="clock" size={28} />
              <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>
                No recorded activity intervals for this logical day.
              </Text>
            </Column>
          ) : null}
        </Column>
        {pending ? (
          <Column
            spacing={8}
            style={{
              backgroundColor: colors.warning.background,
              borderColor: colors.warning.foreground,
              borderRadius: 14,
              borderWidth: 1,
              padding: 14,
              width: '100%',
            }}
            testID="history-confirmation"
          >
            <Text textStyle={{ color: colors.warning.foreground, fontSize: 15, fontWeight: '700' }}>
              {pending.kind === 'delete' ? 'Delete this boundary?' : 'Merge this boundary?'}
            </Text>
            <Text textStyle={{ color: colors.warning.foreground, fontSize: 14, lineHeight: 20 }}>
              {pending.kind === 'delete'
                ? 'The preceding state will continue across this transition. This cannot be undone from History.'
                : 'The selected boundary will be removed so the preceding activity continues. Confirm to journal this change.'}
            </Text>
            <Row alignment="center" spacing={8}>
              <Button
                disabled={busy}
                label={pending.kind === 'delete' ? 'Confirm delete' : 'Confirm merge'}
                onPress={confirmPending}
                testID={`confirm-${pending.kind}`}
              />
              <Button
                disabled={busy}
                label="Cancel"
                onPress={() => setPending(null)}
                variant="text"
              />
            </Row>
          </Column>
        ) : null}
      </Column>
    </Screen>
  );
}

function InsertSwitchPanel({
  activities,
  activityId,
  busy,
  onActivityChange,
  onCancel,
  onInsert,
  onTimeChange,
  timeValue,
}: {
  activities: TrackableItem[];
  activityId: string;
  busy: boolean;
  onActivityChange: (value: string) => void;
  onCancel: () => void;
  onInsert: () => void;
  onTimeChange: (value: string) => void;
  timeValue: string;
}) {
  const { colors } = useAppTheme();
  return (
    <Column
      spacing={10}
      style={{
        backgroundColor: colors.surfaceMuted,
        borderColor: colors.border,
        borderRadius: 16,
        borderWidth: 1,
        padding: 14,
        width: '100%',
      }}
      testID="missed-switch-panel"
    >
      <Text textStyle={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>
        Insert a missed switch
      </Text>
      <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
        This adds one journaled transition at the selected past time.
      </Text>
      <TextInput
        onChangeText={onTimeChange}
        testID="missed-switch-time"
        defaultValue={timeValue}
        style={{
          borderColor: colors.border,
          borderRadius: 10,
          borderWidth: 1,
          paddingHorizontal: 12,
          paddingVertical: 10,
          width: '100%',
        }}
        textStyle={{ color: colors.text, fontSize: 16 }}
      />
      <Picker
        onValueChange={(next) => onActivityChange(String(next))}
        selectedValue={activityId}
        testID="missed-switch-activity"
      >
        <Picker.Item label="Choose activity" value="" />
        {activities.map((item) => (
          <Picker.Item
            key={item.id}
            label={`${item.name}${item.archivedAt ? ' (archived)' : ''}`}
            value={item.id}
          />
        ))}
      </Picker>
      <Row alignment="center" spacing={8}>
        <Button
          disabled={busy || activities.length === 0}
          label="Insert switch"
          onPress={onInsert}
        />
        <Button disabled={busy} label="Cancel" onPress={onCancel} variant="text" />
      </Row>
    </Column>
  );
}

function HistoryInterval({
  activities,
  boundaryValue,
  busy,
  canMerge,
  color,
  editing,
  interval,
  name,
  onBeginEdit,
  onBoundaryChange,
  onCancelEdit,
  onDelete,
  onMerge,
  onReassign,
  onSave,
  transition,
}: {
  activities: TrackableItem[];
  boundaryValue: string;
  busy: boolean;
  canMerge: boolean;
  color: string;
  editing: boolean;
  interval: TimeInterval;
  name: string;
  onBeginEdit: () => void;
  onBoundaryChange: (value: string) => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onMerge: () => void;
  onReassign: (value: string) => Promise<boolean>;
  onSave: () => void;
  transition: TimeTransition;
}) {
  const { colors } = useAppTheme();
  const [reassignValue, setReassignValue] = useState(transition.activityId ?? NONE);
  const duration = Math.max(0, interval.endMs - interval.startMs);
  return (
    <Column
      spacing={10}
      style={{
        backgroundColor: colors.surface,
        borderColor: color,
        borderRadius: 16,
        borderWidth: 2,
        padding: 14,
        width: '100%',
      }}
      testID={`history-interval-${transition.id}`}
    >
      <Row alignment="center" spacing={10}>
        <Column style={{ backgroundColor: color, borderRadius: 6, height: 38, width: 12 }} />
        <Column spacing={3} style={{ width: '100%' }}>
          <Text textStyle={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>{name}</Text>
          <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>
            {`${formatTime(interval.startMs)} - ${formatTime(interval.endMs)} | ${formatDuration(duration)}`}
          </Text>
        </Column>
        <AppIcon
          accessibilityLabel={
            transition.activityId === null ? 'Stopped interval' : 'Recorded interval'
          }
          color={transition.activityId === null ? colors.textMuted : color}
          name={transition.activityId === null ? 'pause' : 'check-circle-2'}
          size={20}
        />
      </Row>
      <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>
        {`Boundary recorded at ${new Date(transition.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`}
      </Text>
      {editing ? (
        <Column spacing={8} style={{ width: '100%' }} testID={`edit-boundary-${transition.id}`}>
          <Text textStyle={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>
            Edit one boundary
          </Text>
          <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>
            The preceding interval ends at this same time; the selected interval starts here.
          </Text>
          <TextInput
            onChangeText={onBoundaryChange}
            testID={`boundary-time-${transition.id}`}
            defaultValue={boundaryValue}
            style={{
              borderColor: colors.border,
              borderRadius: 10,
              borderWidth: 1,
              paddingHorizontal: 12,
              paddingVertical: 10,
              width: '100%',
            }}
            textStyle={{ color: colors.text, fontSize: 16 }}
          />
          <Row alignment="center" spacing={8}>
            <Button
              disabled={busy}
              label="Save boundary"
              onPress={onSave}
              testID={`save-boundary-${transition.id}`}
            />
            <Button disabled={busy} label="Cancel" onPress={onCancelEdit} variant="text" />
          </Row>
        </Column>
      ) : null}
      <Column spacing={6} style={{ width: '100%' }}>
        <Text textStyle={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>
          Reassign this transition
        </Text>
        <Picker
          onValueChange={(next) => {
            const value = String(next);
            if (value !== (transition.activityId ?? NONE)) {
              const previous = reassignValue;
              void onReassign(value).then((persisted) => {
                setReassignValue(persisted ? value : previous);
              });
            }
          }}
          selectedValue={reassignValue}
          testID={`reassign-${transition.id}`}
        >
          <Picker.Item label="No activity (stop)" value={NONE} />
          {activities.map((item) => (
            <Picker.Item
              key={item.id}
              label={`${item.name}${item.kind === 'routine' ? ' (routine)' : ''}${item.archivedAt ? ' (archived)' : ''}`}
              value={item.id}
            />
          ))}
        </Picker>
      </Column>
      <Row alignment="center" spacing={8}>
        <Button
          disabled={busy || editing}
          label="Edit boundary"
          onPress={onBeginEdit}
          testID={`open-boundary-${transition.id}`}
          variant="outlined"
        />
        <Button
          disabled={busy || editing}
          label="Delete"
          onPress={onDelete}
          testID={`delete-boundary-${transition.id}`}
          variant="text"
        />
        <Button
          disabled={busy || editing || !canMerge}
          label="Merge"
          onPress={onMerge}
          testID={`merge-boundary-${transition.id}`}
          variant="text"
        />
      </Row>
    </Column>
  );
}
