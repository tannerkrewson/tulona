import { Column, Picker, Row, Text } from '@expo/ui';
import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import {
  MAX_GOAL_HISTORICAL_CIRCLE_COUNT,
  MIN_GOAL_HISTORICAL_CIRCLE_COUNT,
  type GoalSettings,
  type GoalStatusColor,
  type GoalStatusDefinition,
} from '@domain';
import { useAppTheme } from '@theme';
import { AccessiblePicker, AccessibleTextInput, AppButton, errorText, ReorderControls } from '@ui';

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

function Field({ label, children }: { label: string; children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <Column spacing={6} style={{ width: '100%' }}>
      <Text textStyle={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{label}</Text>
      {children}
    </Column>
  );
}

function statusColorOption(color: GoalStatusColor) {
  return STATUS_COLOR_OPTIONS.find((option) => option.value === color) ?? STATUS_COLOR_OPTIONS[0];
}

function StatusColorPicker({
  value,
  onChange,
  testID,
  disabled,
}: {
  value: GoalStatusColor;
  onChange: (value: GoalStatusColor) => void;
  testID: string;
  disabled: boolean;
}) {
  const option = statusColorOption(value);
  return (
    <Row alignment="center" spacing={10} style={{ width: '100%' }}>
      <View
        style={{
          backgroundColor: option.swatch,
          borderColor: '#00000022',
          borderRadius: 12,
          borderWidth: 1,
          height: 24,
          width: 24,
        }}
      />
      <View style={{ flex: 1 }}>
        <AccessiblePicker
          enabled={!disabled}
          label="Status color"
          onValueChange={(next) => onChange(next as GoalStatusColor)}
          selectedValue={value}
          testID={testID}
        >
          {STATUS_COLOR_OPTIONS.map((color) => (
            <Picker.Item key={color.value} label={color.label} value={color.value} />
          ))}
        </AccessiblePicker>
      </View>
    </Row>
  );
}

function StatusDefinitionRow({
  definition,
  busy,
  isFirst,
  isLast,
  onSave,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  definition: GoalStatusDefinition;
  busy: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSave: (id: string, input: UpdateGoalStatusDefinitionInput) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onMoveUp: () => Promise<boolean>;
  onMoveDown: () => Promise<boolean>;
}) {
  const { colors } = useAppTheme();
  const [name, setName] = useState(definition.name);
  const [color, setColor] = useState<GoalStatusColor>(definition.color);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <Column
      spacing={12}
      style={{
        backgroundColor: colors.surfaceMuted,
        borderColor: colors.border,
        borderRadius: 12,
        borderWidth: 1,
        padding: 14,
        width: '100%',
      }}
      testID={`goal-status-${definition.id}`}
    >
      <AccessibleTextInput
        autoCorrect={false}
        label={`${definition.name} status name`}
        onChangeText={setName}
        placeholder="Status name"
        testID={`goal-status-name-${definition.id}`}
        defaultValue={name}
        textStyle={{ color: colors.text, fontSize: 16 }}
      />
      <StatusColorPicker
        disabled={busy}
        onChange={setColor}
        testID={`goal-status-color-${definition.id}`}
        value={color}
      />
      <Row alignment="center" spacing={8} style={{ width: '100%' }}>
        <View style={{ flex: 1 }}>
          <AppButton
            disabled={busy || name.trim().length === 0}
            label="Save status"
            onPress={() => void onSave(definition.id, { name, color })}
            style={{ height: 44, width: '100%' }}
            testID={`goal-status-save-${definition.id}`}
          />
        </View>
        <AppButton
          disabled={busy}
          label="Delete"
          onPress={() => setConfirmingDelete(true)}
          style={{ height: 44 }}
          testID={`goal-status-delete-${definition.id}`}
          variant="outlined"
        />
      </Row>
      <ReorderControls
        canMoveDown={!isLast}
        canMoveUp={!isFirst}
        disabled={busy}
        onMoveDown={() => void onMoveDown()}
        onMoveUp={() => void onMoveUp()}
        testID={`goal-status-reorder-${definition.id}`}
      />
      {confirmingDelete ? (
        <Column
          spacing={8}
          style={{
            backgroundColor: colors.warning.background,
            borderColor: colors.warning.foreground,
            borderRadius: 10,
            borderWidth: 1,
            padding: 12,
            width: '100%',
          }}
          testID={`goal-status-delete-confirmation-${definition.id}`}
        >
          <Text textStyle={{ color: colors.warning.foreground, fontSize: 14, lineHeight: 20 }}>
            Deleting a status is allowed only when no weekly history or automatic rule uses it.
          </Text>
          <Row alignment="center" spacing={8} style={{ width: '100%' }}>
            <View style={{ flex: 1 }}>
              <AppButton
                disabled={busy}
                label="Confirm delete"
                onPress={() => {
                  void onDelete(definition.id).then((deleted) => {
                    if (deleted) setConfirmingDelete(false);
                  });
                }}
                style={{ height: 44, width: '100%' }}
                testID={`goal-status-confirm-delete-${definition.id}`}
              />
            </View>
            <AppButton
              disabled={busy}
              label="Cancel"
              onPress={() => setConfirmingDelete(false)}
              style={{ height: 44 }}
              testID={`goal-status-cancel-delete-${definition.id}`}
              variant="outlined"
            />
          </Row>
        </Column>
      ) : null}
    </Column>
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
  const { colors } = useAppTheme();
  const [newStatusName, setNewStatusName] = useState('');
  const [newStatusColor, setNewStatusColor] = useState<GoalStatusColor>('green');
  const [newStatusInputVersion, setNewStatusInputVersion] = useState(0);
  const definitions = settings.statusDefinitions;

  const saveDefinition = async (
    id: string,
    input: UpdateGoalStatusDefinitionInput
  ): Promise<boolean> => onMutation((nextService) => nextService.updateStatusDefinition(id, input));

  const deleteDefinition = async (id: string): Promise<boolean> =>
    onMutation((nextService) => nextService.deleteStatusDefinition(id));

  const reorder = async (index: number, direction: -1 | 1): Promise<boolean> => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= definitions.length) return false;
    const ids = definitions.map((definition) => definition.id);
    [ids[index], ids[nextIndex]] = [ids[nextIndex] as string, ids[index] as string];
    return onMutation((nextService) => nextService.reorderStatusDefinitions(ids));
  };

  return (
    <Column spacing={18} style={{ width: '100%' }} testID="settings-goals">
      <Text textStyle={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
        These settings apply to every weekly goal. Status colors are semantic and shared by current
        and historical goal reviews.
      </Text>
      <Field label="Weekly review day">
        <AccessiblePicker
          enabled={!busy}
          label="Weekly review day"
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
        </AccessiblePicker>
      </Field>
      <Field label="Historical status circles">
        <AccessiblePicker
          enabled={!busy}
          label="Historical status circles"
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
        </AccessiblePicker>
      </Field>
      <Column spacing={12} style={{ width: '100%' }} testID="goal-status-definitions">
        <Column spacing={4} style={{ width: '100%' }}>
          <Text textStyle={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>
            Status definitions
          </Text>
          <Text textStyle={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
            Rename, recolor, reorder, or remove the shared statuses used by goal reviews.
          </Text>
        </Column>
        {definitions.map((definition, index) => (
          <StatusDefinitionRow
            busy={busy}
            definition={definition}
            isFirst={index === 0}
            isLast={index === definitions.length - 1}
            key={`${definition.id}-${definition.name}-${definition.color}`}
            onDelete={deleteDefinition}
            onMoveDown={() => reorder(index, 1)}
            onMoveUp={() => reorder(index, -1)}
            onSave={saveDefinition}
          />
        ))}
        <Column
          spacing={12}
          style={{
            borderColor: colors.border,
            borderRadius: 12,
            borderWidth: 1,
            padding: 14,
            width: '100%',
          }}
          testID="goal-status-create"
        >
          <Text textStyle={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>
            Add a status
          </Text>
          <AccessibleTextInput
            autoCorrect={false}
            defaultValue={newStatusName}
            key={`goal-status-new-name-${newStatusInputVersion}`}
            label="New status name"
            onChangeText={setNewStatusName}
            placeholder="Status name"
            testID="goal-status-new-name"
            textStyle={{ color: colors.text, fontSize: 16 }}
          />
          <StatusColorPicker
            disabled={busy}
            onChange={setNewStatusColor}
            testID="goal-status-new-color"
            value={newStatusColor}
          />
          <AppButton
            disabled={busy || newStatusName.trim().length === 0}
            label="Add status"
            onPress={() => {
              const input: CreateGoalStatusDefinitionInput = {
                name: newStatusName,
                color: newStatusColor,
              };
              void onMutation((nextService) => nextService.createStatusDefinition(input)).then(
                (created) => {
                  if (created) {
                    setNewStatusName('');
                    setNewStatusColor('green');
                    setNewStatusInputVersion((version) => version + 1);
                  }
                }
              );
            }}
            style={{ height: 48, width: '100%' }}
            testID="goal-status-add"
          />
        </Column>
      </Column>
    </Column>
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
