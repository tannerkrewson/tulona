import { Picker } from '@expo/ui';
import { Column, Row, Text } from '@ui/primitives';
import { useIsFocused, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text as NativeText, View } from 'react-native';

import type {
  AppSettings,
  CatalogCollection,
  Goal,
  GoalEvaluationMode,
  GoalEvaluationRule,
  GoalOverallStatusFilter,
  GoalRuleStatusIds,
  GoalSettings,
  GoalStatusColor,
  GoalStatusDefinition,
  GoalTargetFrequency,
  GoalWeekIdentity,
  GoalWeeklyStatus,
  Habit,
  UUID,
} from '@domain';
import { logicalDayDifference, shiftLogicalDay } from '@domain';
import { evaluateGoal, type GoalEvaluation } from './goal-evaluator';
import { loadGoalsRuntime, type GoalsRuntime } from './goal-runtime';
import type { GoalEvaluationRuleInput, GoalService } from './goal-service';
import { formatGoalWeek } from './goal-review-navigation';
import { useAppTheme } from '@theme';
import {
  AppButton,
  confirmAction,
  EmptyState,
  errorText,
  dayFromDate,
  Form,
  FormDateRow,
  FormPickerRow,
  FormRow,
  FormSection,
  FormTextField,
  getRowSurfaceBackground,
  getRowSurfaceStyle,
  IconButton,
  PageFilterMenu,
  PageFilterMenuSelection,
  HeaderTextButton,
  Screen,
} from '@ui';

import { CatalogEditActions } from '../tracker/CatalogEditActions';
import { CatalogIconButton } from '../tracker/CatalogIconButton';

const OVERALL_STATUS_OPTIONS: readonly {
  value: GoalOverallStatusFilter;
  label: string;
  icon: string;
}[] = [
  { value: 'in-progress', label: 'Active', icon: 'activity' },
  { value: 'future', label: 'Future', icon: 'calendar-days' },
  { value: 'completed', label: 'Completed', icon: 'check-circle-2' },
  { value: 'gave-up', label: 'Gave up', icon: 'archive' },
  { value: 'all', label: 'All goals', icon: 'award' },
];

const STATUS_SWATCHES: Record<GoalStatusColor, { background: string; foreground: string }> = {
  green: { background: '#22C55E', foreground: '#111111' },
  yellow: { background: '#EAB308', foreground: '#111111' },
  red: { background: '#EF4444', foreground: '#FFFFFF' },
  'light-grey': { background: '#D1D5DB', foreground: '#111111' },
};

type DraftRule = {
  kind: GoalEvaluationRule['kind'];
  sourceId: string;
  measurement: Extract<GoalEvaluationRule, { kind: 'habit' }>['measurement'];
  targetCount: string;
  comparison: Extract<GoalEvaluationRule, { kind: 'activity-duration' }>['comparison'];
  frequency: GoalTargetFrequency;
  targetMinutes: string;
  baselineMinutes: string;
  statusIds: GoalRuleStatusIds;
};

interface WeekSnapshot {
  week: GoalWeekIdentity;
  statuses: Map<string, GoalWeeklyStatus>;
  evaluations: Map<string, GoalEvaluation>;
}

export interface GoalsPageData {
  runtime: GoalsRuntime;
  appSettings: AppSettings;
  goalSettings: GoalSettings;
  goals: Goal[];
  habits: Habit[];
  catalog: CatalogCollection;
  currentWeek: GoalWeekIdentity;
  historicalWeeks: WeekSnapshot[];
  /** Full navigable history since the earliest goal start week. */
  reviewWeeks?: WeekSnapshot[];
  currentSnapshot: WeekSnapshot;
}

interface DisplayStatus {
  statusId: UUID;
  note: string | null;
  source: 'manual' | 'automatic';
}

function orderedStatusDefinitions(settings: GoalSettings): GoalStatusDefinition[] {
  return [...settings.statusDefinitions].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)
  );
}

function defaultRuleStatusIds(settings: GoalSettings): GoalRuleStatusIds {
  const definitions = orderedStatusDefinitions(settings);
  const first = definitions[0]?.id;
  if (!first) throw new Error('At least one goal status is required');
  return {
    good: first,
    partial: definitions[1]?.id ?? first,
    noProgress: definitions[2]?.id ?? definitions.at(-1)?.id ?? first,
  };
}

function draftRuleFromGoal(rule: GoalEvaluationRule): DraftRule {
  if (rule.kind === 'weekly-status') {
    return {
      kind: rule.kind,
      sourceId: '',
      measurement: 'completed-days',
      targetCount: '1',
      comparison: 'at-least',
      frequency: 'weekly',
      targetMinutes: '30',
      baselineMinutes: '',
      statusIds: { ...rule.statusIds },
    };
  }
  if (rule.kind === 'habit') {
    return {
      kind: rule.kind,
      sourceId: rule.habitId,
      measurement: rule.measurement,
      targetCount: rule.targetCount === undefined ? '1' : String(rule.targetCount),
      comparison: 'at-least',
      frequency: 'weekly',
      targetMinutes: '30',
      baselineMinutes: '',
      statusIds: { ...rule.statusIds },
    };
  }
  return {
    kind: rule.kind,
    sourceId: rule.activityId,
    measurement: 'completed-days',
    targetCount: '1',
    comparison: rule.comparison,
    frequency: rule.frequency ?? 'weekly',
    targetMinutes: String(Math.max(0, Math.round(rule.targetMs / 60000))),
    baselineMinutes:
      rule.baselineMs === undefined ? '' : String(Math.max(0, Math.round(rule.baselineMs / 60000))),
    statusIds: { ...rule.statusIds },
  };
}

function blankDraftRule(
  kind: GoalEvaluationRule['kind'],
  settings: GoalSettings,
  habits: readonly Habit[],
  catalog: CatalogCollection
): DraftRule {
  return {
    kind,
    sourceId:
      kind === 'habit'
        ? (habits[0]?.id ?? '')
        : kind === 'activity-duration'
          ? ([...catalog.activities, ...catalog.routines].find((item) => item.archivedAt === null)
              ?.id ?? '')
          : '',
    measurement: 'completed-days',
    targetCount: '1',
    comparison: 'at-least',
    frequency: 'weekly',
    targetMinutes: '30',
    baselineMinutes: '',
    statusIds: defaultRuleStatusIds(settings),
  };
}

export function formatWeek(week: GoalWeekIdentity): string {
  return formatGoalWeek(week);
}

function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '0 minutes';
  if (minutes < 60) return String(minutes) + ' minute' + (minutes === 1 ? '' : 's');
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining === 0
    ? String(hours) + ' hour' + (hours === 1 ? '' : 's')
    : String(hours) + 'h ' + String(remaining) + 'm';
}

function formatRule(
  rule: GoalEvaluationRule,
  habits: readonly Habit[],
  catalog: CatalogCollection
): string {
  if (rule.kind === 'weekly-status') return 'Set a status during weekly review';
  if (rule.kind === 'habit') {
    const name = habits.find((habit) => habit.id === rule.habitId)?.name ?? 'Missing habit';
    if (rule.measurement === 'completed-days') {
      const target = rule.targetCount ?? 1;
      return name + ': complete ' + String(target) + ' scheduled day' + (target === 1 ? '' : 's');
    }
    return (
      name +
      ': ' +
      (rule.measurement === 'every-day'
        ? 'complete every scheduled day'
        : 'do not skip a scheduled day')
    );
  }
  const name =
    [...catalog.activities, ...catalog.routines].find((item) => item.id === rule.activityId)
      ?.name ?? 'Missing activity';
  return (
    name +
    ': ' +
    (rule.comparison === 'at-least' ? 'at least ' : 'at most ') +
    formatMinutes(Math.round(rule.targetMs / 60000)) +
    (rule.frequency === 'daily' ? ' per day' : ' per week')
  );
}

export function displayStatus(goal: Goal, snapshot: WeekSnapshot): DisplayStatus | null {
  if (goal.startWeek && snapshot.week.weekStart < goal.startWeek) return null;
  const manual = snapshot.statuses.get(goal.id);
  if (manual) return { statusId: manual.statusId, note: manual.note, source: 'manual' };
  const evaluation = snapshot.evaluations.get(goal.id);
  if (goal.evaluationMode === 'automatic' && evaluation?.statusId) {
    return { statusId: evaluation.statusId, note: null, source: 'automatic' };
  }
  return null;
}

export function statusDefinition(
  settings: GoalSettings,
  statusId: string | null | undefined
): GoalStatusDefinition | null {
  return statusId
    ? (settings.statusDefinitions.find((definition) => definition.id === statusId) ?? null)
    : null;
}

export function StatusBadge({
  definition,
  label,
}: {
  definition: GoalStatusDefinition | null;
  label: string;
}) {
  const { colors } = useAppTheme();
  const swatch = definition ? STATUS_SWATCHES[definition.color] : null;
  return (
    <View
      accessibilityLabel={label}
      style={{
        backgroundColor: swatch?.background ?? colors.surfaceMuted,
        borderColor: swatch?.background ?? colors.border,
        borderRadius: 999,
        borderWidth: 1,
        maxWidth: 180,
        paddingHorizontal: 10,
        paddingVertical: 6,
      }}
      testID="goal-current-status"
    >
      <NativeText
        numberOfLines={1}
        style={{
          color: swatch?.foreground ?? colors.textMuted,
          fontSize: 12,
          fontWeight: '700',
        }}
      >
        {label}
      </NativeText>
    </View>
  );
}

function StatusCircle({
  definition,
  label,
  testID,
}: {
  definition: GoalStatusDefinition | null;
  label: string;
  testID: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View
      accessibilityLabel={label}
      style={{
        backgroundColor: definition ? STATUS_SWATCHES[definition.color].background : colors.surface,
        borderColor: definition ? STATUS_SWATCHES[definition.color].background : colors.border,
        borderRadius: 999,
        borderWidth: 1,
        height: 18,
        width: 18,
      }}
      testID={testID}
    />
  );
}

function StatusCircleHistory({
  goal,
  snapshots,
  settings,
}: {
  goal: Goal;
  snapshots: readonly WeekSnapshot[];
  settings: GoalSettings;
}) {
  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', gap: 8, width: '100%' }}>
      <ScrollView
        contentContainerStyle={{ alignItems: 'center', gap: 6 }}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        testID={'goal-history-' + goal.id}
      >
        {snapshots.map((snapshot) => {
          const status = displayStatus(goal, snapshot);
          const definition = statusDefinition(settings, status?.statusId);
          return (
            <StatusCircle
              definition={definition}
              key={goal.id + '-' + snapshot.week.weekStart}
              label={formatWeek(snapshot.week) + ': ' + (definition?.name ?? 'Not reviewed')}
              testID={'goal-history-circle-' + goal.id + '-' + snapshot.week.weekStart}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

function GoalRow({
  goal,
  currentSnapshot,
  historicalWeeks,
  settings,
  habits,
  catalog,
  editMode,
  disabled,
  onEdit,
  onMoveDown,
  onMoveUp,
  onReview,
}: {
  goal: Goal;
  currentSnapshot: WeekSnapshot;
  historicalWeeks: readonly WeekSnapshot[];
  settings: GoalSettings;
  habits: readonly Habit[];
  catalog: CatalogCollection;
  editMode: boolean;
  disabled: boolean;
  onEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onReview: () => void;
}) {
  const { colorScheme, colors } = useAppTheme();
  const status = displayStatus(goal, currentSnapshot);
  const definition = statusDefinition(settings, status?.statusId);
  const statusLabel =
    definition?.name ?? (goal.evaluationMode === 'manual' ? 'Not reviewed' : 'No result yet');
  const cardContent = (
    <Column
      spacing={12}
      style={{
        paddingBottom: 8,
        paddingHorizontal: 16,
        paddingTop: 16,
        width: '100%',
      }}
    >
      <Row alignment="center" spacing={10} style={{ width: '100%' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <NativeText
            numberOfLines={2}
            style={{ color: colors.text, fontSize: 19, fontWeight: '700', lineHeight: 24 }}
          >
            {goal.title}
          </NativeText>
        </View>
        <StatusBadge definition={definition} label={statusLabel} />
      </Row>
      <StatusCircleHistory goal={goal} settings={settings} snapshots={historicalWeeks} />
      {status?.note ? (
        <Text
          textStyle={{
            color: colors.textMuted,
            fontSize: 14,
            lineHeight: 20,
          }}
        >
          {'“' + status.note + '”'}
        </Text>
      ) : null}
      {goal.evaluationMode === 'automatic' && goal.rules.length > 0 ? (
        <Column spacing={4} style={{ width: '100%' }} testID={'goal-rules-' + goal.id}>
          <Text textStyle={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>
            Weekly checks
          </Text>
          {goal.rules.map((rule, index) => (
            <Text
              key={goal.id + '-rule-' + index}
              textStyle={{ color: colors.textMuted, fontSize: 13 }}
            >
              {'• ' + formatRule(rule, habits, catalog)}
            </Text>
          ))}
        </Column>
      ) : null}
    </Column>
  );
  const hostedCardContent = <View style={{ width: '100%' }}>{cardContent}</View>;

  const cardStyle = {
    ...getRowSurfaceStyle({
      backgroundColor: getRowSurfaceBackground({
        colorScheme,
        surface: colors.surface,
        surfaceMuted: colors.surfaceMuted,
      }),
    }),
    width: '100%',
  } as const;

  if (editMode) {
    return (
      <View style={{ ...cardStyle, flexDirection: 'row' }} testID={'goal-row-' + goal.id}>
        <Pressable
          accessibilityLabel={`Edit ${goal.title}`}
          accessibilityRole="button"
          onPress={onEdit}
          style={({ pressed }) => ({
            flex: 1,
            minWidth: 0,
            opacity: pressed ? 0.72 : 1,
          })}
        >
          {hostedCardContent}
        </Pressable>
        <CatalogEditActions
          disabled={disabled}
          inline
          onDown={onMoveDown}
          onUp={onMoveUp}
          testID={`goal-actions-${goal.id}`}
        />
      </View>
    );
  }

  return (
    <Pressable
      accessibilityLabel={goal.title}
      accessibilityRole="button"
      onPress={onReview}
      style={({ pressed }) => ({ ...cardStyle, opacity: pressed ? 0.78 : 1 })}
      testID={'goal-row-' + goal.id}
    >
      {hostedCardContent}
    </Pressable>
  );
}

export function ReviewPanel({
  goals,
  currentWeek,
  currentSnapshot,
  settings,
  service,
  onSaved,
}: {
  goals: readonly Goal[];
  currentWeek: GoalWeekIdentity;
  currentSnapshot: WeekSnapshot;
  settings: GoalSettings;
  service: GoalService;
  onSaved: () => Promise<void>;
}) {
  const reviewGoals = goals.filter(
    (goal) => !goal.startWeek || currentWeek.weekStart >= goal.startWeek
  );
  const [drafts, setDrafts] = useState<Record<string, { statusId: string; note: string }>>(() =>
    Object.fromEntries(
      reviewGoals.map((goal) => {
        const current = displayStatus(goal, currentSnapshot);
        return [
          goal.id,
          {
            statusId: current?.statusId ?? settings.statusDefinitions[0]?.id ?? '',
            note: current?.note ?? '',
          },
        ];
      })
    )
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      for (const goal of reviewGoals) {
        const draft = drafts[goal.id];
        if (!draft?.statusId) throw new Error('Choose a status for ' + goal.title);
        await service.setWeeklyStatus({
          goalId: goal.id,
          weekStart: currentWeek.weekStart,
          statusId: draft.statusId,
          note: draft.note,
        });
      }
      await onSaved();
    } catch (saveError) {
      setError(errorText(saveError));
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: 28, width: '100%' }} testID="goal-review-panel">
      {reviewGoals.length === 0 ? (
        <FormSection footer="This goal hadn’t started yet." />
      ) : (
        reviewGoals.map((goal) => {
          const draft = drafts[goal.id] ?? { statusId: '', note: '' };
          return (
            <FormSection
              footer={
                goal.evaluationMode === 'automatic'
                  ? 'Choosing a status here replaces the calculated result for this week.'
                  : undefined
              }
              key={goal.id}
              testID={'goal-review-item-' + goal.id}
              title={reviewGoals.length > 1 ? goal.title : undefined}
            >
              <FormPickerRow
                enabled={!saving}
                label="Status"
                onValueChange={(value) =>
                  setDrafts((current) => ({
                    ...current,
                    [goal.id]: { ...draft, statusId: String(value) },
                  }))
                }
                selectedValue={draft.statusId}
                testID={'goal-review-status-' + goal.id}
              >
                {orderedStatusDefinitions(settings).map((definition) => (
                  <Picker.Item key={definition.id} label={definition.name} value={definition.id} />
                ))}
              </FormPickerRow>
              <FormTextField
                label={goal.title + ' weekly note'}
                multiline
                onChangeText={(note) =>
                  setDrafts((current) => ({
                    ...current,
                    [goal.id]: { ...draft, note },
                  }))
                }
                placeholder="Note"
                testID={'goal-review-note-' + goal.id}
                value={draft.note}
              />
            </FormSection>
          );
        })
      )}
      {reviewGoals.length > 0 ? (
        <FormSection footer={error ?? undefined} footerTone="danger">
          <FormRow
            disabled={saving}
            kind="action"
            label={saving ? 'Saving…' : 'Save Review'}
            onPress={() => void save()}
            testID="goal-review-save"
          />
        </FormSection>
      ) : null}
    </View>
  );
}

const MINUTE_PRESETS = [
  5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 360, 420, 480, 600, 720, 900, 1200, 1500, 1800,
  2400, 3000,
] as const;

function minuteOptions(current: string, minimum: number, includeZero: boolean): number[] {
  const values = new Set<number>(MINUTE_PRESETS.filter((minutes) => minutes > minimum));
  if (includeZero) values.add(0);
  const currentMinutes = current.trim() ? Number(current) : NaN;
  if (Number.isInteger(currentMinutes) && currentMinutes >= 0) values.add(currentMinutes);
  return [...values].sort((left, right) => left - right);
}

function RuleEditor({
  rule,
  index,
  habits,
  catalog,
  settings,
  disabled,
  onChange,
  onRemove,
}: {
  rule: DraftRule;
  index: number;
  habits: readonly Habit[];
  catalog: CatalogCollection;
  settings: GoalSettings;
  disabled: boolean;
  onChange: (rule: DraftRule) => void;
  onRemove: () => void;
}) {
  const candidates =
    rule.kind === 'habit'
      ? habits
      : rule.kind === 'activity-duration'
        ? [...catalog.activities, ...catalog.routines]
        : [];
  const per = rule.frequency === 'daily' ? 'day' : 'week';
  const targetMinutes = Number(rule.targetMinutes) || 0;
  const footer =
    rule.kind === 'weekly-status'
      ? 'You pick this result during your weekly review.'
      : rule.kind === 'activity-duration' && rule.comparison === 'at-most'
        ? rule.baselineMinutes.trim()
          ? `Cutting back from where you started counts as Partial. Staying at or under the limit each ${per} counts as Good.`
          : `Set where you're starting from to get Partial credit for cutting back.`
        : undefined;
  return (
    <FormSection
      footer={footer}
      headerAction={
        <HeaderTextButton
          compact
          disabled={disabled}
          label="Remove"
          onPress={onRemove}
          testID={'goal-rule-remove-' + index}
        />
      }
      testID={'goal-rule-editor-' + index}
      title={'Check ' + (index + 1)}
    >
      <FormPickerRow
        enabled={!disabled}
        label="Type"
        onValueChange={(value) => {
          const kind = String(value) as GoalEvaluationRule['kind'];
          onChange(blankDraftRule(kind, settings, habits, catalog));
        }}
        selectedValue={rule.kind}
        testID={'goal-rule-kind-' + index}
      >
        <Picker.Item label="Habit" value="habit" />
        <Picker.Item label="Tracked time" value="activity-duration" />
        <Picker.Item label="Manual" value="weekly-status" />
      </FormPickerRow>
      {rule.kind !== 'weekly-status' ? (
        <FormPickerRow
          enabled={!disabled}
          label={rule.kind === 'habit' ? 'Habit' : 'Activity'}
          onValueChange={(value) => onChange({ ...rule, sourceId: String(value) })}
          selectedValue={rule.sourceId}
          testID={'goal-rule-source-' + index}
        >
          <Picker.Item label={candidates.length === 0 ? 'None available' : 'Choose'} value="" />
          {candidates.map((candidate) => (
            <Picker.Item
              key={candidate.id}
              label={
                `${candidate.name}${'kind' in candidate && candidate.kind === 'routine' ? ' (routine)' : ''}` +
                ('archivedAt' in candidate && candidate.archivedAt ? ' (archived)' : '')
              }
              value={candidate.id}
            />
          ))}
        </FormPickerRow>
      ) : null}
      {rule.kind === 'habit' ? (
        <FormPickerRow
          enabled={!disabled}
          label="Goal"
          onValueChange={(value) => {
            const measurement = String(value) as DraftRule['measurement'];
            onChange({
              ...rule,
              measurement,
              targetCount: measurement === 'completed-days' ? rule.targetCount || '1' : '',
            });
          }}
          selectedValue={rule.measurement}
          testID={'goal-rule-measurement-' + index}
        >
          <Picker.Item label="Done some days" value="completed-days" />
          <Picker.Item label="No skipped days" value="no-skipped" />
          <Picker.Item label="Every scheduled day" value="every-day" />
        </FormPickerRow>
      ) : null}
      {rule.kind === 'habit' && rule.measurement === 'completed-days' ? (
        <FormPickerRow
          enabled={!disabled}
          label="Days"
          onValueChange={(value) => onChange({ ...rule, targetCount: String(value) })}
          selectedValue={rule.targetCount}
          testID={'goal-rule-target-count-' + index}
        >
          {Array.from({ length: 7 }, (_, day) => String(day + 1)).map((value) => (
            <Picker.Item
              key={value}
              label={`${value} ${value === '1' ? 'day' : 'days'} a week`}
              value={value}
            />
          ))}
        </FormPickerRow>
      ) : null}
      {rule.kind === 'activity-duration' ? (
        <FormPickerRow
          enabled={!disabled}
          label="Aim for"
          onValueChange={(value) =>
            onChange({ ...rule, comparison: String(value) as DraftRule['comparison'] })
          }
          selectedValue={rule.comparison}
          testID={'goal-rule-comparison-' + index}
        >
          <Picker.Item label="At least" value="at-least" />
          <Picker.Item label="At most" value="at-most" />
        </FormPickerRow>
      ) : null}
      {rule.kind === 'activity-duration' ? (
        <FormPickerRow
          enabled={!disabled}
          label="Time"
          onValueChange={(value) => onChange({ ...rule, targetMinutes: String(value) })}
          selectedValue={rule.targetMinutes}
          testID={'goal-rule-target-minutes-' + index}
        >
          {minuteOptions(rule.targetMinutes, 0, rule.comparison === 'at-most').map((minutes) => (
            <Picker.Item key={minutes} label={formatMinutes(minutes)} value={String(minutes)} />
          ))}
        </FormPickerRow>
      ) : null}
      {rule.kind === 'activity-duration' ? (
        <FormPickerRow
          enabled={!disabled}
          label="Per"
          onValueChange={(value) =>
            onChange({ ...rule, frequency: String(value) as GoalTargetFrequency })
          }
          selectedValue={rule.frequency}
          testID={'goal-rule-frequency-' + index}
        >
          <Picker.Item label="Day" value="daily" />
          <Picker.Item label="Week" value="weekly" />
        </FormPickerRow>
      ) : null}
      {rule.kind === 'activity-duration' && rule.comparison === 'at-most' ? (
        <FormPickerRow
          enabled={!disabled}
          label="Starting from"
          onValueChange={(value) => onChange({ ...rule, baselineMinutes: String(value) })}
          selectedValue={rule.baselineMinutes.trim()}
          testID={'goal-rule-baseline-minutes-' + index}
        >
          <Picker.Item label="Not set" value="" />
          {minuteOptions(rule.baselineMinutes, targetMinutes, false).map((minutes) => (
            <Picker.Item key={minutes} label={formatMinutes(minutes)} value={String(minutes)} />
          ))}
        </FormPickerRow>
      ) : null}
    </FormSection>
  );
}

export function GoalEditor({
  goal,
  service,
  settings,
  habits,
  catalog,
  onCancel,
  onSaved,
  onDeleted,
}: {
  goal: Goal | null;
  service: GoalService;
  settings: GoalSettings;
  habits: readonly Habit[];
  catalog: CatalogCollection;
  onCancel: () => void;
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const currentWeek = service.week(new Date());
  const initialStartWeek = goal ? service.week(goal.startWeek ?? goal.createdAt) : currentWeek;
  const [title, setTitle] = useState(goal?.title ?? '');
  const [overallStatus, setOverallStatus] = useState<Goal['overallStatus']>(
    goal?.overallStatus ?? 'in-progress'
  );
  const [evaluationMode, setEvaluationMode] = useState<GoalEvaluationMode>(
    goal?.evaluationMode ?? 'manual'
  );
  const [rules, setRules] = useState<DraftRule[]>(() => (goal?.rules ?? []).map(draftRuleFromGoal));
  const [startWeekDate, setStartWeekDate] = useState(() => new Date(initialStartWeek.startMs));
  const [backfillStatusId, setBackfillStatusId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<'save' | 'delete' | null>(null);

  const updateRule = (index: number, next: DraftRule) =>
    setRules((current) =>
      current.map((rule, candidateIndex) => (candidateIndex === index ? next : rule))
    );

  const buildRules = (): GoalEvaluationRuleInput[] =>
    rules.map((rule, index) => {
      if (rule.kind === 'weekly-status') {
        return { kind: 'weekly-status', statusIds: rule.statusIds };
      }
      if (!rule.sourceId) throw new Error('Choose a source for weekly check ' + (index + 1));
      if (rule.kind === 'habit') {
        if (rule.measurement === 'completed-days') {
          const targetCount = Number(rule.targetCount);
          if (!Number.isInteger(targetCount) || targetCount < 1 || targetCount > 7) {
            throw new Error('Habit check ' + (index + 1) + ' needs a target from 1 through 7');
          }
          return {
            kind: 'habit',
            habitId: rule.sourceId as UUID,
            measurement: rule.measurement,
            targetCount,
            statusIds: rule.statusIds,
          };
        }
        return {
          kind: 'habit',
          habitId: rule.sourceId as UUID,
          measurement: rule.measurement,
          statusIds: rule.statusIds,
        };
      }
      const targetMinutes = Number(rule.targetMinutes);
      if (!Number.isInteger(targetMinutes) || targetMinutes < 0) {
        throw new Error('Activity check ' + (index + 1) + ' needs a non-negative minute target');
      }
      const baselineMinutes = rule.baselineMinutes.trim()
        ? Number(rule.baselineMinutes)
        : undefined;
      if (
        baselineMinutes !== undefined &&
        (!Number.isInteger(baselineMinutes) || baselineMinutes < targetMinutes)
      ) {
        throw new Error(
          'Activity check ' + (index + 1) + ' needs a baseline at least as large as its target'
        );
      }
      return {
        kind: 'activity-duration',
        activityId: rule.sourceId as UUID,
        comparison: rule.comparison,
        frequency: rule.frequency,
        targetMs: targetMinutes * 60000,
        ...(baselineMinutes === undefined ? {} : { baselineMs: baselineMinutes * 60000 }),
        statusIds: rule.statusIds,
      };
    });

  const runAction = async (action: () => Promise<void>) => {
    setSaving(true);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(errorText(actionError));
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    const action = async () => {
      const nextRules = buildRules();
      if (evaluationMode === 'automatic' && nextRules.length === 0) {
        throw new Error('Add at least one weekly check to an automatic goal');
      }
      const sourceLinks = nextRules.flatMap((rule) =>
        rule.kind === 'weekly-status'
          ? []
          : [
              rule.kind === 'habit'
                ? { kind: 'habit' as const, id: rule.habitId }
                : { kind: 'activity' as const, id: rule.activityId },
            ]
      );
      if (goal) {
        await service.updateGoal(goal.id, {
          title,
          overallStatus,
          evaluationMode,
          rules: nextRules,
          sourceLinks,
        });
      } else {
        await service.createGoal({
          title,
          overallStatus,
          evaluationMode,
          startWeek: startWeekDate,
          backfillStatusId: evaluationMode === 'manual' ? backfillStatusId : '',
          rules: nextRules,
          sourceLinks,
        });
      }
      await onSaved();
    };
    setLastAction('save');
    void runAction(action);
  };

  const deleteGoal = () => {
    if (!goal) return;
    const action = async () => {
      await service.deleteGoal(goal.id);
      await onDeleted();
    };
    setLastAction('delete');
    void runAction(action);
  };

  const defaultNewRuleKind: GoalEvaluationRule['kind'] =
    habits.length > 0
      ? 'habit'
      : catalog.activities.length > 0 || catalog.routines.length > 0
        ? 'activity-duration'
        : 'weekly-status';

  return (
    <>
      <Screen
        headerRight={
          <HeaderTextButton
            disabled={saving}
            emphasized
            label={goal ? 'Save' : 'Add'}
            onPress={save}
            testID="goal-save"
          />
        }
        onBack={onCancel}
        testID="goal-editor-screen"
        title={goal ? 'Edit Goal' : 'New Goal'}
      >
        <Form testID="goal-editor">
          {error ? (
            <FormSection footer={error} testID="goal-editor-error">
              <FormRow
                disabled={saving || lastAction === null}
                icon="repeat"
                kind="action"
                label="Try Again"
                onPress={() => {
                  if (lastAction === 'save') save();
                  else if (lastAction === 'delete') deleteGoal();
                }}
                testID="goal-save-retry"
              />
            </FormSection>
          ) : null}
          <FormSection>
            <FormTextField
              autoFocus={!goal}
              label="Goal name"
              onChangeText={setTitle}
              placeholder="Name"
              testID="goal-title"
              value={title}
            />
            <FormPickerRow
              enabled={!saving}
              label="Status"
              onValueChange={(value) => setOverallStatus(String(value) as Goal['overallStatus'])}
              selectedValue={overallStatus}
              testID="goal-overall-status"
            >
              <Picker.Item label="Active" value="in-progress" />
              <Picker.Item label="Future" value="future" />
              <Picker.Item label="Completed" value="completed" />
              <Picker.Item label="Gave up" value="gave-up" />
            </FormPickerRow>
          </FormSection>
          <FormSection
            footer={
              evaluationMode === 'manual'
                ? 'You pick each week’s result and write a note during your weekly review.'
                : 'Each week gets the result of its weakest check.'
            }
            title="Weekly Result"
          >
            <FormPickerRow
              enabled={!saving}
              label="Decided by"
              onValueChange={(value) => {
                const nextMode = String(value) as GoalEvaluationMode;
                setEvaluationMode(nextMode);
                if (nextMode === 'automatic') setBackfillStatusId('');
              }}
              selectedValue={evaluationMode}
              testID="goal-evaluation-mode"
            >
              <Picker.Item label="Weekly review" value="manual" />
              <Picker.Item label="Checks" value="automatic" />
            </FormPickerRow>
          </FormSection>
          {goal ? (
            <FormSection>
              <FormRow
                label="Started"
                testID="goal-start-week-readonly"
                value={formatWeek(service.week(goal.startWeek ?? goal.createdAt))}
              />
            </FormSection>
          ) : (
            <FormSection
              footer={`${formatWeek(service.week(startWeekDate))}. Earlier weeks aren’t part of this goal.`}
              testID="goal-timeline-options"
              title="Timeline"
            >
              <FormDateRow
                label="Starts"
                maximumDate={dayFromDate(new Date(currentWeek.endMs - 1))}
                onChange={(day) => setStartWeekDate(new Date(`${day}T23:59:59.999`))}
                testID="goal-start-week"
                value={dayFromDate(startWeekDate)}
              />
              {evaluationMode === 'manual' ? (
                <FormPickerRow
                  enabled={!saving}
                  label="Fill weeks"
                  onValueChange={(value) => setBackfillStatusId(String(value))}
                  selectedValue={backfillStatusId}
                  testID="goal-start-week-backfill-status"
                >
                  <Picker.Item label="Leave empty" value="" />
                  {orderedStatusDefinitions(settings).map((definition) => (
                    <Picker.Item
                      key={definition.id}
                      label={'Mark “' + definition.name + '”'}
                      value={definition.id}
                    />
                  ))}
                </FormPickerRow>
              ) : null}
            </FormSection>
          )}
          {evaluationMode === 'automatic'
            ? rules.map((rule, index) => (
                <RuleEditor
                  catalog={catalog}
                  disabled={saving}
                  habits={habits}
                  index={index}
                  key={'goal-rule-' + index}
                  onChange={(next) => updateRule(index, next)}
                  onRemove={() =>
                    setRules((current) =>
                      current.filter((_, candidateIndex) => candidateIndex !== index)
                    )
                  }
                  rule={rule}
                  settings={settings}
                />
              ))
            : null}
          {evaluationMode === 'automatic' ? (
            <FormSection testID="goal-rule-list">
              <FormRow
                disabled={saving}
                icon="plus"
                kind="action"
                label="Add Check"
                onPress={() =>
                  setRules((current) => [
                    ...current,
                    blankDraftRule(defaultNewRuleKind, settings, habits, catalog),
                  ])
                }
                testID="goal-rule-add"
              />
            </FormSection>
          ) : null}
          {goal ? (
            <FormSection>
              <FormRow
                disabled={saving}
                icon="trash-2"
                kind="destructive"
                label="Delete Goal"
                onPress={() =>
                  void confirmAction({
                    confirmLabel: 'Delete',
                    destructive: true,
                    message: 'This also deletes the goal’s weekly review history.',
                    title: 'Delete Goal?',
                  }).then((confirmed) => {
                    if (confirmed) deleteGoal();
                  })
                }
                testID="goal-delete"
              />
            </FormSection>
          ) : null}
        </Form>
      </Screen>
    </>
  );
}

export async function loadGoalsPage(): Promise<GoalsPageData> {
  const runtime = await loadGoalsRuntime();
  const [appSettings, goalSettings, goalCollection, catalog, habits] = await Promise.all([
    runtime.settingsService.read(),
    runtime.goalService.readSettings(),
    runtime.goalService.read(),
    runtime.catalogService.read(),
    runtime.habitService.read(),
  ]);
  const nowMs = Date.now();
  const currentWeek = runtime.goalService.week(nowMs);
  const goals = goalCollection.goals.map((goal) => ({
    ...goal,
    startWeek: runtime.goalService.week(goal.startWeek ?? goal.createdAt).weekStart,
  }));
  const oldestGoalStart = goals
    .map((goal) => goal.startWeek as string)
    .sort((left, right) => left.localeCompare(right))[0];
  const weeksSinceOldestStart = oldestGoalStart
    ? Math.max(0, Math.floor(logicalDayDifference(oldestGoalStart, currentWeek.weekStart) / 7))
    : 0;
  const historyWeekCount = Math.max(goalSettings.historicalCircleCount, weeksSinceOldestStart);
  const allHistoricalWeeks = Array.from({ length: historyWeekCount }, (_, index) =>
    runtime.goalService.week(
      shiftLogicalDay(currentWeek.weekStart, -(historyWeekCount - index) * 7, {
        rolloverHour: appSettings.logicalDayRolloverHour,
      })
    )
  );
  const weekIdentities = [...allHistoricalWeeks, currentWeek];
  const recentHistoricalWeeks = allHistoricalWeeks.slice(-goalSettings.historicalCircleCount);
  const oldestWeek = allHistoricalWeeks[0] ?? currentWeek;
  const [habitStates, trackerQuery, storedWeeks] = await Promise.all([
    runtime.habitService.readStates(oldestWeek.weekStart, currentWeek.weekEnd),
    runtime.trackerService.query({ startMs: oldestWeek.startMs, endMs: currentWeek.endMs }, nowMs),
    Promise.all(weekIdentities.map((week) => runtime.goalService.readWeek(week.weekStart))),
  ]);
  const sourceData = {
    habits,
    habitStates,
    intervals: trackerQuery.intervals,
    activityIds: [...catalog.activities, ...catalog.routines].map((item) => item.id),
  };
  const snapshots = weekIdentities.map((week, index) => {
    const stored = storedWeeks[index];
    const evaluations = new Map<string, GoalEvaluation>();
    for (const goal of goals) {
      if (goal.startWeek && week.weekStart < goal.startWeek) continue;
      evaluations.set(
        goal.id,
        evaluateGoal(goal, week, sourceData, {
          now: nowMs,
          rolloverHour: appSettings.logicalDayRolloverHour,
          weekStartsOn: appSettings.weekStartsOn,
        })
      );
    }
    return {
      week,
      statuses: new Map(stored?.statuses.map((status) => [status.goalId, status]) ?? []),
      evaluations,
    };
  });
  return {
    runtime,
    appSettings,
    goalSettings,
    goals,
    habits,
    catalog,
    currentWeek,
    historicalWeeks: snapshots.slice(-recentHistoricalWeeks.length - 1, -1),
    reviewWeeks: snapshots.slice(0, -1),
    currentSnapshot: snapshots.at(-1) ?? {
      week: currentWeek,
      statuses: new Map(),
      evaluations: new Map(),
    },
  };
}

export default function GoalsScreen() {
  const focused = useIsFocused();
  const router = useRouter();
  const { colors } = useAppTheme();
  const [resource, setResource] = useState<GoalsPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<GoalOverallStatusFilter>('in-progress');
  const [editMode, setEditMode] = useState(false);
  const [reordering, setReordering] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setResource(await loadGoalsPage());
    } catch (loadFailure) {
      setLoadError(errorText(loadFailure));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (focused) void Promise.resolve().then(load);
  }, [focused, load]);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.addEventListener !== 'function' ||
      typeof window.removeEventListener !== 'function'
    ) {
      return;
    }
    const onSynchronizedData = () => {
      if (focused) void load();
    };
    window.addEventListener('tulona:dropbox-sync', onSynchronizedData);
    return () => window.removeEventListener('tulona:dropbox-sync', onSynchronizedData);
  }, [focused, load]);

  const visibleGoals = useMemo(
    () => resource?.goals.filter((goal) => filter === 'all' || goal.overallStatus === filter) ?? [],
    [filter, resource]
  );

  const reorderGoal = async (goalId: string, direction: 'up' | 'down') => {
    if (!resource || reordering) return;
    const index = resource.goals.findIndex((goal) => goal.id === goalId);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= resource.goals.length) return;
    const ids = resource.goals.map((goal) => goal.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(target, 0, moved);
    setReordering(true);
    setLoadError(null);
    try {
      await resource.runtime.goalService.reorderGoals(ids);
      await load();
    } catch (reorderError) {
      setLoadError(errorText(reorderError));
    } finally {
      setReordering(false);
    }
  };

  const header = (
    <>
      <PageFilterMenu
        accessibilityLabel="Choose goal view"
        onChange={setFilter}
        options={OVERALL_STATUS_OPTIONS}
        testID="goal-view-menu"
        value={filter}
      />
      <CatalogIconButton
        disabled={!resource || reordering}
        icon={editMode ? 'check' : 'pencil'}
        label={editMode ? 'Done' : 'Edit'}
        onPress={() => setEditMode((open) => !open)}
        testID="goal-edit-mode"
      />
      <IconButton
        disabled={!resource}
        icon="plus"
        label="Create goal"
        onPress={() => router.push('/goal-edit/new' as Href)}
        testID="goal-create"
        variant="primary"
      />
    </>
  );

  return (
    <Screen headerRight={header} testID="goals-screen" title="Goals">
      <Column spacing={16} style={{ width: '100%' }}>
        {loading && !resource ? (
          <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>Loading goals...</Text>
        ) : null}
        {loadError ? (
          <Column spacing={10} style={{ width: '100%' }} testID="goals-load-error">
            <Text textStyle={{ color: colors.danger.foreground, fontSize: 15 }}>{loadError}</Text>
            <AppButton label="Retry" onPress={() => void load()} testID="goals-retry" />
          </Column>
        ) : null}
        {resource ? (
          <>
            <Column spacing={3} style={{ width: '100%' }} testID="goal-current-week-range">
              <Text textStyle={{ color: colors.text, fontSize: 19, fontWeight: '700' }}>
                {formatWeek(resource.currentWeek)}
              </Text>
            </Column>
            <PageFilterMenuSelection
              defaultValue="in-progress"
              onChange={setFilter}
              options={OVERALL_STATUS_OPTIONS}
              testID="goal-view-menu"
              value={filter}
            />
            {visibleGoals.length === 0 ? (
              <EmptyState
                iconName="award"
                testID="goals-empty"
                title={filter === 'in-progress' ? 'No goals yet' : 'No matching goals'}
              />
            ) : (
              <Column spacing={10} style={{ width: '100%' }} testID="goal-list">
                {visibleGoals.map((goal) => (
                  <GoalRow
                    catalog={resource.catalog}
                    currentSnapshot={resource.currentSnapshot}
                    goal={goal}
                    habits={resource.habits}
                    historicalWeeks={resource.historicalWeeks}
                    key={goal.id}
                    editMode={editMode}
                    disabled={reordering}
                    onEdit={() => router.push(`/goal-edit/${goal.id}` as Href)}
                    onMoveDown={() => void reorderGoal(goal.id, 'down')}
                    onMoveUp={() => void reorderGoal(goal.id, 'up')}
                    onReview={() => router.push(`/goal-review/${goal.id}` as Href)}
                    settings={resource.goalSettings}
                  />
                ))}
              </Column>
            )}
          </>
        ) : null}
      </Column>
    </Screen>
  );
}
