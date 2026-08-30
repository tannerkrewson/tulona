import { useLocalSearchParams } from 'expo-router';

import { CatalogEditorScreen } from '../../src/catalog';

export default function FolderEditScreen() {
  const { folderId } = useLocalSearchParams<{ folderId: string }>();
  return <CatalogEditorScreen kind="folder" id={folderId} />;
}
