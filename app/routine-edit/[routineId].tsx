import { useLocalSearchParams } from 'expo-router';

import { RoutineEditorScreen } from '../../src/routine/RoutineEditorScreen';

export default function RoutineEditScreen() {
  const { routineId } = useLocalSearchParams<{ routineId: string }>();
  return <RoutineEditorScreen id={routineId} />;
}
