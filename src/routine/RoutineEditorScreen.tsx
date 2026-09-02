import { Column, Picker, Row, Text } from '@expo/ui';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import type {
  Activity,
  CatalogCollection,
  Folder,
  RoutineDefinition,
  RoutineStep,
  RoutineStepEndBehavior,
  RoutineTrackingMode,
  UUID,
} from '@domain';
import { createId } from '@domain';
import { AppIcon } from '@icons';
import { useAppTheme } from '@theme';
import {
  AccessiblePicker,
  AccessibleTextInput,
  AppButton,
  ColorPicker,
  DurationPicker,
  errorText,
  IconPicker,
  Screen,
} from '@ui';
import { RecoveryActions } from '../orchestration/RecoveryActions';

import type { CatalogService, CreateRoutineStepInput } from '../catalog/catalog-service';
import { loadRoutineRuntime } from './routine-runtime';

const ROOT_VALUE = '__root__';
const NEW_ID = 'new';
const DEFAULT_STEP_BEHAVIOR: RoutineStepEndBehavior = 'overtime';

interface EditorResource {
  service: CatalogService;
  catalog: CatalogCollection;
  routine: RoutineDefinition | null;
}

interface StepDraft {
  id?: UUID;
  activityId: string;
  title: string;
  iconName: string;
  hours: string;
  minutes: string;
  seconds: string;
  endBehavior: RoutineStepEndBehavior;
  notes: string;
}

type EditableStep = Pick<
  RoutineStep,
  'id' | 'activityId' | 'name' | 'durationMs' | 'iconName' | 'endBehavior' | 'notes'
>;

export interface RoutineEditorScreenProps {
  id: string;
  initialFolderId?: UUID | null;
}

function durationParts(durationMs: number): Pick<StepDraft, 'hours' | 'minutes' | 'seconds'> {
  const totalSeconds = Math.floor(durationMs / 1000);
  return {
    hours: String(Math.floor(totalSeconds / 3600)),
    minutes: String(Math.floor((totalSeconds % 3600) / 60)),
    seconds: String(totalSeconds % 60),
  };
}

function draftFromStep(step: EditableStep): StepDraft {
  return {
    id: step.id,
    activityId: step.activityId ?? '',
    title: step.name ?? '',
    iconName: step.iconName ?? '',
    ...durationParts(step.durationMs),
    endBehavior:
      step.endBehavior === 'autoAdvance'
        ? 'auto-advance'
        : (step.endBehavior ?? DEFAULT_STEP_BEHAVIOR),
    notes: step.notes ?? '',
  };
}

function emptyDraft(activities: readonly Activity[], trackingMode: RoutineTrackingMode): StepDraft {
  return {
    activityId: trackingMode === 'steps' ? (activities[0]?.id ?? '') : '',
    title: '',
    iconName: '',
    hours: '0',
    minutes: '5',
    seconds: '0',
    endBehavior: DEFAULT_STEP_BEHAVIOR,
    notes: '',
  };
}

function durationFromDraft(draft: StepDraft): number {
  const hours = Number(draft.hours || 0);
  const minutes = Number(draft.minutes || 0);
  const seconds = Number(draft.seconds || 0);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    !Number.isInteger(seconds) ||
    hours < 0 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    throw new RangeError('Hours must be non-negative; minutes and seconds must be 0 through 59');
  }
  const durationMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
  if (durationMs <= 0) throw new RangeError('A step needs at least one second');
  return durationMs;
}

function inputFromDraft(
  draft: StepDraft,
  trackingMode: RoutineTrackingMode
): CreateRoutineStepInput {
  if (trackingMode === 'steps' && !draft.activityId) {
    throw new Error('Choose an activity for this step');
  }
  return {
    ...(draft.id ? { id: draft.id } : {}),
    activityId: trackingMode === 'steps' ? (draft.activityId as UUID) : null,
    name: draft.title.trim() || null,
    durationMs: durationFromDraft(draft),
    endBehavior: draft.endBehavior,
    notes: draft.notes.trim() || null,
    iconName: draft.iconName.trim() || null,
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
  width,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  testID: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric';
  width?: number | '100%';
}) {
  const { colors } = useAppTheme();
  return (
    <AccessibleTextInput
      defaultValue={value}
      label={label}
      onChangeText={onChangeText}
      placeholder={placeholder}
      keyboardType={keyboardType}
      multiline={multiline}
      numberOfLines={multiline ? 3 : undefined}
      testID={testID}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 10,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 10,
        width: width ?? '100%',
      }}
      placeholderTextColor={colors.textMuted}
      returnKeyType={multiline ? 'default' : 'next'}
      textStyle={{ color: colors.text, fontSize: 16 }}
    />
  );
}

function ErrorMessage({
  message,
  onRetry,
  onBack,
}: {
  message: string | null;
  onRetry?: () => void;
  onBack?: () => void;
}) {
  const { colors } = useAppTheme();
  if (!message) return null;
  return (
    <Column
      spacing={4}
      style={{
        backgroundColor: colors.danger.background,
        borderColor: colors.danger.foreground,
        borderRadius: 12,
        borderWidth: 1,
        padding: 14,
        width: '100%',
      }}
    >
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 14, fontWeight: '700' }}>
        Routine action failed
      </Text>
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{message}</Text>
      <RecoveryActions onBack={onBack} onRetry={onRetry} testID="routine-editor-recovery" />
    </Column>
  );
}

function FolderPicker({
  folders,
  currentFolderId,
  value,
  onChange,
}: {
  folders: readonly Folder[];
  currentFolderId: UUID | null;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <AccessiblePicker
      label="Parent folder"
      selectedValue={value}
      onValueChange={onChange}
      testID="routine-folder-picker"
    >
      <Picker.Item label="Root" value={ROOT_VALUE} />
      {folders
        .filter((folder) => folder.archivedAt === null || folder.id === currentFolderId)
        .map((folder) => (
          <Picker.Item
            key={folder.id}
            label={folder.archivedAt ? `${folder.name} (archived)` : folder.name}
            value={folder.id}
          />
        ))}
    </AccessiblePicker>
  );
}

function StepForm({
  draft,
  activities,
  trackingMode,
  onChange,
  onSave,
  onCancel,
  busy,
  error,
  onRetry,
}: {
  draft: StepDraft;
  activities: readonly Activity[];
  trackingMode: RoutineTrackingMode;
  onChange: (draft: StepDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
  onRetry?: () => void;
}) {
  const { colors } = useAppTheme();
  const availableActivities = activities.filter(
    (activity) => activity.archivedAt === null || activity.id === draft.activityId
  );
  const update = (changes: Partial<StepDraft>) => onChange({ ...draft, ...changes });
  return (
    <Column
      spacing={14}
      style={{
        backgroundColor: colors.surfaceMuted,
        borderColor: colors.primary,
        borderRadius: 14,
        borderWidth: 1,
        padding: 14,
        width: '100%',
      }}
      testID={draft.id ? `step-form-${draft.id}` : 'new-step-form'}
    >
      <Text textStyle={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>
        {draft.id ? 'Edit step' : 'Add step'}
      </Text>
      <Field label="Step title">
        <Input
          label="Step title"
          value={draft.title}
          onChangeText={(title) => update({ title })}
          placeholder="What will you do?"
          testID="step-title"
        />
      </Field>
      {trackingMode === 'steps' ? (
        <Field label="Activity tracked by this step">
          <AccessiblePicker
            label="Activity tracked by this step"
            selectedValue={draft.activityId}
            onValueChange={(activityId) => update({ activityId })}
            testID="step-activity-picker"
          >
            <Picker.Item label="Choose an activity" value="" />
            {availableActivities.map((activity) => (
              <Picker.Item
                key={activity.id}
                label={activity.archivedAt ? `${activity.name} (archived)` : activity.name}
                value={activity.id}
              />
            ))}
          </AccessiblePicker>
        </Field>
      ) : (
        <Text textStyle={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
          This routine tracks continuously. Each step is part of the same routine activity.
        </Text>
      )}
      <Field label="Step icon">
        <IconPicker
          value={draft.iconName || null}
          onChange={(iconName) => update({ iconName: iconName ?? '' })}
          testID="step-icon-picker"
        />
      </Field>
      <Field label="Duration">
        <DurationPicker
          hours={Number(draft.hours) || 0}
          minutes={Number(draft.minutes) || 0}
          onChange={({ hours, minutes, seconds }) =>
            update({ hours: String(hours), minutes: String(minutes), seconds: String(seconds) })
          }
          seconds={Number(draft.seconds) || 0}
          testID="step-duration"
        />
      </Field>
      <Field label="When time expires">
        <AccessiblePicker
          label="When time expires"
          selectedValue={draft.endBehavior}
          onValueChange={(endBehavior) =>
            update({ endBehavior: endBehavior as RoutineStepEndBehavior })
          }
          testID="step-end-behavior"
        >
          <Picker.Item label="Keep running into overtime" value="overtime" />
          <Picker.Item label="Auto-advance to the next step" value="auto-advance" />
        </AccessiblePicker>
      </Field>
      <Field label="Notes">
        <Input
          label="Step notes"
          value={draft.notes}
          onChangeText={(notes) => update({ notes })}
          placeholder="Optional step notes"
          testID="step-notes"
          multiline
        />
      </Field>
      <ErrorMessage message={error} onBack={onCancel} onRetry={onRetry} />
      <Column spacing={8} style={{ width: '100%' }}>
        <AppButton
          disabled={busy}
          label={busy ? 'Saving...' : 'Save step'}
          onPress={onSave}
          style={{ height: 50, width: '100%' }}
          testID="save-step"
        />
        <AppButton
          disabled={busy}
          label="Cancel"
          onPress={onCancel}
          style={{ height: 48, width: '100%' }}
          variant="outlined"
          testID="cancel-step"
        />
      </Column>
    </Column>
  );
}

function StepRow({
  step,
  index,
  count,
  onEdit,
  onDuplicate,
  onDelete,
  onMove,
  busy,
}: {
  step: EditableStep;
  index: number;
  count: number;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (direction: 'up' | 'down') => void;
  busy: boolean;
}) {
  const { colors } = useAppTheme();
  const duration = durationParts(step.durationMs);
  const durationText = `${duration.hours}h ${duration.minutes}m ${duration.seconds}s`;
  return (
    <Column
      spacing={10}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 14,
        borderWidth: 1,
        padding: 14,
        width: '100%',
      }}
      testID={`routine-step-${step.id}`}
    >
      <Row alignment="center" spacing={12} style={{ width: '100%' }}>
        <AppIcon
          accessibilityLabel={`Icon for step ${index + 1}`}
          name={step.iconName || 'timer'}
          color={colors.primary}
          size={25}
        />
        <Column spacing={3}>
          <Text textStyle={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>
            {`${index + 1}. ${step.name || 'Untitled step'}`}
          </Text>
          <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
            {`${durationText} · ${step.endBehavior === 'auto-advance' || step.endBehavior === 'autoAdvance' ? 'Auto-advance' : 'Overtime'}`}
          </Text>
        </Column>
      </Row>
      {step.notes ? (
        <Text textStyle={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
          {step.notes}
        </Text>
      ) : null}
      <Column spacing={8} style={{ width: '100%' }}>
        <AppButton
          disabled={busy}
          label="Edit"
          onPress={onEdit}
          style={{ height: 48, width: '100%' }}
          testID={`edit-step-${step.id}`}
        />
        <AppButton
          disabled={busy}
          label="Duplicate"
          onPress={onDuplicate}
          style={{ height: 48, width: '100%' }}
          variant="outlined"
          testID={`duplicate-step-${step.id}`}
        />
        <AppButton
          disabled={busy}
          label="Delete"
          onPress={onDelete}
          style={{ height: 48, width: '100%' }}
          variant="outlined"
          testID={`delete-step-${step.id}`}
        />
      </Column>
      <Column spacing={8} style={{ width: '100%' }}>
        <AppButton
          disabled={busy || index === 0}
          label="Move Up"
          onPress={() => onMove('up')}
          style={{ height: 48, width: '100%' }}
          variant="outlined"
          testID={`move-step-up-${step.id}`}
        />
        <AppButton
          disabled={busy || index === count - 1}
          label="Move Down"
          onPress={() => onMove('down')}
          style={{ height: 48, width: '100%' }}
          variant="outlined"
          testID={`move-step-down-${step.id}`}
        />
      </Column>
    </Column>
  );
}

function DeleteStepConfirmation({
  busy,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { colors } = useAppTheme();
  return (
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
      testID="delete-step-confirmation"
    >
      <Text textStyle={{ color: colors.warning.foreground, fontSize: 15, fontWeight: '700' }}>
        Delete this step?
      </Text>
      <Text textStyle={{ color: colors.warning.foreground, fontSize: 14, lineHeight: 20 }}>
        This removes the step from the routine. Confirm only if you want to discard its settings.
      </Text>
      <Column spacing={8} style={{ width: '100%' }}>
        <AppButton
          disabled={busy}
          label="Yes, delete step"
          onPress={onConfirm}
          style={{ height: 48, width: '100%' }}
          testID="confirm-delete-step"
        />
        <AppButton
          disabled={busy}
          label="Keep step"
          onPress={onCancel}
          style={{ height: 48, width: '100%' }}
          variant="outlined"
        />
      </Column>
    </Column>
  );
}

export function RoutineEditorScreen({ id, initialFolderId = null }: RoutineEditorScreenProps) {
  const router = useRouter();
  const [resource, setResource] = useState<EditorResource | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void loadRoutineRuntime()
      .then(async (runtime) => {
        const catalog = await runtime.catalogService.read();
        const routine = id === NEW_ID ? null : await runtime.catalogService.getRoutine(id as UUID);
        return { service: runtime.catalogService, catalog, routine };
      })
      .then((next) => {
        if (!cancelled) {
          setResource(next);
          setLoadError(null);
        }
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
      <Screen onBack={() => router.back()} title={id === NEW_ID ? 'New routine' : 'Routine editor'}>
        <ErrorMessage
          message={loadError ?? 'Loading routine editor...'}
          onRetry={() => {
            setLoadError(null);
            setVersion((current) => current + 1);
          }}
          onBack={() => router.back()}
        />
      </Screen>
    );
  }
  const runRoutine = async (routineId: UUID) => {
    const runtime = await loadRoutineRuntime();
    await runtime.routineService.startRoutine(routineId);
    router.push(`/routine/${routineId}`);
  };
  const refresh = () => {
    setResource(null);
    setVersion((current) => current + 1);
  };
  return (
    <RoutineEditorForm
      key={`${id}-${version}`}
      initialFolderId={initialFolderId}
      onBack={() => router.back()}
      resource={resource}
      onCancel={() => router.back()}
      onChanged={refresh}
      onCreated={(routineId) => router.replace(`/routine-edit/${routineId}`)}
      onRun={runRoutine}
    />
  );
}

function RoutineEditorForm({
  resource,
  initialFolderId,
  onBack,
  onCancel,
  onChanged,
  onCreated,
  onRun,
}: {
  resource: EditorResource;
  initialFolderId: UUID | null;
  onBack: () => void;
  onCancel: () => void;
  onChanged: () => void;
  onCreated: (routineId: UUID) => void;
  onRun: (routineId: UUID) => Promise<void>;
}) {
  const { colors } = useAppTheme();
  const { service, catalog, routine } = resource;
  const [name, setName] = useState(routine?.name ?? '');
  const [color, setColor] = useState(routine?.color ?? '');
  const [iconName, setIconName] = useState(routine?.iconName ?? '');
  const [trackingMode, setTrackingMode] = useState<RoutineTrackingMode | ''>(
    routine?.trackingMode ?? ''
  );
  const [folderId, setFolderId] = useState(routine?.folderId ?? initialFolderId ?? ROOT_VALUE);
  const [newSteps, setNewSteps] = useState<StepDraft[]>([]);
  const [editingStepId, setEditingStepId] = useState<UUID | null>(null);
  const [draft, setDraft] = useState<StepDraft | null>(null);
  const [deleteStepId, setDeleteStepId] = useState<UUID | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastAction = useRef<(() => Promise<void>) | null>(null);
  const activities = catalog.activities;

  const run = async (action: () => Promise<void>) => {
    lastAction.current = action;
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (actionError) {
      setError(errorText(actionError));
    } finally {
      setBusy(false);
    }
  };

  const saveRoutine = async () => {
    lastAction.current = saveRoutine;
    setBusy(true);
    setError(null);
    try {
      if (!trackingMode) throw new Error('Choose how this routine should track time');
      const selectedFolderId = folderId === ROOT_VALUE ? null : (folderId as UUID);
      if (routine) {
        await service.updateRoutine(routine.id, {
          name,
          color: color.trim() || null,
          iconName: iconName.trim() || null,
          folderId: selectedFolderId,
        });
        onChanged();
      } else {
        const created = await service.createRoutine({
          name,
          color: color.trim() || null,
          iconName: iconName.trim() || null,
          folderId: selectedFolderId,
          trackingMode,
          steps: newSteps.map((step) => inputFromDraft(step, trackingMode)),
        });
        onCreated(created.id);
      }
    } catch (actionError) {
      setError(errorText(actionError));
    } finally {
      setBusy(false);
    }
  };

  const saveStep = async () => {
    if (!draft) return;
    try {
      if (!trackingMode) throw new Error('Choose how this routine should track time first');
      const input = inputFromDraft(draft, trackingMode);
      if (routine && draft.id) {
        await run(async () => {
          await service.updateRoutineStep(routine.id, draft.id as UUID, input);
        });
        setDraft(null);
        setEditingStepId(null);
      } else if (routine) {
        await run(async () => {
          await service.createRoutineStep(routine.id, input);
        });
        setDraft(null);
      } else {
        setNewSteps((steps) => {
          const savedDraft = { ...draft, id: draft.id ?? createId() };
          const existingIndex = savedDraft.id
            ? steps.findIndex((candidate) => candidate.id === savedDraft.id)
            : -1;
          if (existingIndex < 0) return [...steps, savedDraft];
          return steps.map((candidate, index) =>
            index === existingIndex ? savedDraft : candidate
          );
        });
        setDraft(null);
      }
    } catch (actionError) {
      setError(errorText(actionError));
    }
  };

  const startRoutine = async () => {
    if (!routine) return;
    lastAction.current = startRoutine;
    setBusy(true);
    setError(null);
    try {
      await onRun(routine.id);
    } catch (actionError) {
      setError(errorText(actionError));
    } finally {
      setBusy(false);
    }
  };

  const startAdd = () => {
    setError(null);
    if (!trackingMode) {
      setError('Choose how this routine should track time before adding steps');
      return;
    }
    setDraft(emptyDraft(activities, trackingMode));
    setEditingStepId(null);
  };

  const steps = routine
    ? [...routine.steps].sort((left, right) => left.sortOrder - right.sortOrder)
    : newSteps.map((step, index) => ({
        id: step.id ?? createId(),
        activityId: trackingMode === 'steps' ? (step.activityId as UUID) : null,
        name: step.title || null,
        durationMs: (() => {
          try {
            return durationFromDraft(step);
          } catch {
            return 0;
          }
        })(),
        sortOrder: index,
        iconName: step.iconName || null,
        endBehavior: step.endBehavior,
        notes: step.notes || null,
      }));

  return (
    <Screen
      onBack={onBack}
      title={routine ? 'Edit routine' : 'New routine'}
      description={
        trackingMode === 'steps'
          ? 'Build an ordered sequence with one tracked activity per step.'
          : trackingMode === 'overall'
            ? 'Build an ordered sequence that runs as one continuous activity.'
            : 'Choose how time should be tracked, then add steps.'
      }
    >
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
          <AppIcon name={iconName || 'repeat'} color={color || colors.primary} size={30} />
          <Column spacing={3} style={{ width: '100%' }}>
            <Text textStyle={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>
              {name || 'Untitled routine'}
            </Text>
            <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
              {`${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`}
            </Text>
          </Column>
        </Row>
        <Field label="Routine name">
          <Input
            label="Routine name"
            value={name}
            onChangeText={setName}
            placeholder="Routine name"
            testID="routine-name"
          />
        </Field>
        <Field label="Track time by">
          <AccessiblePicker
            enabled={!routine && newSteps.length === 0 && draft === null}
            label="Track time by"
            selectedValue={trackingMode}
            onValueChange={(value) => setTrackingMode(value as RoutineTrackingMode)}
            testID="routine-tracking-mode"
          >
            <Picker.Item label="Choose a tracking mode" value="" />
            <Picker.Item label="Entire routine" value="overall" />
            <Picker.Item label="Each step" value="steps" />
          </AccessiblePicker>
          <Text textStyle={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
            {trackingMode === 'steps'
              ? 'Switch to each step activity as the routine progresses.'
              : trackingMode === 'overall'
                ? 'Keep one continuous activity for the entire routine.'
                : 'Choose one mode before adding steps.'}
          </Text>
        </Field>
        <Field label="Standalone color">
          <ColorPicker
            onChange={(next) => setColor(next ?? '')}
            testID="routine-color"
            value={color || null}
          />
        </Field>
        <Field label="Routine icon">
          <IconPicker
            value={iconName || null}
            onChange={(next) => setIconName(next ?? '')}
            testID="routine-icon-picker"
          />
        </Field>
        <Field label="Root or folder placement">
          <FolderPicker
            folders={catalog.folders}
            currentFolderId={routine?.folderId ?? null}
            value={folderId}
            onChange={setFolderId}
          />
        </Field>
        <ErrorMessage
          message={error}
          onBack={onCancel}
          onRetry={() => {
            if (lastAction.current) void lastAction.current();
          }}
        />
        <AppButton
          disabled={busy || (!routine && !trackingMode)}
          label={busy ? 'Saving...' : routine ? 'Save routine' : 'Create routine'}
          onPress={() => void saveRoutine()}
          style={{ height: 52, width: '100%' }}
          testID="save-routine"
        />
      </Column>

      <Column spacing={12} style={{ width: '100%' }}>
        <Column spacing={10} style={{ width: '100%' }}>
          <Text textStyle={{ color: colors.text, fontSize: 21, fontWeight: '700' }}>Steps</Text>
          <AppButton
            disabled={busy || draft !== null || !trackingMode}
            label="Add step"
            onPress={startAdd}
            style={{ height: 50, width: '100%' }}
            testID="add-routine-step"
          />
          {!trackingMode ? (
            <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
              Choose a tracking mode to start building steps.
            </Text>
          ) : null}
        </Column>
        {draft && !editingStepId ? (
          <StepForm
            draft={draft}
            activities={activities}
            trackingMode={trackingMode as RoutineTrackingMode}
            onChange={setDraft}
            onSave={() => void saveStep()}
            onCancel={() => setDraft(null)}
            busy={busy}
            error={error}
            onRetry={() => {
              const action = lastAction.current;
              if (action) void run(action);
            }}
          />
        ) : null}
        {steps.map((step, index) => (
          <Column key={step.id} spacing={8} style={{ width: '100%' }}>
            {editingStepId === step.id && draft ? (
              <StepForm
                draft={draft}
                activities={activities}
                trackingMode={trackingMode as RoutineTrackingMode}
                onChange={setDraft}
                onSave={() => void saveStep()}
                onCancel={() => {
                  setDraft(null);
                  setEditingStepId(null);
                }}
                busy={busy}
                error={error}
                onRetry={() => {
                  const action = lastAction.current;
                  if (action) void run(action);
                }}
              />
            ) : (
              <StepRow
                step={step}
                index={index}
                count={steps.length}
                busy={busy}
                onEdit={() => {
                  setError(null);
                  setEditingStepId(step.id);
                  setDraft(draftFromStep(step));
                }}
                onDuplicate={() =>
                  routine
                    ? void run(async () => {
                        await service.duplicateRoutineStep(routine.id, step.id);
                      })
                    : setNewSteps((current) => [
                        ...current,
                        {
                          ...draftFromStep(step),
                          id: createId(),
                          title: `${step.name ?? ''} copy`,
                        },
                      ])
                }
                onDelete={() => setDeleteStepId(step.id)}
                onMove={(direction) =>
                  routine
                    ? void run(async () => {
                        await service.reorderRoutineStep(routine.id, step.id, direction);
                      })
                    : setNewSteps((current) => {
                        const from = index;
                        const to = direction === 'up' ? from - 1 : from + 1;
                        if (to < 0 || to >= current.length) return current;
                        const next = [...current];
                        const [moved] = next.splice(from, 1);
                        if (moved) next.splice(to, 0, moved);
                        return next;
                      })
                }
              />
            )}
            {deleteStepId === step.id ? (
              <DeleteStepConfirmation
                busy={busy}
                onCancel={() => setDeleteStepId(null)}
                onConfirm={() => {
                  if (routine) {
                    void run(async () => {
                      await service.deleteRoutineStep(routine.id, step.id);
                      setDeleteStepId(null);
                    });
                  } else {
                    setNewSteps((current) =>
                      current.filter((candidate) => candidate.id !== step.id)
                    );
                    setDeleteStepId(null);
                  }
                }}
              />
            ) : null}
          </Column>
        ))}
        {steps.length === 0 ? (
          <Column
            spacing={6}
            style={{
              backgroundColor: colors.surfaceMuted,
              borderColor: colors.border,
              borderRadius: 14,
              borderWidth: 1,
              padding: 16,
              width: '100%',
            }}
          >
            <Text textStyle={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>
              No steps yet
            </Text>
            <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
              Add at least one step before starting this routine.
            </Text>
          </Column>
        ) : null}
      </Column>
      {routine ? (
        <Column spacing={10} style={{ width: '100%' }}>
          <AppButton
            disabled={busy || routine.steps.length === 0}
            label="Run routine"
            onPress={() => void startRoutine()}
            style={{ height: 54, width: '100%' }}
            testID="run-routine"
          />
          <AppButton
            disabled={busy || routine.archivedAt !== null}
            label="Move routine up"
            onPress={() => void run(async () => void (await service.reorderItem(routine.id, 'up')))}
            style={{ height: 48, width: '100%' }}
            variant="outlined"
          />
          <AppButton
            disabled={busy || routine.archivedAt !== null}
            label="Move routine down"
            onPress={() =>
              void run(async () => void (await service.reorderItem(routine.id, 'down')))
            }
            style={{ height: 48, width: '100%' }}
            variant="outlined"
          />
        </Column>
      ) : null}
    </Screen>
  );
}
