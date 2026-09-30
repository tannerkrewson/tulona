import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { CatalogCollection, UUID } from '@domain';
import { AppIcon } from '@icons';
import { useAppTheme } from '@theme';
import { ActivityRow } from './ActivityRow';
import { FolderRow } from './FolderRow';
import { resolveCatalogItem } from '../catalog/catalog-service';

/** Shared catalog navigation for session reassignment and missed switches. */
export function SessionActivityChoices({
  catalog,
  selectedId,
  excludeId,
  activeOnly = false,
  activitiesOnly = false,
  allowNone = false,
  busy = false,
  onChoose,
}: {
  catalog: CatalogCollection;
  selectedId?: UUID | null;
  excludeId?: UUID | null;
  activeOnly?: boolean;
  activitiesOnly?: boolean;
  allowNone?: boolean;
  busy?: boolean;
  onChoose: (id: UUID | null) => void;
}) {
  const { colors } = useAppTheme();
  const [folderId, setFolderId] = useState<UUID | null>(null);
  const folders = [...catalog.folders].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
  );
  const items = (
    activitiesOnly ? [...catalog.activities] : [...catalog.activities, ...catalog.routines]
  )
    .filter((item) => item.id !== excludeId && (!activeOnly || item.archivedAt === null))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const visibleItems = items.filter((item) => item.folderId === folderId);
  const visibleFolders =
    folderId === null
      ? folders.filter((folder) => !activeOnly || items.some((item) => item.folderId === folder.id))
      : [];
  const currentFolder = folders.find((folder) => folder.id === folderId);
  return (
    <View style={{ width: '100%', gap: 8 }} testID="activity-session-activity-chooser">
      {folderId ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to all activities"
          disabled={busy}
          onPress={() => setFolderId(null)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 }}
        >
          <AppIcon name="chevron-left" size={20} color={colors.textMuted} />
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>
            {currentFolder?.name ?? 'All activities'}
          </Text>
        </Pressable>
      ) : null}
      {allowNone && folderId === null ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => onChoose(null)}
          style={{
            minHeight: 54,
            justifyContent: 'center',
            padding: 16,
            borderRadius: 14,
            backgroundColor: colors.surfaceMuted,
          }}
          testID="activity-session-choice-none"
        >
          <Text style={{ color: colors.text, fontSize: 16 }}>No activity</Text>
        </Pressable>
      ) : null}
      {visibleFolders.map((folder) => (
        <FolderRow
          key={folder.id}
          folder={folder.archivedAt ? { ...folder, name: `${folder.name} (archived)` } : folder}
          disabled={busy}
          onPress={() => setFolderId(folder.id)}
          testID={`activity-session-folder-${folder.id}`}
        />
      ))}
      {visibleItems.map((item) => (
        <ActivityRow
          key={item.id}
          item={item.archivedAt ? { ...item, name: `${item.name} (archived)` } : item}
          color={resolveCatalogItem(catalog, item.id, colors.primary)?.displayColor}
          active={selectedId === item.id}
          disabled={busy}
          onPress={() => onChoose(item.id)}
          testID={`activity-session-choice-${item.id}`}
        />
      ))}
      {!visibleFolders.length && !visibleItems.length ? (
        <Text style={{ color: colors.textMuted, fontSize: 15, paddingVertical: 16 }}>
          No activities available here.
        </Text>
      ) : null}
    </View>
  );
}
