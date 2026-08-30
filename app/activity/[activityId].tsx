import { useLocalSearchParams } from 'expo-router';

import { CatalogEditorScreen } from '../../src/catalog';

export default function ActivityScreen() {
  const { activityId, folderId } = useLocalSearchParams<{
    activityId: string;
    folderId?: string;
  }>();
  return <CatalogEditorScreen kind="activity" id={activityId} initialFolderId={folderId ?? null} />;
}
