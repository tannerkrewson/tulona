import { useLocalSearchParams } from 'expo-router';

import { FolderContentScreen } from '../../src/tracker/FolderContentScreen';

export default function FolderScreen() {
  const { folderId } = useLocalSearchParams<{ folderId: string }>();
  return <FolderContentScreen folderId={folderId} />;
}
