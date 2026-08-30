import { useLocalSearchParams } from 'expo-router';

import { RoutineEditorScreen } from '../../src/routine/RoutineEditorScreen';

export default function NewRoutineScreen() {
  const { folderId } = useLocalSearchParams<{ folderId?: string }>();
  return <RoutineEditorScreen id="new" initialFolderId={folderId ?? null} />;
}
