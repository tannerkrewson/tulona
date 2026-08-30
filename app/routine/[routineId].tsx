import { useLocalSearchParams } from 'expo-router';

import { RoutineRunnerScreen } from '../../src/routine/RoutineRunnerScreen';

export default function RoutineScreen() {
  const { routineId } = useLocalSearchParams<{ routineId: string }>();
  return <RoutineRunnerScreen routineId={routineId} />;
}
