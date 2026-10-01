import { Picker } from '@expo/ui';
import { Column, Text } from '@ui/primitives';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import type { Activity, CatalogCollection, Folder, UUID } from '@domain';
import { useAppTheme } from '@theme';
import {
  confirmAction,
  errorText,
  Form,
  FormColorRow,
  FormIconRow,
  FormPickerRow,
  FormRow,
  FormSection,
  FormTextField,
  HeaderTextButton,
  Screen,
} from '@ui';
import { RecoveryActions } from '../orchestration/RecoveryActions';
import { goBackInAppStack } from '../navigation/app-back';

import type { CatalogService, UpdateActivityInput } from './catalog-service';
import { loadRoutineRuntime } from '../routine/routine-runtime';

const ROOT_VALUE = '__root__';

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
      <Screen onBack={() => goBackInAppStack(router, '/')} title={title}>
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
              onClose={() => goBackInAppStack(router, '/')}
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
        onConvert={async (input) => {
          const runtime = await loadRoutineRuntime();
          const [activeTransition, activeRoutine] = await Promise.all([
            runtime.trackerService.getActiveTransition(),
            runtime.routineService.getActive(),
          ]);
          if (activeTransition?.activityId === id) {
            throw new Error('Stop tracking this activity before converting it to a routine.');
          }
          if (
            activeRoutine &&
            ['running', 'paused', 'awaiting-next-activity'].includes(activeRoutine.status) &&
            activeRoutine.routineSnapshot.steps.some((step) => step.activityId === id)
          ) {
            throw new Error(
              `Finish or resolve the active "${activeRoutine.routineSnapshot.name}" routine before converting this activity.`
            );
          }
          const converted = await runtime.catalogService.convertActivityToRoutine(
            id as UUID,
            input
          );
          router.replace(`/routine-edit/${encodeURIComponent(converted.id)}` as Href);
        }}
        onBack={() => goBackInAppStack(router, '/')}
        onChanged={refresh}
      />
    );
  }
  return (
    <FolderEditor
      key={`${id}-${version}`}
      folder={resource.catalog.folders.find((candidate) => candidate.id === id) ?? null}
      service={resource.service}
      onBack={() => goBackInAppStack(router, '/')}
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
      <RecoveryActions onClose={onBack} onRetry={onRetry} testID="catalog-action-recovery" />
    </Column>
  );
}

function FolderPickerRow({
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
    <FormPickerRow
      label="Folder"
      onValueChange={(next) => onChange(String(next))}
      selectedValue={value}
      testID="folder-picker"
    >
      <Picker.Item label="None" value={ROOT_VALUE} />
      {folders
        .filter((folder) => folder.archivedAt === null || folder.id === currentFolderId)
        .map((folder) => (
          <Picker.Item
            key={folder.id}
            label={folder.archivedAt ? `${folder.name} (archived)` : folder.name}
            value={folder.id}
          />
        ))}
    </FormPickerRow>
  );
}

function ActivityEditor({
  activity,
  folders,
  initialFolderId,
  service,
  onConvert,
  onChanged,
  onBack,
}: {
  activity: Activity | null;
  folders: readonly Folder[];
  initialFolderId: UUID | null;
  service: CatalogService;
  onConvert: (input: UpdateActivityInput) => Promise<void>;
  onChanged: () => void;
  onBack: () => void;
}) {
  const [name, setName] = useState(activity?.name ?? '');
  const [color, setColor] = useState(activity?.color ?? '');
  const [folderId, setFolderId] = useState(activity?.folderId ?? initialFolderId ?? ROOT_VALUE);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastAction = useRef<(() => Promise<void>) | null>(null);
  const originalFolderId = activity?.folderId ?? null;
  const selectedFolder =
    folderId === ROOT_VALUE ? null : folders.find((folder) => folder.id === folderId);

  const run = async (action: () => Promise<void>, returnToPrevious = false) => {
    lastAction.current = action;
    setBusy(true);
    setError(null);
    try {
      await action();
      if (!activity || returnToPrevious) {
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
    void run(async () => {
      const selectedFolderId = folderId === ROOT_VALUE ? null : (folderId as UUID);
      if (activity) {
        const nextInput = {
          name,
          color: color.trim() || null,
          ...(selectedFolderId !== originalFolderId ? { folderId: selectedFolderId } : {}),
        };
        await service.updateActivity(activity.id, nextInput);
      } else {
        await service.createActivity({
          name,
          color: color.trim() || null,
          folderId: selectedFolderId,
        });
      }
    }, true);
  };

  const convertToRoutine = async () => {
    if (!activity || busy) return;
    const selectedFolderId = folderId === ROOT_VALUE ? null : (folderId as UUID);
    const action = () =>
      onConvert({ name, color: color.trim() || null, folderId: selectedFolderId });
    lastAction.current = action;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(errorText(actionError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Screen
        headerRight={
          <HeaderTextButton
            disabled={busy}
            emphasized
            label={activity ? 'Save' : 'Add'}
            onPress={save}
            testID="save-activity"
          />
        }
        onBack={onBack}
        title={activity ? 'Edit Activity' : 'New Activity'}
      >
        <Form>
          <ActionError
            message={error}
            onBack={onBack}
            onRetry={() => {
              if (lastAction.current) void run(lastAction.current);
            }}
          />
          <FormSection
            footer={selectedFolder ? "Uses its folder's color while it's in a folder." : undefined}
          >
            <FormTextField
              autoFocus={!activity}
              label="Activity name"
              onChangeText={setName}
              placeholder="Name"
              testID="activity-name"
              value={name}
            />
            <FormColorRow
              onChange={(next) => setColor(next ?? '')}
              testID="activity-color"
              value={color || null}
            />
            <FolderPickerRow
              currentFolderId={activity?.folderId ?? null}
              folders={folders}
              onChange={setFolderId}
              value={folderId}
            />
          </FormSection>
          {activity ? (
            <FormSection footer="Turn this activity into a routine with timed steps. Its history stays connected.">
              <FormRow
                disabled={busy}
                icon="repeat"
                kind="action"
                label="Convert to Routine"
                onPress={() =>
                  void confirmAction({
                    confirmLabel: 'Convert',
                    message:
                      'Its tracked time, goals, and habit triggers stay connected. Routines that use it as a step keep an archived copy. You can add steps next.',
                    title: 'Convert to Routine?',
                  }).then((confirmed) => {
                    if (confirmed) void convertToRoutine();
                  })
                }
                testID="convert-activity-to-routine"
              />
            </FormSection>
          ) : null}
          {activity ? (
            <FormSection
              footer={
                activity.archivedAt === null
                  ? 'Archived activities are hidden but keep their history.'
                  : undefined
              }
            >
              <FormRow
                disabled={busy}
                icon={activity.archivedAt === null ? 'archive' : 'upload'}
                kind={activity.archivedAt === null ? 'destructive' : 'action'}
                label={activity.archivedAt === null ? 'Archive Activity' : 'Restore Activity'}
                onPress={() => {
                  if (activity.archivedAt === null)
                    void confirmAction({
                      confirmLabel: 'Archive',
                      destructive: true,
                      message:
                        'It’s hidden from the tracker, and its history is kept. You can restore it later.',
                      title: `Archive ${activity.name}?`,
                    }).then((confirmed) => {
                      if (confirmed)
                        void run(async () => {
                          await service.archiveActivity(activity.id);
                        });
                    });
                  else
                    void run(async () => {
                      await service.restoreActivity(activity.id);
                    });
                }}
                testID="archive-activity"
              />
            </FormSection>
          ) : null}
        </Form>
      </Screen>
    </>
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
    <>
      <Screen
        headerRight={
          <HeaderTextButton
            disabled={busy}
            emphasized
            label={folder ? 'Save' : 'Add'}
            onPress={() => void save()}
            testID="save-folder"
          />
        }
        onBack={onBack}
        title={folder ? 'Edit Folder' : 'New Folder'}
      >
        <Form>
          <ActionError
            message={error}
            onBack={onBack}
            onRetry={() => {
              if (lastAction.current) void run(lastAction.current);
            }}
          />
          <FormSection footer="Items in this folder use its color.">
            <FormTextField
              autoFocus={!folder}
              label="Folder name"
              onChangeText={setName}
              placeholder="Name"
              testID="folder-name"
              value={name}
            />
            <FormIconRow
              color={color || colors.primary}
              filled
              onChange={(next) => setIconName(next ?? '')}
              testID="folder-icon"
              value={iconName || null}
            />
            <FormColorRow
              onChange={(next) => setColor(next ?? '')}
              testID="folder-color"
              value={color || null}
            />
          </FormSection>
          {folder ? (
            <FormSection
              footer={
                folder.archivedAt === null
                  ? 'Archived folders are hidden but keep their history.'
                  : undefined
              }
            >
              <FormRow
                disabled={busy}
                icon={folder.archivedAt === null ? 'archive' : 'upload'}
                kind={folder.archivedAt === null ? 'destructive' : 'action'}
                label={folder.archivedAt === null ? 'Archive Folder' : 'Restore Folder'}
                onPress={() => {
                  if (folder.archivedAt === null)
                    void confirmAction({
                      confirmLabel: 'Archive',
                      destructive: true,
                      message:
                        'It’s hidden from the tracker, and its history is kept. You can restore it later.',
                      title: `Archive ${folder.name}?`,
                    }).then((confirmed) => {
                      if (confirmed)
                        void run(async () => {
                          await service.archiveFolder(folder.id);
                        });
                    });
                  else
                    void run(async () => {
                      await service.restoreFolder(folder.id);
                    });
                }}
                testID="archive-folder"
              />
            </FormSection>
          ) : null}
        </Form>
      </Screen>
    </>
  );
}
