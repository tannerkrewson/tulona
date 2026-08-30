import { Button, Column, Picker, Row, Text, TextInput } from '@expo/ui';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import {
  createAsyncStorageDatabase,
  createCatalogRepository,
  createDatasetManager,
  PersistenceError,
} from '@data';
import type { Activity, CatalogCollection, Folder, UUID } from '@domain';
import { AppIcon } from '@icons';
import { iconCatalog, type IconName } from '@icons/icon-names';
import { getAccessibleTextColor, useAppTheme } from '@theme';
import { Screen } from '@ui';

import type { CatalogService } from './catalog-service';
import { createCatalogService } from './catalog-service';

const ROOT_VALUE = '__root__';
const database = createAsyncStorageDatabase();
const datasetManager = createDatasetManager(database);

async function loadActiveCatalogService(): Promise<CatalogService> {
  const namespace = await datasetManager.active();
  if (!namespace) throw new PersistenceError('metadata', 'Create or activate a dataset first');
  return createCatalogService(createCatalogRepository(database, namespace));
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
      <Screen title={title} description="Catalog changes are stored on this device.">
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
        </Column>
      </Screen>
    );
  }

  const refresh = () => setVersion((current) => current + 1);
  if (kind === 'activity') {
    return (
      <ActivityEditor
        key={`${id}-${version}`}
        activity={resource.catalog.activities.find((candidate) => candidate.id === id) ?? null}
        folders={resource.catalog.folders}
        initialFolderId={initialFolderId}
        service={resource.service}
        onChanged={refresh}
      />
    );
  }
  return (
    <FolderEditor
      key={`${id}-${version}`}
      folder={resource.catalog.folders.find((candidate) => candidate.id === id) ?? null}
      service={resource.service}
      onChanged={refresh}
    />
  );
}

function ActionError({ message }: { message: string | null }) {
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

function IconPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Picker
      selectedValue={value}
      onValueChange={(next) => onChange(String(next))}
      testID="icon-picker"
    >
      <Picker.Item label="No icon" value="" />
      {iconCatalog.map((icon) => (
        <Picker.Item key={icon.name} label={icon.label} value={icon.name} />
      ))}
    </Picker>
  );
}

function ColorPreview({ value }: { value: string }) {
  const { colors } = useAppTheme();
  const preview = /^#[0-9a-f]{6}$/i.test(value) ? value : colors.surfaceMuted;
  return (
    <Row alignment="center" spacing={10}>
      <Column
        style={{
          backgroundColor: preview,
          borderColor: colors.border,
          borderRadius: 10,
          borderWidth: 1,
          height: 42,
          width: 42,
        }}
      />
      <Text textStyle={{ color: getAccessibleTextColor(preview), fontSize: 14 }}>
        {value || 'Default catalog color'}
      </Text>
    </Row>
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
    <Picker
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
    </Picker>
  );
}

function ActivityEditor({
  activity,
  folders,
  initialFolderId,
  service,
  onChanged,
}: {
  activity: Activity | null;
  folders: readonly Folder[];
  initialFolderId: UUID | null;
  service: CatalogService;
  onChanged: () => void;
}) {
  const { colors } = useAppTheme();
  const [name, setName] = useState(activity?.name ?? '');
  const [color, setColor] = useState(activity?.color ?? '');
  const [iconName, setIconName] = useState(activity?.iconName ?? '');
  const [folderId, setFolderId] = useState(activity?.folderId ?? initialFolderId ?? ROOT_VALUE);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const originalFolderId = activity?.folderId ?? null;

  const run = async (action: () => Promise<void>) => {
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

  const save = () =>
    run(async () => {
      const selectedFolderId = folderId === ROOT_VALUE ? null : (folderId as UUID);
      if (activity) {
        const nextInput = {
          name,
          color: color.trim() || null,
          iconName: iconName as IconName | null,
          ...(selectedFolderId !== originalFolderId ? { folderId: selectedFolderId } : {}),
        };
        await service.updateActivity(activity.id, nextInput);
      } else {
        await service.createActivity({
          name,
          color: color.trim() || null,
          iconName: iconName as IconName | null,
          folderId: selectedFolderId,
        });
      }
    });

  return (
    <Screen
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
          <AppIcon
            name={(iconName || 'activity') as IconName}
            color={color || colors.primary}
            size={28}
          />
          <Text textStyle={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>
            {activity?.name ?? 'New activity'}
          </Text>
        </Row>
        <Field label="Name">
          <TextInput
            defaultValue={name}
            onChangeText={setName}
            placeholder="Activity name"
            returnKeyType="done"
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
          <TextInput
            defaultValue={color}
            onChangeText={setColor}
            placeholder="#176B87"
            testID="activity-color"
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
          <ColorPreview value={color} />
        </Field>
        <Field label="Curated icon">
          <IconPicker value={iconName} onChange={setIconName} />
        </Field>
        <Field label="Placement">
          <FolderPicker
            folders={folders}
            currentFolderId={activity?.folderId ?? null}
            value={folderId}
            onChange={setFolderId}
          />
        </Field>
        <ActionError message={error} />
        <Button
          disabled={busy}
          label={busy ? 'Saving...' : 'Save activity'}
          onPress={save}
          testID="save-activity"
        />
        {activity ? (
          <>
            <Row alignment="center" spacing={10}>
              <Button
                disabled={busy || activity.archivedAt !== null}
                label="Move Up"
                onPress={() => run(async () => void (await service.reorderItem(activity.id, 'up')))}
                variant="outlined"
              />
              <Button
                disabled={busy || activity.archivedAt !== null}
                label="Move Down"
                onPress={() =>
                  run(async () => void (await service.reorderItem(activity.id, 'down')))
                }
                variant="outlined"
              />
            </Row>
            <Button
              disabled={busy}
              label={activity.archivedAt === null ? 'Archive activity' : 'Restore activity'}
              onPress={() =>
                run(async () => {
                  if (activity.archivedAt === null) await service.archiveActivity(activity.id);
                  else await service.restoreActivity(activity.id);
                })
              }
              variant="text"
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
}: {
  folder: Folder | null;
  service: CatalogService;
  onChanged: () => void;
}) {
  const { colors } = useAppTheme();
  const [name, setName] = useState(folder?.name ?? '');
  const [color, setColor] = useState(folder?.color ?? '');
  const [iconName, setIconName] = useState(folder?.iconName ?? 'folder');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
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

  const save = () =>
    run(async () => {
      if (folder) {
        await service.updateFolder(folder.id, {
          name,
          color: color.trim() || null,
          iconName: iconName as IconName | null,
        });
      } else {
        await service.createFolder({
          name,
          color: color.trim() || null,
          iconName: iconName as IconName | null,
        });
      }
    });

  return (
    <Screen
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
          <AppIcon
            name={(iconName || 'folder') as IconName}
            color={color || colors.primary}
            size={28}
          />
          <Text textStyle={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>
            {folder?.name ?? 'New folder'}
          </Text>
        </Row>
        <Field label="Name">
          <TextInput
            defaultValue={name}
            onChangeText={setName}
            placeholder="Folder name"
            returnKeyType="done"
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
          <TextInput
            defaultValue={color}
            onChangeText={setColor}
            placeholder="#176B87"
            testID="folder-color"
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
          <ColorPreview value={color} />
        </Field>
        <Field label="Curated icon">
          <IconPicker value={iconName} onChange={setIconName} />
        </Field>
        <ActionError message={error} />
        <Button
          disabled={busy}
          label={busy ? 'Saving...' : 'Save folder'}
          onPress={save}
          testID="save-folder"
        />
        {folder ? (
          <>
            <Row alignment="center" spacing={10}>
              <Button
                disabled={busy || folder.archivedAt !== null}
                label="Move Up"
                onPress={() =>
                  run(async () => void (await service.reorderFolders(folder.id, 'up')))
                }
                variant="outlined"
              />
              <Button
                disabled={busy || folder.archivedAt !== null}
                label="Move Down"
                onPress={() =>
                  run(async () => void (await service.reorderFolders(folder.id, 'down')))
                }
                variant="outlined"
              />
            </Row>
            <Button
              disabled={busy}
              label={folder.archivedAt === null ? 'Archive folder' : 'Restore folder'}
              onPress={() =>
                run(async () => {
                  if (folder.archivedAt === null) await service.archiveFolder(folder.id);
                  else await service.restoreFolder(folder.id);
                })
              }
              variant="text"
            />
          </>
        ) : null}
      </Column>
    </Screen>
  );
}
