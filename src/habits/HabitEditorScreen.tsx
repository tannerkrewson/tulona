import { Picker } from '@expo/ui';
import { Text } from '@ui/primitives';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import type {
  CatalogCollection,
  Habit,
  HabitSchedule,
  HabitTrigger,
  HabitTriggerComparison,
  UUID,
} from '@domain';
import { useAppTheme } from '@theme';
import { goBackInAppStack } from '../navigation/app-back';
import {
  AppButton,
  errorText,
  Form,
  FormColorRow,
  FormContent,
  FormDateRow,
  FormPickerRow,
  FormSection,
  FormTextField,
  HeaderTextButton,
  Screen,
} from '@ui';

import { HabitErrorMessage } from './HabitErrorMessage';
import { loadHabitStore } from './habit-runtime';
import type { HabitStore } from './habit-store';
import { formatThreshold, weekdayLabels } from './habit-format';

const NEW_ID = 'new';

type ScheduleKind = 'daily' | 'weekdays' | 'weekly' | 'weekly-count' | 'interval';
type TriggerKind = 'none' | HabitTrigger['kind'];

interface HabitDraft {
  name: string;
  color: string | null;
  scheduleKind: ScheduleKind;
  daysOfWeek: number[];
  timesPerWeek: string;
  intervalEveryDays: string;
  intervalStartDate: string;
  triggerKind: TriggerKind;
  triggerId: string;
  thresholdSeconds: string;
  thresholdComparison: HabitTriggerComparison;
}

interface HabitEditorResource {
  store: HabitStore;
  habit: Habit | null;
}

function thresholdFromTrigger(trigger: HabitTrigger | null): string {
  if (!trigger) return '';
  if (trigger.minimumSeconds !== undefined) return String(trigger.minimumSeconds);
  if (trigger.minimumMs !== undefined) return String(trigger.minimumMs / 1000);
  return '';
}

function draftFromHabit(habit: Habit | null): HabitDraft {
  return {
    name: habit?.name ?? '',
    color: habit?.color ?? null,
    scheduleKind: habit?.schedule.kind ?? 'daily',
    daysOfWeek: habit?.schedule.kind === 'weekly' ? habit.schedule.daysOfWeek : [1, 2, 3, 4, 5],
    timesPerWeek:
      habit?.schedule.kind === 'weekly-count' ? String(habit.schedule.timesPerWeek) : '3',
    intervalEveryDays: habit?.schedule.kind === 'interval' ? String(habit.schedule.everyDays) : '2',
    intervalStartDate: habit?.schedule.kind === 'interval' ? habit.schedule.startDate : todayKey(),
    triggerKind: habit?.trigger?.kind ?? 'none',
    triggerId: habit?.trigger
      ? habit.trigger.kind === 'tracked-time'
        ? habit.trigger.activityId
        : habit.trigger.kind === 'folder-time'
          ? habit.trigger.folderId
          : habit.trigger.routineId
      : '',
    thresholdSeconds: thresholdFromTrigger(habit?.trigger ?? null),
    thresholdComparison: habit?.trigger?.comparison ?? 'at-least',
  };
}

function scheduleFromDraft(draft: HabitDraft): HabitSchedule {
  switch (draft.scheduleKind) {
    case 'daily':
      return { kind: 'daily' };
    case 'weekdays':
      return { kind: 'weekdays' };
    case 'weekly':
      if (draft.daysOfWeek.length === 0) throw new Error('Select at least one weekday');
      return { kind: 'weekly', daysOfWeek: draft.daysOfWeek.slice().sort((a, b) => a - b) };
    case 'weekly-count': {
      const timesPerWeek = Number(draft.timesPerWeek);
      if (!Number.isInteger(timesPerWeek) || timesPerWeek < 1 || timesPerWeek > 7) {
        throw new Error('Choose between one and seven times per week');
      }
      return { kind: 'weekly-count', timesPerWeek };
    }
    case 'interval': {
      const everyDays = Number(draft.intervalEveryDays);
      if (!Number.isInteger(everyDays) || everyDays < 1) {
        throw new Error('Interval must be at least one day');
      }
      if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(draft.intervalStartDate)) {
        throw new Error('Enter an interval start date as YYYY-MM-DD');
      }
      return { kind: 'interval', everyDays, startDate: draft.intervalStartDate };
    }
  }
}

function triggerFromDraft(draft: HabitDraft): HabitTrigger | null {
  if (draft.triggerKind === 'none') return null;
  if (!draft.triggerId) throw new Error('Choose a trigger source');
  const threshold = draft.thresholdSeconds.trim() ? Number(draft.thresholdSeconds) : undefined;
  if (threshold !== undefined && (!Number.isFinite(threshold) || threshold <= 0)) {
    throw new Error('Threshold must be a positive number of seconds');
  }
  if (draft.triggerKind === 'tracked-time') {
    return {
      kind: draft.triggerKind,
      activityId: draft.triggerId as UUID,
      ...(threshold === undefined
        ? {}
        : { minimumSeconds: threshold, comparison: draft.thresholdComparison }),
    };
  }
  if (draft.triggerKind === 'folder-time') {
    return {
      kind: draft.triggerKind,
      folderId: draft.triggerId as UUID,
      ...(threshold === undefined
        ? {}
        : { minimumSeconds: threshold, comparison: draft.thresholdComparison }),
    };
  }
  return {
    kind: draft.triggerKind,
    routineId: draft.triggerId as UUID,
    ...(threshold === undefined
      ? {}
      : { minimumSeconds: threshold, comparison: draft.thresholdComparison }),
  };
}

function inputFromDraft(draft: HabitDraft) {
  return {
    name: draft.name,
    color: draft.color,
    schedule: scheduleFromDraft(draft),
    trigger: triggerFromDraft(draft),
  };
}

const THRESHOLD_PRESET_SECONDS = [
  60, 300, 600, 900, 1200, 1800, 2700, 3600, 5400, 7200, 10800, 14400,
] as const;

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function WeekdayPicker({
  selected,
  onChange,
}: {
  selected: readonly number[];
  onChange: (day: number) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
      {weekdayLabels.map((label, day) => {
        const active = selected.includes(day);
        return (
          <AppButton
            key={label}
            label={label.slice(0, 1)}
            onPress={() => onChange(day)}
            style={{
              backgroundColor: active ? colors.primary : colors.surface,
              borderColor: active ? colors.primary : colors.border,
              borderRadius: 20,
              borderWidth: 1,
              height: 40,
              paddingHorizontal: 0,
              width: 40,
            }}
            testID={`habit-weekday-${day}`}
            variant={active ? 'filled' : 'outlined'}
          />
        );
      })}
    </View>
  );
}

function TriggerTargetPicker({
  kind,
  value,
  catalog,
  onChange,
}: {
  kind: Exclude<TriggerKind, 'none'>;
  value: string;
  catalog: CatalogCollection;
  onChange: (value: string) => void;
}) {
  const candidates =
    kind === 'tracked-time'
      ? [...catalog.activities, ...catalog.routines].filter(
          (item) => item.archivedAt === null || item.id === value
        )
      : kind === 'folder-time'
        ? catalog.folders.filter((folder) => folder.archivedAt === null || folder.id === value)
        : catalog.routines.filter((routine) => routine.archivedAt === null || routine.id === value);
  const label =
    kind === 'tracked-time' ? 'Activity' : kind === 'folder-time' ? 'Folder' : 'Routine';

  return (
    <FormPickerRow
      label={label}
      selectedValue={value}
      onValueChange={(next) => onChange(String(next))}
      testID="habit-trigger-target"
    >
      <Picker.Item label="Choose" value="" />
      {candidates.map((candidate) => (
        <Picker.Item
          key={candidate.id}
          label={
            `${candidate.name}${'kind' in candidate && candidate.kind === 'routine' ? ' (routine)' : ''}` +
            (candidate.archivedAt ? ' (archived)' : '')
          }
          value={candidate.id}
        />
      ))}
    </FormPickerRow>
  );
}

export interface HabitEditorScreenProps {
  id: string;
}

export function HabitEditorScreen({ id }: HabitEditorScreenProps) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const [resource, setResource] = useState<HabitEditorResource | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void loadHabitStore()
      .then((store) => {
        const habit = id === NEW_ID ? null : store.getState().habits.find((item) => item.id === id);
        if (id !== NEW_ID && !habit) throw new Error('Habit not found');
        if (!cancelled) setResource({ store, habit: habit ?? null });
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(errorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, [id, version]);

  if (!resource) {
    return (
      <Screen
        onBack={() => goBackInAppStack(router, '/(tabs)/habits')}
        title={id === NEW_ID ? 'New habit' : 'Edit habit'}
      >
        <HabitErrorMessage
          message={loadError}
          onBack={() => goBackInAppStack(router, '/(tabs)/habits')}
          onRetry={() => {
            setLoadError(null);
            setVersion((current) => current + 1);
          }}
        />
        <Text
          textStyle={{
            color: loadError ? colors.danger.foreground : colors.textMuted,
            fontSize: 15,
          }}
        >
          {loadError ?? 'Loading habit editor...'}
        </Text>
      </Screen>
    );
  }

  return (
    <HabitEditorForm
      habit={resource.habit}
      store={resource.store}
      onBack={() => goBackInAppStack(router, '/(tabs)/habits')}
      onCancel={() => goBackInAppStack(router, '/(tabs)/habits')}
      onSaved={(habit) => router.replace(`/habit/${habit.id}`)}
    />
  );
}

function HabitEditorForm({
  habit,
  store,
  onBack,
  onCancel,
  onSaved,
}: {
  habit: Habit | null;
  store: HabitStore;
  onBack: () => void;
  onCancel: () => void;
  onSaved: (habit: Habit) => void;
}) {
  const catalog = store((state) => state.catalog) ?? { folders: [], activities: [], routines: [] };
  const persistenceError = store((state) => state.persistenceError);
  const busy = store((state) => state.saving);
  const [draft, setDraft] = useState(() => draftFromHabit(habit));
  const [formError, setFormError] = useState<string | null>(null);
  const lastAction = useRef<(() => Promise<unknown>) | null>(null);
  const update = (changes: Partial<HabitDraft>) =>
    setDraft((current) => ({ ...current, ...changes }));

  const save = async () => {
    lastAction.current = save;
    setFormError(null);
    try {
      const input = inputFromDraft(draft);
      const saved = habit
        ? await store.getState().updateHabit(habit.id, input)
        : await store.getState().createHabit(input);
      onSaved(saved);
    } catch (error) {
      setFormError(errorText(error));
    }
  };

  const toggleWeekday = (day: number) => {
    const days = draft.daysOfWeek.includes(day)
      ? draft.daysOfWeek.filter((candidate) => candidate !== day)
      : [...draft.daysOfWeek, day];
    update({ daysOfWeek: days });
  };

  const thresholdSeconds = draft.thresholdSeconds.trim() ? Number(draft.thresholdSeconds) : null;
  const thresholdOptions =
    thresholdSeconds !== null &&
    Number.isFinite(thresholdSeconds) &&
    !THRESHOLD_PRESET_SECONDS.some((preset) => preset === thresholdSeconds)
      ? [...THRESHOLD_PRESET_SECONDS, thresholdSeconds].sort((left, right) => left - right)
      : THRESHOLD_PRESET_SECONDS;
  const intervalOptions = Array.from(
    new Set([
      ...Array.from({ length: 30 }, (_, index) => String(index + 2)),
      draft.intervalEveryDays,
    ])
  );

  return (
    <Screen
      headerRight={
        <HeaderTextButton
          disabled={busy}
          emphasized
          label={habit ? 'Save' : 'Add'}
          onPress={() => void save()}
          testID="save-habit"
        />
      }
      onBack={onBack}
      title={habit ? 'Edit Habit' : 'New Habit'}
    >
      <Form>
        <HabitErrorMessage
          message={formError ?? (persistenceError ? errorText(persistenceError) : null)}
          onBack={onCancel}
          onRetry={() => {
            const action = lastAction.current;
            void (action ? action() : store.getState().refresh()).catch(() => undefined);
          }}
        />
        <FormSection>
          <FormTextField
            autoFocus={!habit}
            label="Habit name"
            onChangeText={(name) => update({ name })}
            placeholder="Name"
            testID="habit-name"
            value={draft.name}
          />
          <FormColorRow
            onChange={(color) => update({ color })}
            testID="habit-color-picker"
            value={draft.color}
          />
        </FormSection>

        <FormSection title="Schedule">
          <FormPickerRow
            label="Repeat"
            onValueChange={(next) => update({ scheduleKind: String(next) as ScheduleKind })}
            selectedValue={draft.scheduleKind}
            testID="habit-schedule"
          >
            <Picker.Item label="Every day" value="daily" />
            <Picker.Item label="Weekdays" value="weekdays" />
            <Picker.Item label="Certain days" value="weekly" />
            <Picker.Item label="Times per week" value="weekly-count" />
            <Picker.Item label="Every few days" value="interval" />
          </FormPickerRow>
          {draft.scheduleKind === 'weekly' ? (
            <FormContent>
              <WeekdayPicker onChange={toggleWeekday} selected={draft.daysOfWeek} />
            </FormContent>
          ) : null}
          {draft.scheduleKind === 'weekly-count' ? (
            <FormPickerRow
              label="Times"
              onValueChange={(next) => update({ timesPerWeek: String(next) })}
              selectedValue={draft.timesPerWeek}
              testID="habit-times-per-week"
            >
              {Array.from({ length: 7 }, (_, index) => String(index + 1)).map((value) => (
                <Picker.Item
                  key={value}
                  label={`${value} ${value === '1' ? 'time' : 'times'} a week`}
                  value={value}
                />
              ))}
            </FormPickerRow>
          ) : null}
          {draft.scheduleKind === 'interval' ? (
            <FormPickerRow
              label="Every"
              onValueChange={(next) => update({ intervalEveryDays: String(next) })}
              selectedValue={draft.intervalEveryDays}
              testID="habit-interval-days"
            >
              {intervalOptions.map((value) => (
                <Picker.Item key={value} label={`${value} days`} value={value} />
              ))}
            </FormPickerRow>
          ) : null}
          {draft.scheduleKind === 'interval' ? (
            <FormDateRow
              label="Starting"
              onChange={(intervalStartDate) => update({ intervalStartDate })}
              testID="habit-interval-start"
              value={draft.intervalStartDate}
            />
          ) : null}
        </FormSection>

        <FormSection
          footer={
            draft.triggerKind === 'none'
              ? 'Mark this habit done from time you track. You can still log it by hand.'
              : thresholdSeconds === null
                ? 'Counts as soon as any time is logged that day. Logging by hand still works.'
                : draft.thresholdComparison === 'at-most'
                  ? 'Counts when the day ends with no more than this much time logged.'
                  : 'Counts once this much time is logged in a day. Logging by hand still works.'
          }
          title="Complete Automatically"
        >
          <FormPickerRow
            label="From"
            onValueChange={(next) =>
              update({ triggerKind: String(next) as TriggerKind, triggerId: '' })
            }
            selectedValue={draft.triggerKind}
            testID="habit-trigger-kind"
          >
            <Picker.Item label="Off" value="none" />
            <Picker.Item label="Tracked time" value="tracked-time" />
            <Picker.Item label="Folder time" value="folder-time" />
            <Picker.Item label="Finished routine" value="routine-completion" />
          </FormPickerRow>
          {draft.triggerKind !== 'none' ? (
            <TriggerTargetPicker
              catalog={catalog}
              kind={draft.triggerKind}
              onChange={(triggerId) => update({ triggerId })}
              value={draft.triggerId}
            />
          ) : null}
          {draft.triggerKind !== 'none' ? (
            <FormPickerRow
              label="Time"
              onValueChange={(next) => update({ thresholdSeconds: String(next) })}
              selectedValue={draft.thresholdSeconds.trim()}
              testID="habit-trigger-threshold"
            >
              <Picker.Item label="Any" value="" />
              {thresholdOptions.map((seconds) => (
                <Picker.Item
                  key={seconds}
                  label={formatThreshold(seconds)}
                  value={String(seconds)}
                />
              ))}
            </FormPickerRow>
          ) : null}
          {draft.triggerKind !== 'none' && thresholdSeconds !== null ? (
            <FormPickerRow
              label="Counts when"
              onValueChange={(next) =>
                update({ thresholdComparison: String(next) as HabitTriggerComparison })
              }
              selectedValue={draft.thresholdComparison}
              testID="habit-trigger-comparison"
            >
              <Picker.Item label="At least" value="at-least" />
              <Picker.Item label="At most" value="at-most" />
            </FormPickerRow>
          ) : null}
        </FormSection>
      </Form>
    </Screen>
  );
}
