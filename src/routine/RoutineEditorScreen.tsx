import { Picker } from '@expo/ui';
import { Column, Text } from '@ui/primitives';
import { useRouter } from 'expo-router';
import { Fragment, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

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
import { useAppTheme } from '@theme';
import {
  confirmAction,
  DurationPicker,
  errorText,
  Form,
  FormColorRow,
  FormContent,
  FormIconRow,
  FormPickerRow,
  FormRow,
  FormSection,
  FormSheet,
  FormSwitchRow,
  FormTextField,
  HeaderTextButton,
  IconButton,
  Screen,
} from '@ui';
import { RecoveryActions } from '../orchestration/RecoveryActions';
import { goBackInAppStack } from '../navigation/app-back';

import {
  inheritRoutineStepMetadata,
  resolveDisplayColor,
  type CatalogService,
  type CreateRoutineStepInput,
} from '../catalog/catalog-service';
import { loadRoutineRuntime } from './routine-runtime';
import { chooseRoutineStartConflict, type RoutineConflictChoice } from './routine-start-conflict';

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
  enabled: boolean;
  endBehavior: RoutineStepEndBehavior;
  notes: string;
}

type EditableStep = Pick<
  RoutineStep,
  | 'id'
  | 'activityId'
  | 'name'
  | 'durationMs'
  | 'color'
  | 'iconName'
  | 'enabled'
  | 'endBehavior'
  | 'notes'
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
    enabled: step.enabled !== false,
    endBehavior:
      step.endBehavior === 'autoAdvance'
        ? 'auto-advance'
        : (step.endBehavior ?? DEFAULT_STEP_BEHAVIOR),
    notes: step.notes ?? '',
  };
}

function emptyDraft(activities: readonly Activity[], trackingMode: RoutineTrackingMode): StepDraft {
  const firstActivity = activities.find((activity) => activity.archivedAt === null);
  return {
    activityId: trackingMode === 'steps' ? (firstActivity?.id ?? '') : '',
    title: '',
    iconName: '',
    hours: '0',
    minutes: '5',
    seconds: '0',
    enabled: true,
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
  const input: CreateRoutineStepInput = {
    ...(draft.id ? { id: draft.id } : {}),
    activityId: trackingMode === 'steps' ? (draft.activityId as UUID) : null,
    enabled: draft.enabled,
    durationMs: durationFromDraft(draft),
    endBehavior: draft.endBehavior,
    notes: draft.notes.trim() || null,
  };
  if (trackingMode === 'overall') {
    input.name = draft.title.trim() || null;
    input.iconName = draft.iconName.trim() || null;
  }
  return input;
}

function ErrorMessage({
  message,
  onRetry,
  onClose,
}: {
  message: string | null;
  onRetry?: () => void;
  onClose?: () => void;
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
      <RecoveryActions onClose={onClose} onRetry={onRetry} testID="routine-editor-recovery" />
    </Column>
  );
}

function formatStepDuration(durationMs: number): string {
  const { hours, minutes, seconds } = durationParts(durationMs);
  const parts = [
    Number(hours) > 0 ? `${hours} hr` : null,
    Number(minutes) > 0 ? `${minutes} min` : null,
    Number(seconds) > 0 ? `${seconds} sec` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : '0 sec';
}

function isAutoAdvance(endBehavior: EditableStep['endBehavior']): boolean {
  return endBehavior === 'auto-advance' || endBehavior === 'autoAdvance';
}

function StepSheet({
  draft,
  isExisting,
  activities,
  folders,
  trackingMode,
  onChange,
  onSave,
  onCancel,
  onDuplicate,
  onDelete,
  busy,
  error,
  onRetry,
  onCloseError,
}: {
  draft: StepDraft | null;
  isExisting: boolean;
  activities: readonly Activity[];
  folders: readonly Folder[];
  trackingMode: RoutineTrackingMode;
  onChange: (draft: StepDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  busy: boolean;
  error: string | null;
  onRetry?: () => void;
  onCloseError: () => void;
}) {
  const { colors } = useAppTheme();
  const current = draft ?? emptyDraft(activities, trackingMode);
  const update = (changes: Partial<StepDraft>) => onChange({ ...current, ...changes });
  const availableActivities = activities.filter(
    (activity) => activity.archivedAt === null || activity.id === current.activityId
  );
  const selectedActivity = activities.find((activity) => activity.id === current.activityId);
  return (
    <FormSheet
      confirmDisabled={busy}
      confirmLabel={isExisting ? 'Save' : 'Add'}
      onClose={onCancel}
      onConfirm={onSave}
      testID={isExisting ? `step-form-${current.id}` : 'new-step-form'}
      title={isExisting ? 'Edit Step' : 'New Step'}
      visible={draft !== null}
    >
      <ErrorMessage message={error} onClose={onCloseError} onRetry={onRetry} />
      {trackingMode === 'steps' ? (
        <FormSection footer="Time spent on this step is logged to this activity.">
          <FormPickerRow
            icon={selectedActivity?.iconName || 'activity'}
            iconColor={
              selectedActivity
                ? resolveDisplayColor(selectedActivity, folders, colors.primary)
                : colors.textMuted
            }
            label="Activity"
            onValueChange={(activityId) => update({ activityId })}
            selectedValue={current.activityId}
            testID="step-activity-picker"
          >
            <Picker.Item label="Choose" value="" />
            {availableActivities.map((activity) => (
              <Picker.Item
                key={activity.id}
                label={activity.archivedAt ? `${activity.name} (archived)` : activity.name}
                value={activity.id}
              />
            ))}
          </FormPickerRow>
        </FormSection>
      ) : (
        <FormSection>
          <FormTextField
            label="Step title"
            onChangeText={(title) => update({ title })}
            placeholder="Title"
            testID="step-title"
            value={current.title}
          />
          <FormIconRow
            onChange={(iconName) => update({ iconName: iconName ?? '' })}
            testID="step-icon-picker"
            value={current.iconName || null}
          />
        </FormSection>
      )}
      <FormSection title="Duration">
        <FormContent>
          <DurationPicker
            hours={Number(current.hours) || 0}
            minutes={Number(current.minutes) || 0}
            onChange={({ hours, minutes, seconds }) =>
              update({ hours: String(hours), minutes: String(minutes), seconds: String(seconds) })
            }
            seconds={Number(current.seconds) || 0}
            testID="step-duration"
          />
        </FormContent>
      </FormSection>
      <FormSection
        footer={
          current.endBehavior === 'auto-advance'
            ? 'The next step starts as soon as this one runs out.'
            : 'The timer keeps counting into overtime until you move on.'
        }
      >
        <FormPickerRow
          label="When time is up"
          onValueChange={(endBehavior) =>
            update({ endBehavior: endBehavior as RoutineStepEndBehavior })
          }
          selectedValue={current.endBehavior}
          testID="step-end-behavior"
        >
          <Picker.Item label="Keep going" value="overtime" />
          <Picker.Item label="Next step" value="auto-advance" />
        </FormPickerRow>
        <FormSwitchRow
          label="Include in routine"
          onValueChange={(enabled) => update({ enabled })}
          testID="step-enabled"
          value={current.enabled}
        />
      </FormSection>
      <FormSection title="Notes">
        <FormTextField
          label="Step notes"
          multiline
          onChangeText={(notes) => update({ notes })}
          placeholder="Shown while this step runs"
          testID="step-notes"
          value={current.notes}
        />
      </FormSection>
      {isExisting ? (
        <FormSection>
          <FormRow
            disabled={busy}
            icon="plus"
            kind="action"
            label="Duplicate Step"
            onPress={onDuplicate}
            testID={`duplicate-step-${current.id}`}
          />
          <FormRow
            disabled={busy}
            icon="trash-2"
            kind="destructive"
            label="Delete Step"
            onPress={onDelete}
            testID={`delete-step-${current.id}`}
          />
        </FormSection>
      ) : null}
    </FormSheet>
  );
}

function StepRow({
  step,
  activities,
  folders,
  trackingMode,
  index,
  count,
  reordering,
  onEdit,
  onMove,
  busy,
}: {
  step: EditableStep;
  activities: readonly Activity[];
  folders: readonly Folder[];
  trackingMode: RoutineTrackingMode;
  index: number;
  count: number;
  reordering: boolean;
  onEdit: () => void;
  onMove: (direction: 'up' | 'down') => void;
  busy: boolean;
}) {
  const { colors } = useAppTheme();
  const selectedActivity =
    trackingMode === 'steps' && step.activityId !== null
      ? activities.find((activity) => activity.id === step.activityId)
      : null;
  const stepColor = selectedActivity
    ? resolveDisplayColor(selectedActivity, folders, colors.primary)
    : (step.color ?? colors.primary);
  const included = step.enabled !== false;
  const subtitle = included
    ? `${formatStepDuration(step.durationMs)} · ${isAutoAdvance(step.endBehavior) ? 'then next step' : 'then keeps going'}`
    : `Not included · ${formatStepDuration(step.durationMs)}`;
  return (
    <FormRow
      accessibilityHint={reordering ? undefined : 'Opens this step'}
      icon={step.iconName || 'timer'}
      iconColor={included ? stepColor : colors.textMuted}
      label={step.name || 'Untitled step'}
      muted={!included}
      onPress={reordering ? undefined : onEdit}
      subtitle={subtitle}
      testID={`routine-step-${step.id}`}
      trailing={
        reordering ? (
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <IconButton
              disabled={busy || index === 0}
              icon="chevron-up"
              label="Move step up"
              onPress={() => onMove('up')}
              testID={`move-step-up-${step.id}`}
              variant="plain"
            />
            <IconButton
              disabled={busy || index === count - 1}
              icon="chevron-down"
              label="Move step down"
              onPress={() => onMove('down')}
              testID={`move-step-down-${step.id}`}
              variant="plain"
            />
          </View>
        ) : undefined
      }
    />
  );
}

export function RoutineEditorScreen({ id, initialFolderId = null }: RoutineEditorScreenProps) {
  const router = useRouter();
  const { colors } = useAppTheme();
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
      <Screen
        onBack={() => goBackInAppStack(router, '/')}
        title={id === NEW_ID ? 'New routine' : 'Routine editor'}
      >
        {loadError ? (
          <ErrorMessage
            message={loadError}
            onClose={() => goBackInAppStack(router, '/')}
            onRetry={() => {
              setLoadError(null);
              setVersion((current) => current + 1);
            }}
          />
        ) : (
          <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>
            Loading routine editor...
          </Text>
        )}
      </Screen>
    );
  }
  const runRoutine = async (routineId: UUID) => {
    const runtime = await loadRoutineRuntime();
    const active = await runtime.routineService.getActive();
    if (
      active &&
      active.routineId !== routineId &&
      (active.status === 'running' || active.status === 'paused')
    ) {
      if (active.status === 'running') await runtime.routineService.switchToActivity(null);
      const [pausedActive, target] = await Promise.all([
        runtime.routineService.getActive(),
        runtime.catalogService.getRoutine(routineId),
      ]);
      if (!pausedActive) throw new Error('The active routine could not be paused');
      const choice = await chooseRoutineStartConflict(pausedActive, target);
      if (choice) await resolveRoutineConflict(choice, target);
      return;
    }
    if (runtime.settings.alarmSettings.enabled && runtime.settings.alarmSettings.sound) {
      try {
        await runtime.routineAlarmService.prepare();
      } catch {
        // Alarm playback is best-effort; the routine can still start.
      }
    }
    const started = await runtime.routineService.startRoutine(routineId);
    router.push(`/routine/${started.routineId}`);
  };
  const resolveRoutineConflict = async (
    choice: RoutineConflictChoice,
    target: RoutineDefinition
  ) => {
    const runtime = await loadRoutineRuntime();
    if (runtime.settings.alarmSettings.enabled && runtime.settings.alarmSettings.sound) {
      await runtime.routineAlarmService.prepare().catch(() => undefined);
    }
    if (choice === 'resume') {
      const resumed = await runtime.routineService.resume();
      router.push(`/routine/${resumed.routineId}`);
      return;
    }
    await runtime.routineService.cancelAndFinalize();
    const started = await runtime.routineService.startRoutine(target.id);
    router.push(`/routine/${started.routineId}`);
  };
  return (
    <Fragment>
      <RoutineEditorForm
        key={`${id}-${version}`}
        initialFolderId={initialFolderId}
        onBack={() => goBackInAppStack(router, '/')}
        resource={resource}
        onSaved={() => router.replace('/')}
        onRun={runRoutine}
      />
    </Fragment>
  );
}

function RoutineEditorForm({
  resource,
  initialFolderId,
  onBack,
  onSaved,
  onRun,
}: {
  resource: EditorResource;
  initialFolderId: UUID | null;
  onBack: () => void;
  onSaved: () => void;
  onRun: (routineId: UUID) => Promise<void>;
}) {
  const { colors } = useAppTheme();
  const [currentResource, setCurrentResource] = useState(resource);
  const { service, catalog, routine } = currentResource;
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
  const [reordering, setReordering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastAction = useRef<(() => Promise<void>) | null>(null);
  const activities = catalog.activities;
  const selectedFolder =
    folderId === ROOT_VALUE ? null : catalog.folders.find((folder) => folder.id === folderId);
  const previewColor = selectedFolder
    ? (selectedFolder.color ?? colors.primary)
    : color || colors.primary;

  const run = async (action: () => Promise<void>) => {
    lastAction.current = action;
    setBusy(true);
    setError(null);
    try {
      await action();
      if (currentResource.routine) {
        const [nextCatalog, nextRoutine] = await Promise.all([
          service.read(),
          service.getRoutine(currentResource.routine.id),
        ]);
        setCurrentResource({ service, catalog: nextCatalog, routine: nextRoutine });
      }
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
        onSaved();
      } else {
        await service.createRoutine({
          name,
          color: color.trim() || null,
          iconName: iconName.trim() || null,
          folderId: selectedFolderId,
          trackingMode,
          steps: newSteps.map((step) => inputFromDraft(step, trackingMode)),
        });
        onSaved();
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

  const steps: EditableStep[] = routine
    ? [...routine.steps]
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((step) =>
          trackingMode === 'steps' ? inheritRoutineStepMetadata(catalog, step) : step
        )
    : newSteps.map((step) => {
        const editableStep: EditableStep = {
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
          color: null,
          iconName: step.iconName || null,
          enabled: step.enabled,
          endBehavior: step.endBehavior,
          notes: step.notes || null,
        };
        return trackingMode === 'steps'
          ? inheritRoutineStepMetadata(catalog, editableStep)
          : editableStep;
      });
  const includedSteps = steps.filter((step) => step.enabled !== false);
  const totalDurationMs = includedSteps.reduce((total, step) => total + step.durationMs, 0);
  const editingExisting = editingStepId !== null;
  const closeStep = () => {
    setDraft(null);
    setEditingStepId(null);
    setError(null);
  };
  const duplicateStep = (step: EditableStep) => {
    if (routine) {
      void run(async () => {
        await service.duplicateRoutineStep(routine.id, step.id);
      });
    } else {
      setNewSteps((current) => [
        ...current,
        { ...draftFromStep(step), id: createId(), title: `${step.name ?? ''} copy` },
      ]);
    }
  };
  const moveStep = (step: EditableStep, index: number, direction: 'up' | 'down') =>
    routine
      ? void run(async () => {
          await service.reorderRoutineStep(routine.id, step.id, direction);
        })
      : setNewSteps((current) => {
          const to = direction === 'up' ? index - 1 : index + 1;
          if (to < 0 || to >= current.length) return current;
          const next = [...current];
          const [moved] = next.splice(index, 1);
          if (moved) next.splice(to, 0, moved);
          return next;
        });
  const trackingFooter = routine
    ? trackingMode === 'steps'
      ? 'Each step logs time to its own activity. This is set when a routine is created.'
      : 'The whole routine logs time as one activity. This is set when a routine is created.'
    : trackingMode === 'steps'
      ? 'Each step logs time to its own activity.'
      : trackingMode === 'overall'
        ? 'The whole routine logs time as one activity.'
        : "Choose before adding steps. This can't be changed later.";

  return (
    <>
      <Screen
        headerRight={
          <HeaderTextButton
            disabled={busy || (!routine && !trackingMode)}
            emphasized
            label={routine ? 'Save' : 'Create'}
            onPress={() => void saveRoutine()}
            testID="save-routine"
          />
        }
        onBack={onBack}
        title={routine ? 'Edit Routine' : 'New Routine'}
      >
        <Form>
          {draft === null ? (
            <ErrorMessage
              message={error}
              onClose={() => setError(null)}
              onRetry={() => {
                if (lastAction.current) void lastAction.current();
              }}
            />
          ) : null}
          <FormSection
            footer={selectedFolder ? "Uses its folder's color while it's in a folder." : undefined}
          >
            <FormTextField
              label="Routine name"
              onChangeText={setName}
              placeholder="Name"
              testID="routine-name"
              value={name}
            />
            <FormIconRow
              color={previewColor}
              onChange={(next) => setIconName(next ?? '')}
              testID="routine-icon-picker"
              value={iconName || null}
            />
            <FormColorRow
              onChange={(next) => setColor(next ?? '')}
              testID="routine-color"
              value={color || null}
            />
            <FormPickerRow
              label="Folder"
              onValueChange={setFolderId}
              selectedValue={folderId}
              testID="routine-folder-picker"
            >
              <Picker.Item label="None" value={ROOT_VALUE} />
              {catalog.folders
                .filter((folder) => folder.archivedAt === null || folder.id === routine?.folderId)
                .map((folder) => (
                  <Picker.Item
                    key={folder.id}
                    label={folder.archivedAt ? `${folder.name} (archived)` : folder.name}
                    value={folder.id}
                  />
                ))}
            </FormPickerRow>
          </FormSection>
          <FormSection footer={trackingFooter}>
            <FormPickerRow
              enabled={!routine && newSteps.length === 0 && draft === null}
              label="Log time as"
              onValueChange={(value) => setTrackingMode(value as RoutineTrackingMode)}
              selectedValue={trackingMode}
              testID="routine-tracking-mode"
            >
              <Picker.Item label="Choose" value="" />
              <Picker.Item label="One activity" value="overall" />
              <Picker.Item label="Each step" value="steps" />
            </FormPickerRow>
          </FormSection>
          <FormSection
            footer={
              steps.length > 0
                ? `${includedSteps.length} of ${steps.length} steps · ${formatStepDuration(totalDurationMs)} total`
                : trackingMode
                  ? 'Add at least one step before starting this routine.'
                  : undefined
            }
            headerAction={
              steps.length > 1 ? (
                <HeaderTextButton
                  compact
                  label={reordering ? 'Done' : 'Reorder'}
                  onPress={() => setReordering((current) => !current)}
                  testID="reorder-routine-steps"
                />
              ) : undefined
            }
            title="Steps"
          >
            {steps.map((step, index) => (
              <StepRow
                activities={activities}
                busy={busy}
                count={steps.length}
                folders={catalog.folders}
                index={index}
                key={step.id}
                onEdit={() => {
                  setError(null);
                  setEditingStepId(step.id);
                  setDraft(draftFromStep(step));
                }}
                onMove={(direction) => moveStep(step, index, direction)}
                reordering={reordering}
                step={step}
                trackingMode={trackingMode as RoutineTrackingMode}
              />
            ))}
            <FormRow
              disabled={busy || !trackingMode || reordering}
              icon="plus"
              kind="action"
              label="Add Step"
              onPress={startAdd}
              testID="add-routine-step"
            />
          </FormSection>
          {routine ? (
            <FormSection>
              <FormRow
                disabled={busy || includedSteps.length === 0}
                icon="play"
                kind="action"
                label="Start Routine"
                onPress={() => void startRoutine()}
                testID="run-routine"
              />
            </FormSection>
          ) : null}
        </Form>
      </Screen>
      {trackingMode ? (
        <StepSheet
          activities={activities}
          busy={busy}
          draft={draft}
          error={draft ? error : null}
          folders={catalog.folders}
          isExisting={editingExisting}
          onCancel={closeStep}
          onChange={setDraft}
          onCloseError={() => setError(null)}
          onDelete={() => {
            const stepId = editingStepId;
            if (!stepId) return;
            void confirmAction({
              confirmLabel: 'Delete',
              destructive: true,
              message: 'This removes the step and its settings from the routine.',
              title: 'Delete Step?',
            }).then((confirmed) => {
              if (!confirmed) return;
              if (routine) {
                void run(async () => {
                  await service.deleteRoutineStep(routine.id, stepId);
                  closeStep();
                });
              } else {
                setNewSteps((current) => current.filter((candidate) => candidate.id !== stepId));
                closeStep();
              }
            });
          }}
          onDuplicate={() => {
            const step = steps.find((candidate) => candidate.id === editingStepId);
            closeStep();
            if (step) duplicateStep(step);
          }}
          onRetry={() => {
            const action = lastAction.current;
            if (action) void run(action);
          }}
          onSave={() => void saveStep()}
          trackingMode={trackingMode}
        />
      ) : null}
    </>
  );
}
