import { Column, Picker, Row, Text } from '@expo/ui';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import type {
  Activity,
  CatalogCollection,
  Folder,
  TimeGoal,
  TimeGoalPeriod,
  TimeGoalType,
  UUID,
} from '@domain';
import { AppIcon } from '@icons';
import { useAppTheme } from '@theme';
import {
  AccessiblePicker,
  AccessibleTextInput,
  AppButton,
  ColorPicker,
  DurationPicker,
  type DurationValue,
  errorText,
  IconPicker,
  ReorderControls,
  Screen,
} from '@ui';
import { RecoveryActions } from '../orchestration/RecoveryActions';

import type { CatalogService } from './catalog-service';
import { loadRoutineRuntime } from '../routine/routine-runtime';

const ROOT_VALUE = '__root__';
const TIME_GOAL_NONE = 'none' as const;
const DEFAULT_TIME_GOAL_DURATION_MS = 30 * 60 * 1000;

type TimeGoalEditorType = TimeGoalType | typeof TIME_GOAL_NONE;

async function loadActiveCatalogService(): Promise<CatalogService> {
  return (await loadRoutineRuntime()).catalogService;
}

interface EditorResource {
  service: CatalogService;
  catalog: CatalogCollection;
}

export interface CatalogEditorScreenProps {
  kind: 'activity' | 'folder';
  id: string;
  initialFolderId?: UUID | null;
}

export function CatalogEditorScreen({
  kind,
  id,
  initialFolderId = null,
}: CatalogEditorScreenProps) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const [resource, setResource] = useState<EditorResource | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void loadActiveCatalogService()
      .then(async (service) => ({ service, catalog: await service.read() }))
      .then((next) => {
        if (!cancelled) setResource(next);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(errorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, [id, kind, version]);

  const title = kind === 'activity' ? 'Activity editor' : 'Folder editor';
  if (!resource) {
    return (
      <Screen
        onBack={() => router.back()}
        title={title}
        description="Catalog changes are stored on this device."
      >
        <Column
          spacing={12}
          style={{
            backgroundColor: loadError ? colors.danger.background : colors.surface,
            borderColor: loadError ? colors.danger.foreground : colors.border,
            borderRadius: 16,
            borderWidth: 1,
            padding: 20,
            width: '100%',
          }}
        >
          <Text
            textStyle={{
              color: loadError ? colors.danger.foreground : colors.textMuted,
              fontSize: 16,
            }}
          >
            {loadError ?? 'Loading catalog...'}
          </Text>
          {loadError ? (
            <RecoveryActions
              onBack={() => router.back()}
              onRetry={() => {
                setLoadError(null);
                setVersion((current) => current + 1);
              }}
              testID="catalog-load-recovery"
            />
          ) : null}
        </Column>
      </Screen>
    );
  }

  const refresh = () => {
    setResource(null);
    setVersion((current) => current + 1);
  };
  if (kind === 'activity') {
    return (
      <ActivityEditor
        key={`${id}-${version}`}
        activity={resource.catalog.activities.find((candidate) => candidate.id === id) ?? null}
        folders={resource.catalog.folders}
        initialFolderId={initialFolderId}
        service={resource.service}
        onBack={() => router.back()}
        onChanged={refresh}
      />
    );
  }
  return (
    <FolderEditor
      key={`${id}-${version}`}
      folder={resource.catalog.folders.find((candidate) => candidate.id === id) ?? null}
      service={resource.service}
      onBack={() => router.back()}
      onChanged={refresh}
    />
  );
}

function ActionError({
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
        Catalog action failed
      </Text>
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{message}</Text>
      <RecoveryActions onBack={onBack} onRetry={onRetry} testID="catalog-action-recovery" />
    </Column>
  );
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

function durationValueFromMilliseconds(durationMs: number | undefined): DurationValue {
  const normalizedDurationMs =
    durationMs !== undefined && Number.isFinite(durationMs) && durationMs > 0
      ? Math.floor(durationMs)
      : DEFAULT_TIME_GOAL_DURATION_MS;
  const totalSeconds = Math.floor(normalizedDurationMs / 1000);
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor(totalSeconds / 60) % 60,
    seconds: totalSeconds % 60,
  };
}

function durationValueToMilliseconds(duration: DurationValue): number {
  if (
    !Number.isInteger(duration.hours) ||
    !Number.isInteger(duration.minutes) ||
    !Number.isInteger(duration.seconds) ||
    duration.hours < 0 ||
    duration.minutes < 0 ||
    duration.seconds < 0
  ) {
    return 0;
  }
  return ((duration.hours * 60 + duration.minutes) * 60 + duration.seconds) * 1000;
}

function buildTimeGoal(
  type: TimeGoalEditorType,
  duration: DurationValue,
  period: TimeGoalPeriod
): TimeGoal | null {
  if (type === TIME_GOAL_NONE) return null;
  const durationMs = durationValueToMilliseconds(duration);
  if (durationMs <= 0) throw new Error('Time goal duration must be greater than zero.');
  return { type, durationMs, period };
}

function TimeGoalEditor({
  type,
  duration,
  period,
  onTypeChange,
  onDurationChange,
  onPeriodChange,
}: {
  type: TimeGoalEditorType;
  duration: DurationValue;
  period: TimeGoalPeriod;
  onTypeChange: (value: TimeGoalEditorType) => void;
  onDurationChange: (value: DurationValue) => void;
  onPeriodChange: (value: TimeGoalPeriod) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Column spacing={12} style={{ paddingTop: 16, width: '100%' }} testID="activity-time-goal">
      <Column style={{ backgroundColor: colors.border, height: 1, width: '100%' }} />
      <Text textStyle={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>Time goal</Text>
      <Field label="Goal type">
        <AccessiblePicker
          label="Time goal type"
          onValueChange={(next) => onTypeChange(String(next) as TimeGoalEditorType)}
          selectedValue={type}
          testID="activity-time-goal-type"
        >
          <Picker.Item label="None" value={TIME_GOAL_NONE} />
          <Picker.Item label="Target" value="target" />
          <Picker.Item label="Limit" value="limit" />
        </AccessiblePicker>
      </Field>
      {type !== TIME_GOAL_NONE ? (
        <>
          <Field label="Duration">
            <DurationPicker
              hours={duration.hours}
              minutes={duration.minutes}
              onChange={onDurationChange}
              seconds={duration.seconds}
              testID="activity-time-goal-duration"
            />
          </Field>
          <Field label="Cadence">
            <AccessiblePicker
              label="Time goal cadence"
              onValueChange={(next) => onPeriodChange(String(next) as TimeGoalPeriod)}
              selectedValue={period}
              testID="activity-time-goal-period"
            >
              <Picker.Item label="Day" value="day" />
              <Picker.Item label="Week" value="week" />
              <Picker.Item label="Month" value="month" />
            </AccessiblePicker>
          </Field>
        </>
      ) : null}
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
  const availableFolders = folders.filter(
    (folder) => folder.archivedAt === null || folder.id === currentFolderId
  );
  return (
    <AccessiblePicker
      label="Parent folder"
      selectedValue={value}
      onValueChange={(next) => onChange(String(next))}
      testID="folder-picker"
    >
      <Picker.Item label="Root" value={ROOT_VALUE} />
      {availableFolders.map((folder) => (
        <Picker.Item
          key={folder.id}
          label={folder.archivedAt ? `${folder.name} (archived)` : folder.name}
          value={folder.id}
        />
      ))}
    </AccessiblePicker>
  );
}

function ArchiveConfirmation({
  resourceLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  resourceLabel: 'activity' | 'folder';
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
      testID={`archive-${resourceLabel}-confirmation`}
    >
      <Text textStyle={{ color: colors.warning.foreground, fontSize: 15, fontWeight: '700' }}>
        {`Archive this ${resourceLabel}?`}
      </Text>
      <Text textStyle={{ color: colors.warning.foreground, fontSize: 14, lineHeight: 20 }}>
        It will be hidden from active catalog views but retained for history. You can restore it
        later.
      </Text>
      <Column spacing={8} style={{ width: '100%' }}>
        <AppButton
          disabled={busy}
          label={`Yes, archive ${resourceLabel}`}
          onPress={onConfirm}
          style={{ height: 48, width: '100%' }}
          testID={`confirm-archive-${resourceLabel}`}
        />
        <AppButton
          disabled={busy}
          label={`Keep ${resourceLabel}`}
          onPress={onCancel}
          style={{ height: 48, width: '100%' }}
          variant="outlined"
        />
      </Column>
    </Column>
  );
}

function ActivityEditor({
  activity,
  folders,
  initialFolderId,
  service,
  onChanged,
  onBack,
}: {
  activity: Activity | null;
  folders: readonly Folder[];
  initialFolderId: UUID | null;
  service: CatalogService;
  onChanged: () => void;
  onBack: () => void;
}) {
  const { colors } = useAppTheme();
  const [name, setName] = useState(activity?.name ?? '');
  const [color, setColor] = useState(activity?.color ?? '');
  const [folderId, setFolderId] = useState(activity?.folderId ?? initialFolderId ?? ROOT_VALUE);
  const [timeGoalType, setTimeGoalType] = useState<TimeGoalEditorType>(
    activity?.timeGoal?.type ?? TIME_GOAL_NONE
  );
  const [timeGoalDuration, setTimeGoalDuration] = useState<DurationValue>(() =>
    durationValueFromMilliseconds(activity?.timeGoal?.durationMs)
  );
  const [timeGoalPeriod, setTimeGoalPeriod] = useState<TimeGoalPeriod>(
    activity?.timeGoal?.period ?? 'day'
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastAction = useRef<(() => Promise<void>) | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const originalFolderId = activity?.folderId ?? null;

  const run = async (action: () => Promise<void>) => {
    lastAction.current = action;
    setBusy(true);
    setError(null);
    try {
      await action();
      if (!activity) {
        onBack();
        return;
      }
      onChanged();
    } catch (actionError) {
      setError(errorText(actionError));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    let timeGoal: TimeGoal | null;
    try {
      timeGoal = buildTimeGoal(timeGoalType, timeGoalDuration, timeGoalPeriod);
    } catch (goalError) {
      setError(errorText(goalError));
      return;
    }

    void run(async () => {
      const selectedFolderId = folderId === ROOT_VALUE ? null : (folderId as UUID);
      if (activity) {
        const nextInput = {
          name,
          color: color.trim() || null,
          timeGoal,
          ...(selectedFolderId !== originalFolderId ? { folderId: selectedFolderId } : {}),
        };
        await service.updateActivity(activity.id, nextInput);
      } else {
        await service.createActivity({
          name,
          color: color.trim() || null,
          folderId: selectedFolderId,
          timeGoal,
        });
      }
    });
  };

  return (
    <Screen
      onBack={onBack}
      title={activity ? 'Edit activity' : 'New activity'}
      description="Choose a root or one-level folder placement."
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
          <AppIcon name="activity" color={color || colors.primary} size={28} />
          <Text textStyle={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>
            {activity?.name ?? 'New activity'}
          </Text>
        </Row>
        <Field label="Name">
          <AccessibleTextInput
            defaultValue={name}
            label="Activity name"
            onChangeText={setName}
            placeholder="Activity name"
            returnKeyType="done"
            placeholderTextColor={colors.textMuted}
            testID="activity-name"
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
        </Field>
        <Field label="Standalone color">
          <ColorPicker
            onChange={(next) => setColor(next ?? '')}
            testID="activity-color"
            value={color || null}
          />
        </Field>
        <Field label="Placement">
          <FolderPicker
            folders={folders}
            currentFolderId={activity?.folderId ?? null}
            value={folderId}
            onChange={setFolderId}
          />
        </Field>
        <TimeGoalEditor
          duration={timeGoalDuration}
          onDurationChange={setTimeGoalDuration}
          onPeriodChange={setTimeGoalPeriod}
          onTypeChange={setTimeGoalType}
          period={timeGoalPeriod}
          type={timeGoalType}
        />
        <ActionError
          message={error}
          onBack={onBack}
          onRetry={() => {
            if (lastAction.current) void run(lastAction.current);
          }}
        />
        <AppButton
          disabled={busy}
          label={busy ? 'Saving...' : 'Save activity'}
          onPress={save}
          style={{ height: 52, width: '100%' }}
          testID="save-activity"
        />
        {activity ? (
          <>
            <ReorderControls
              canMoveUp
              canMoveDown
              disabled={busy || activity.archivedAt !== null}
              onMoveUp={() => run(async () => void (await service.reorderItem(activity.id, 'up')))}
              onMoveDown={() =>
                run(async () => void (await service.reorderItem(activity.id, 'down')))
              }
              testID="activity-reorder"
            />
            {confirmingArchive ? (
              <ArchiveConfirmation
                busy={busy}
                onCancel={() => setConfirmingArchive(false)}
                onConfirm={() =>
                  void run(async () => {
                    await service.archiveActivity(activity.id);
                    setConfirmingArchive(false);
                  })
                }
                resourceLabel="activity"
              />
            ) : null}
            <AppButton
              disabled={busy}
              label={activity.archivedAt === null ? 'Archive activity' : 'Restore activity'}
              onPress={() => {
                if (activity.archivedAt === null) setConfirmingArchive(true);
                else
                  void run(async () => {
                    await service.restoreActivity(activity.id);
                  });
              }}
              style={{ height: 48, width: '100%' }}
              variant="outlined"
            />
          </>
        ) : null}
      </Column>
    </Screen>
  );
}

function FolderEditor({
  folder,
  service,
  onChanged,
  onBack,
}: {
  folder: Folder | null;
  service: CatalogService;
  onChanged: () => void;
  onBack: () => void;
}) {
  const { colors } = useAppTheme();
  const [name, setName] = useState(folder?.name ?? '');
  const [color, setColor] = useState(folder?.color ?? '');
  const [iconName, setIconName] = useState(folder?.iconName ?? 'folder');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastAction = useRef<(() => Promise<void>) | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  const run = async (action: () => Promise<void>) => {
    lastAction.current = action;
    setBusy(true);
    setError(null);
    try {
      await action();
      if (!folder) {
        onBack();
        return;
      }
      onChanged();
    } catch (actionError) {
      setError(errorText(actionError));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      if (folder) {
        await service.updateFolder(folder.id, {
          name,
          color: color.trim() || null,
          iconName: iconName.trim() || null,
        });
      } else {
        await service.createFolder({
          name,
          color: color.trim() || null,
          iconName: iconName.trim() || null,
        });
      }
    });

  return (
    <Screen
      onBack={onBack}
      title={folder ? 'Edit folder' : 'New folder'}
      description="Folders stay at one level; catalog items can be placed inside them."
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
          <AppIcon name={iconName || 'folder'} color={color || colors.primary} size={28} />
          <Text textStyle={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>
            {folder?.name ?? 'New folder'}
          </Text>
        </Row>
        <Field label="Name">
          <AccessibleTextInput
            defaultValue={name}
            label="Folder name"
            onChangeText={setName}
            placeholder="Folder name"
            returnKeyType="done"
            placeholderTextColor={colors.textMuted}
            testID="folder-name"
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
        </Field>
        <Field label="Folder color">
          <ColorPicker
            onChange={(next) => setColor(next ?? '')}
            testID="folder-color"
            value={color || null}
          />
        </Field>
        <Field label="Icon">
          <IconPicker value={iconName || null} onChange={(next) => setIconName(next ?? '')} />
        </Field>
        <ActionError
          message={error}
          onBack={onBack}
          onRetry={() => {
            if (lastAction.current) void run(lastAction.current);
          }}
        />
        <AppButton
          disabled={busy}
          label={busy ? 'Saving...' : 'Save folder'}
          onPress={save}
          style={{ height: 52, width: '100%' }}
          testID="save-folder"
        />
        {folder ? (
          <>
            <ReorderControls
              canMoveUp
              canMoveDown
              disabled={busy || folder.archivedAt !== null}
              onMoveUp={() => run(async () => void (await service.reorderFolders(folder.id, 'up')))}
              onMoveDown={() =>
                run(async () => void (await service.reorderFolders(folder.id, 'down')))
              }
              testID="folder-reorder"
            />
            {confirmingArchive ? (
              <ArchiveConfirmation
                busy={busy}
                onCancel={() => setConfirmingArchive(false)}
                onConfirm={() =>
                  void run(async () => {
                    await service.archiveFolder(folder.id);
                    setConfirmingArchive(false);
                  })
                }
                resourceLabel="folder"
              />
            ) : null}
            <AppButton
              disabled={busy}
              label={folder.archivedAt === null ? 'Archive folder' : 'Restore folder'}
              onPress={() => {
                if (folder.archivedAt === null) setConfirmingArchive(true);
                else
                  void run(async () => {
                    await service.restoreFolder(folder.id);
                  });
              }}
              style={{ height: 48, width: '100%' }}
              variant="outlined"
            />
          </>
        ) : null}
      </Column>
    </Screen>
  );
}
