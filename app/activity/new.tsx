import { useLocalSearchParams } from 'expo-router';

import { CatalogEditorScreen } from '../../src/catalog';

export default function NewActivityScreen() {
  const { folderId } = useLocalSearchParams<{ folderId?: string }>();
  return <CatalogEditorScreen kind="activity" id="new" initialFolderId={folderId ?? null} />;
}
