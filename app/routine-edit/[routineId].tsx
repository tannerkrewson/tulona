import { useLocalSearchParams } from 'expo-router';

import { RoutineEditorScreen } from '../../src/routine/RoutineEditorScreen';

export default function RoutineEditScreen() {
  const { routineId, folderId } = useLocalSearchParams<{
    routineId: string;
    folderId?: string;
  }>();
  return <RoutineEditorScreen id={routineId} initialFolderId={folderId ?? null} />;
}
