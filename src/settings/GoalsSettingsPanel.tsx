import { Picker } from '@expo/ui';
import { Column, Text } from '@ui/primitives';
import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import {
  MAX_GOAL_HISTORICAL_CIRCLE_COUNT,
  MIN_GOAL_HISTORICAL_CIRCLE_COUNT,
  type GoalSettings,
  type GoalStatusColor,
} from '@domain';
import { useAppTheme } from '@theme';
import {
  AppButton,
  ColorDot,
  ConfirmationModal,
  errorText,
  Form,
  FormPickerRow,
  FormRow,
  FormSection,
  FormSheet,
  FormTextField,
  HeaderTextButton,
  IconButton,
} from '@ui';

import { loadGoalsRuntime } from '../goals/goal-runtime';
import type {
  CreateGoalStatusDefinitionInput,
  GoalService,
  UpdateGoalStatusDefinitionInput,
} from '../goals/goal-service';

const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const STATUS_COLOR_OPTIONS: readonly {
  value: GoalStatusColor;
  label: string;
  swatch: string;
}[] = [
  { value: 'green', label: 'Green', swatch: '#22C55E' },
  { value: 'yellow', label: 'Yellow', swatch: '#EAB308' },
  { value: 'red', label: 'Red', swatch: '#EF4444' },
  { value: 'light-grey', label: 'Light grey', swatch: '#D1D5DB' },
];

function statusColorOption(color: GoalStatusColor) {
  return STATUS_COLOR_OPTIONS.find((option) => option.value === color) ?? STATUS_COLOR_OPTIONS[0];
}

type StatusDraft = { id: string | null; name: string; color: GoalStatusColor };

function StatusSheet({
  draft,
  busy,
  onChange,
  onCancel,
  onSave,
  onDelete,
}: {
  draft: StatusDraft | null;
  busy: boolean;
  onChange: (draft: StatusDraft) => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete: () => Promise<boolean>;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const current = draft ?? { id: null, name: '', color: 'green' as const };
  const testSuffix = current.id ?? 'new';
  return (
    <FormSheet
      confirmDisabled={busy || current.name.trim().length === 0}
      confirmLabel={current.id ? 'Save' : 'Add'}
      onClose={onCancel}
      onConfirm={onSave}
      testID={current.id ? `goal-status-${current.id}` : 'goal-status-create'}
      title={current.id ? 'Edit Status' : 'New Status'}
      visible={draft !== null}
    >
      <FormSection>
        <FormTextField
          autoFocus={!current.id}
          label="Status name"
          onChangeText={(name) => onChange({ ...current, name })}
          placeholder="Name"
          testID={current.id ? `goal-status-name-${current.id}` : 'goal-status-new-name'}
          value={current.name}
        />
        <FormPickerRow
          enabled={!busy}
          label="Color"
          onValueChange={(next) => onChange({ ...current, color: next as GoalStatusColor })}
          selectedValue={current.color}
          testID={current.id ? `goal-status-color-${current.id}` : 'goal-status-new-color'}
        >
          {STATUS_COLOR_OPTIONS.map((color) => (
            <Picker.Item key={color.value} label={color.label} value={color.value} />
          ))}
        </FormPickerRow>
      </FormSection>
      {current.id ? (
        <FormSection footer="A status can only be deleted when no weekly review or check uses it.">
          <FormRow
            disabled={busy}
            icon="trash-2"
            kind="destructive"
            label="Delete Status"
            onPress={() => setConfirmingDelete(true)}
            testID={`goal-status-delete-${testSuffix}`}
          />
        </FormSection>
      ) : null}
      <ConfirmationModal
        busy={busy}
        cancelLabel="Cancel"
        cancelTestID={`goal-status-cancel-delete-${testSuffix}`}
        confirmLabel="Delete"
        confirmTestID={`goal-status-confirm-delete-${testSuffix}`}
        message="Goals that used this status will need a new one."
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => {
          void onDelete().then((deleted) => {
            if (deleted) setConfirmingDelete(false);
          });
        }}
        testID={`goal-status-delete-confirmation-${testSuffix}`}
        title={`Delete ${current.name || 'this status'}?`}
        visible={confirmingDelete}
      />
    </FormSheet>
  );
}

function GoalsSettingsContent({
  settings,
  busy,
  onMutation,
}: {
  settings: GoalSettings;
  busy: boolean;
  onMutation: (mutation: (service: GoalService) => Promise<unknown>) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<StatusDraft | null>(null);
  const [reordering, setReordering] = useState(false);
  const definitions = settings.statusDefinitions;

  const saveDraft = () => {
    if (!draft) return;
    const action = draft.id
      ? (nextService: GoalService) =>
          nextService.updateStatusDefinition(draft.id as string, {
            name: draft.name,
            color: draft.color,
          } satisfies UpdateGoalStatusDefinitionInput)
      : (nextService: GoalService) =>
          nextService.createStatusDefinition({
            name: draft.name,
            color: draft.color,
          } satisfies CreateGoalStatusDefinitionInput);
    void onMutation(action).then((saved) => {
      if (saved) setDraft(null);
    });
  };

  const reorder = async (index: number, direction: -1 | 1): Promise<boolean> => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= definitions.length) return false;
    const ids = definitions.map((definition) => definition.id);
    [ids[index], ids[nextIndex]] = [ids[nextIndex] as string, ids[index] as string];
    return onMutation((nextService) => nextService.reorderStatusDefinitions(ids));
  };

  return (
    <Form testID="settings-goals">
      <FormSection footer="Applies to every goal.">
        <FormPickerRow
          enabled={!busy}
          label="Review day"
          onValueChange={(next) =>
            void onMutation((nextService) =>
              nextService.updateSettings({ reviewDay: Number(next) })
            )
          }
          selectedValue={String(settings.reviewDay)}
          testID="settings-goal-review-day"
        >
          {WEEKDAY_LABELS.map((label, day) => (
            <Picker.Item key={label} label={label} value={String(day)} />
          ))}
        </FormPickerRow>
        <FormPickerRow
          enabled={!busy}
          label="Weeks shown"
          onValueChange={(next) =>
            void onMutation((nextService) =>
              nextService.updateSettings({ historicalCircleCount: Number(next) })
            )
          }
          selectedValue={String(settings.historicalCircleCount)}
          testID="settings-goal-history-circle-count"
        >
          {Array.from(
            {
              length: MAX_GOAL_HISTORICAL_CIRCLE_COUNT - MIN_GOAL_HISTORICAL_CIRCLE_COUNT + 1,
            },
            (_, index) => {
              const count = MIN_GOAL_HISTORICAL_CIRCLE_COUNT + index;
              return <Picker.Item key={count} label={`${count}`} value={String(count)} />;
            }
          )}
        </FormPickerRow>
      </FormSection>
      <FormSection
        footer="The results you can give a goal each week."
        headerAction={
          definitions.length > 1 ? (
            <HeaderTextButton
              compact
              label={reordering ? 'Done' : 'Reorder'}
              onPress={() => setReordering((current) => !current)}
              testID="goal-status-reorder"
            />
          ) : undefined
        }
        testID="goal-status-definitions"
        title="Statuses"
      >
        {definitions.map((definition, index) => (
          <FormRow
            key={definition.id}
            label={definition.name}
            leading={<ColorDot color={statusColorOption(definition.color).swatch} />}
            onPress={
              reordering
                ? undefined
                : () =>
                    setDraft({ id: definition.id, name: definition.name, color: definition.color })
            }
            testID={`goal-status-row-${definition.id}`}
            trailing={
              reordering ? (
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  <IconButton
                    disabled={busy || index === 0}
                    icon="chevron-up"
                    label={`Move ${definition.name} up`}
                    onPress={() => void reorder(index, -1)}
                    testID={`goal-status-reorder-${definition.id}-up`}
                    variant="plain"
                  />
                  <IconButton
                    disabled={busy || index === definitions.length - 1}
                    icon="chevron-down"
                    label={`Move ${definition.name} down`}
                    onPress={() => void reorder(index, 1)}
                    testID={`goal-status-reorder-${definition.id}-down`}
                    variant="plain"
                  />
                </View>
              ) : undefined
            }
          />
        ))}
        <FormRow
          disabled={busy || reordering}
          icon="plus"
          kind="action"
          label="Add Status"
          onPress={() => setDraft({ id: null, name: '', color: 'green' })}
          testID="goal-status-add"
        />
      </FormSection>
      <StatusSheet
        busy={busy}
        draft={draft}
        onCancel={() => setDraft(null)}
        onChange={setDraft}
        onDelete={async () => {
          const id = draft?.id;
          if (!id) return false;
          const deleted = await onMutation((nextService) => nextService.deleteStatusDefinition(id));
          if (deleted) setDraft(null);
          return deleted;
        }}
        onSave={saveDraft}
      />
    </Form>
  );
}

export default function GoalsSettingsPanel() {
  const focused = useIsFocused();
  const { colors } = useAppTheme();
  const [service, setService] = useState<GoalService | null>(null);
  const [settings, setSettings] = useState<GoalSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const runtime = await loadGoalsRuntime();
      const nextSettings = await runtime.goalService.readSettings();
      setService(runtime.goalService);
      setSettings(nextSettings);
    } catch (error) {
      setLoadError(errorText(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (focused) void Promise.resolve().then(load);
  }, [focused, load]);

  const onMutation = async (
    mutation: (nextService: GoalService) => Promise<unknown>
  ): Promise<boolean> => {
    if (!service || saving) return false;
    setSaving(true);
    setActionError(null);
    try {
      await mutation(service);
      setSettings(await service.readSettings());
      return true;
    } catch (error) {
      setActionError(errorText(error));
      return false;
    } finally {
      setSaving(false);
    }
  };

  if (loading || !service || !settings) {
    return (
      <Column spacing={12} style={{ width: '100%' }} testID="settings-goals-loading">
        <Text textStyle={{ color: loadError ? colors.text : colors.textMuted, fontSize: 15 }}>
          {loadError ?? 'Loading goal settings...'}
        </Text>
        {loadError ? (
          <AppButton label="Retry" onPress={() => void load()} testID="settings-goals-retry" />
        ) : null}
      </Column>
    );
  }

  return (
    <Column spacing={14} style={{ width: '100%' }}>
      {actionError ? (
        <Column
          spacing={6}
          style={{
            backgroundColor: colors.danger.background,
            borderColor: colors.danger.foreground,
            borderRadius: 12,
            borderWidth: 1,
            padding: 12,
            width: '100%',
          }}
          testID="settings-goals-error"
        >
          <Text textStyle={{ color: colors.danger.foreground, fontSize: 14, fontWeight: '700' }}>
            Goal settings could not be saved
          </Text>
          <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{actionError}</Text>
          <AppButton
            label="Dismiss"
            onPress={() => setActionError(null)}
            style={{ height: 42 }}
            testID="settings-goals-error-dismiss"
            variant="outlined"
          />
        </Column>
      ) : null}
      <GoalsSettingsContent busy={saving} onMutation={onMutation} settings={settings} />
    </Column>
  );
}
