import { Column, Picker, Row, Text } from '@expo/ui';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { CatalogCollection, Habit, HabitSchedule, HabitTrigger, UUID } from '@domain';
import { AppIcon } from '@icons';
import { useAppTheme } from '@theme';
import {
  AccessiblePicker,
  AccessibleTextInput,
  AppButton,
  ColorPicker,
  errorText,
  IconPicker,
  Screen,
} from '@ui';

import { HabitErrorMessage } from './HabitErrorMessage';
import { loadHabitStore } from './habit-runtime';
import type { HabitStore } from './habit-store';
import { weekdayLabels } from './habit-format';

const NEW_ID = 'new';

type ScheduleKind = 'daily' | 'weekdays' | 'weekly' | 'weekly-count' | 'interval';
type TriggerKind = 'none' | HabitTrigger['kind'];

interface HabitDraft {
  name: string;
  description: string;
  color: string | null;
  iconName: string | null;
  scheduleKind: ScheduleKind;
  daysOfWeek: number[];
  timesPerWeek: string;
  intervalEveryDays: string;
  intervalStartDate: string;
  triggerKind: TriggerKind;
  triggerId: string;
  thresholdSeconds: string;
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
    description: habit?.description ?? '',
    color: habit?.color ?? null,
    iconName: habit?.iconName ?? null,
    scheduleKind: habit?.schedule.kind ?? 'daily',
    daysOfWeek: habit?.schedule.kind === 'weekly' ? habit.schedule.daysOfWeek : [1, 2, 3, 4, 5],
    timesPerWeek:
      habit?.schedule.kind === 'weekly-count' ? String(habit.schedule.timesPerWeek) : '3',
    intervalEveryDays: habit?.schedule.kind === 'interval' ? String(habit.schedule.everyDays) : '2',
    intervalStartDate: habit?.schedule.kind === 'interval' ? habit.schedule.startDate : '',
    triggerKind: habit?.trigger?.kind ?? 'none',
    triggerId: habit?.trigger
      ? habit.trigger.kind === 'tracked-time'
        ? habit.trigger.activityId
        : habit.trigger.kind === 'folder-time'
          ? habit.trigger.folderId
          : habit.trigger.routineId
      : '',
    thresholdSeconds: thresholdFromTrigger(habit?.trigger ?? null),
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
      ...(threshold === undefined ? {} : { minimumSeconds: threshold }),
    };
  }
  if (draft.triggerKind === 'folder-time') {
    return {
      kind: draft.triggerKind,
      folderId: draft.triggerId as UUID,
      ...(threshold === undefined ? {} : { minimumSeconds: threshold }),
    };
  }
  return {
    kind: draft.triggerKind,
    routineId: draft.triggerId as UUID,
    ...(threshold === undefined ? {} : { minimumSeconds: threshold }),
  };
}

function inputFromDraft(draft: HabitDraft) {
  return {
    name: draft.name,
    description: draft.description.trim() || null,
    color: draft.color,
    iconName: draft.iconName,
    schedule: scheduleFromDraft(draft),
    trigger: triggerFromDraft(draft),
  };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <Column spacing={6} style={{ width: '100%' }}>
      <Text textStyle={{ color: colors.textMuted, fontSize: 14, fontWeight: '600' }}>{label}</Text>
      {children}
    </Column>
  );
}

function Input({
  label,
  value,
  onChangeText,
  placeholder,
  testID,
  multiline = false,
  keyboardType = 'default',
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  testID: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric';
}) {
  const { colors } = useAppTheme();
  return (
    <AccessibleTextInput
      defaultValue={value}
      keyboardType={keyboardType}
      label={label}
      multiline={multiline}
      numberOfLines={multiline ? 3 : undefined}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      returnKeyType={multiline ? 'default' : 'next'}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 10,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 10,
        width: '100%',
      }}
      testID={testID}
      textStyle={{ color: colors.text, fontSize: 16 }}
    />
  );
}

function WeekdayPicker({
  selected,
  onChange,
}: {
  selected: readonly number[];
  onChange: (day: number) => void;
}) {
  const { colors } = useAppTheme();
  const rows = [weekdayLabels.slice(0, 4), weekdayLabels.slice(4)];
  return (
    <Column spacing={8} style={{ width: '100%' }}>
      {rows.map((row, rowIndex) => (
        <Row
          alignment="center"
          key={`weekday-row-${rowIndex}`}
          spacing={8}
          style={{ width: '100%' }}
        >
          {row.map((label, rowDay) => {
            const day = rowIndex === 0 ? rowDay : rowDay + 4;
            const active = selected.includes(day);
            return (
              <AppButton
                key={label}
                label={label}
                onPress={() => onChange(day)}
                style={{
                  backgroundColor: active ? colors.active.background : colors.surface,
                  borderColor: active ? colors.focus : colors.border,
                  borderRadius: 10,
                  borderWidth: active ? 2 : 1,
                  height: 46,
                  paddingHorizontal: 2,
                  width: 58,
                }}
                testID={`habit-weekday-${day}`}
                variant="outlined"
              />
            );
          })}
        </Row>
      ))}
      <Text textStyle={{ color: colors.textMuted, fontSize: 13 }}>
        {selected.length > 0
          ? `Selected: ${selected.map((day) => weekdayLabels[day]).join(', ')}`
          : 'No weekdays selected.'}
      </Text>
    </Column>
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
      ? catalog.activities.filter(
          (activity) => activity.archivedAt === null || activity.id === value
        )
      : kind === 'folder-time'
        ? catalog.folders.filter((folder) => folder.archivedAt === null || folder.id === value)
        : catalog.routines.filter((routine) => routine.archivedAt === null || routine.id === value);
  const label =
    kind === 'tracked-time' ? 'an activity' : kind === 'folder-time' ? 'a folder' : 'a routine';

  return (
    <AccessiblePicker
      label={`Source ${label}`}
      selectedValue={value}
      onValueChange={(next) => onChange(String(next))}
      testID="habit-trigger-target"
    >
      <Picker.Item label={`Choose ${label}`} value="" />
      {candidates.map((candidate) => (
        <Picker.Item
          key={candidate.id}
          label={candidate.archivedAt ? `${candidate.name} (archived)` : candidate.name}
          value={candidate.id}
        />
      ))}
    </AccessiblePicker>
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
      <Screen onBack={() => router.back()} title={id === NEW_ID ? 'New habit' : 'Edit habit'}>
        <HabitErrorMessage
          message={loadError}
          onBack={() => router.back()}
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
      onBack={() => router.back()}
      onCancel={() => router.back()}
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
  const { colors } = useAppTheme();
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

  return (
    <Screen
      onBack={onBack}
      title={habit ? 'Edit habit' : 'New habit'}
      description="Choose a simple schedule and optionally connect evidence from your tracker."
    >
      <Column spacing={18} style={{ width: '100%' }}>
        <Column
          spacing={18}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 18,
            borderWidth: 1,
            padding: 18,
            width: '100%',
          }}
        >
          <Row alignment="center" spacing={12}>
            <AppIcon
              color={draft.color ?? colors.primary}
              name={draft.iconName ?? 'heart'}
              size={30}
            />
            <Column spacing={3} style={{ width: '75%' }}>
              <Text textStyle={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>
                {draft.name || 'Untitled habit'}
              </Text>
              <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
                {habit ? 'Changes are saved on this device.' : 'Daily is the default schedule.'}
              </Text>
            </Column>
          </Row>
          <Field label="Name">
            <Input
              label="Habit name"
              onChangeText={(name) => update({ name })}
              placeholder="Habit name"
              testID="habit-name"
              value={draft.name}
            />
          </Field>
          <Field label="Description (optional)">
            <Input
              label="Habit description"
              multiline
              onChangeText={(description) => update({ description })}
              placeholder="What makes this habit useful?"
              testID="habit-description"
              value={draft.description}
            />
          </Field>
          <Field label="Icon">
            <IconPicker
              onChange={(iconName) => update({ iconName })}
              testID="habit-icon-picker"
              value={draft.iconName}
            />
          </Field>
          <Field label="Color">
            <ColorPicker
              onChange={(color) => update({ color })}
              testID="habit-color-picker"
              value={draft.color}
            />
          </Field>
        </Column>

        <Column
          spacing={16}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 18,
            borderWidth: 1,
            padding: 18,
            width: '100%',
          }}
        >
          <Text textStyle={{ color: colors.text, fontSize: 19, fontWeight: '700' }}>Schedule</Text>
          <Field label="Repeat">
            <AccessiblePicker
              label="Repeat"
              selectedValue={draft.scheduleKind}
              onValueChange={(next) => update({ scheduleKind: String(next) as ScheduleKind })}
              testID="habit-schedule"
            >
              <Picker.Item label="Every day" value="daily" />
              <Picker.Item label="Weekdays" value="weekdays" />
              <Picker.Item label="Selected weekdays" value="weekly" />
              <Picker.Item label="N times per week" value="weekly-count" />
              <Picker.Item label="Every N days" value="interval" />
            </AccessiblePicker>
          </Field>
          {draft.scheduleKind === 'weekly' ? (
            <Field label="Days">
              <WeekdayPicker onChange={toggleWeekday} selected={draft.daysOfWeek} />
            </Field>
          ) : null}
          {draft.scheduleKind === 'weekly-count' ? (
            <Field label="Times per week">
              <AccessiblePicker
                label="Times per week"
                selectedValue={draft.timesPerWeek}
                onValueChange={(next) => update({ timesPerWeek: String(next) })}
                testID="habit-times-per-week"
              >
                {Array.from({ length: 7 }, (_, index) => String(index + 1)).map((value) => (
                  <Picker.Item
                    key={value}
                    label={`${value} ${value === '1' ? 'time' : 'times'}`}
                    value={value}
                  />
                ))}
              </AccessiblePicker>
            </Field>
          ) : null}
          {draft.scheduleKind === 'interval' ? (
            <>
              <Field label="Every number of days">
                <Input
                  label="Interval every number of days"
                  keyboardType="numeric"
                  onChangeText={(intervalEveryDays) => update({ intervalEveryDays })}
                  placeholder="2"
                  testID="habit-interval-days"
                  value={draft.intervalEveryDays}
                />
              </Field>
              <Field label="Start date (YYYY-MM-DD)">
                <Input
                  label="Interval start date"
                  onChangeText={(intervalStartDate) => update({ intervalStartDate })}
                  placeholder="2026-08-30"
                  testID="habit-interval-start"
                  value={draft.intervalStartDate}
                />
              </Field>
            </>
          ) : null}
        </Column>

        <Column
          spacing={16}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 18,
            borderWidth: 1,
            padding: 18,
            width: '100%',
          }}
        >
          <Column spacing={3}>
            <Text textStyle={{ color: colors.text, fontSize: 19, fontWeight: '700' }}>
              Automatic evidence
            </Text>
            <Text textStyle={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
              Optional. This never replaces or clears a manual completion.
            </Text>
          </Column>
          <Field label="Trigger source">
            <AccessiblePicker
              label="Trigger source"
              selectedValue={draft.triggerKind}
              onValueChange={(next) =>
                update({ triggerKind: String(next) as TriggerKind, triggerId: '' })
              }
              testID="habit-trigger-kind"
            >
              <Picker.Item label="No automatic trigger" value="none" />
              <Picker.Item label="Tracked activity time" value="tracked-time" />
              <Picker.Item label="Folder time" value="folder-time" />
              <Picker.Item label="Routine completion time" value="routine-completion" />
            </AccessiblePicker>
          </Field>
          {draft.triggerKind !== 'none' ? (
            <>
              <Field label="Source">
                <TriggerTargetPicker
                  catalog={catalog}
                  kind={draft.triggerKind}
                  onChange={(triggerId) => update({ triggerId })}
                  value={draft.triggerId}
                />
              </Field>
              <Field label="Threshold in seconds (optional)">
                <Input
                  label="Automatic trigger threshold in seconds"
                  keyboardType="numeric"
                  onChangeText={(thresholdSeconds) => update({ thresholdSeconds })}
                  placeholder="1"
                  testID="habit-trigger-threshold"
                  value={draft.thresholdSeconds}
                />
              </Field>
            </>
          ) : null}
        </Column>

        <HabitErrorMessage
          message={formError ?? (persistenceError ? errorText(persistenceError) : null)}
          onBack={onCancel}
          onRetry={() => {
            const action = lastAction.current;
            void (action ? action() : store.getState().refresh()).catch(() => undefined);
          }}
        />
        <AppButton
          disabled={busy}
          label={busy ? 'Saving...' : habit ? 'Save habit' : 'Create habit'}
          onPress={() => void save()}
          style={{ height: 50, width: '100%' }}
          testID="save-habit"
        />
        <AppButton
          disabled={busy}
          label="Cancel"
          onPress={onCancel}
          style={{ height: 46, width: '100%' }}
          testID="cancel-habit"
          variant="outlined"
        />
      </Column>
    </Screen>
  );
}
