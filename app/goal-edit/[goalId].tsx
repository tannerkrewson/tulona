import { useLocalSearchParams } from 'expo-router';

import { GoalEditorScreen } from '../../src/goals/GoalEditorScreen';

export default function GoalEditRoute() {
  const { goalId } = useLocalSearchParams<{ goalId: string }>();
  return <GoalEditorScreen goalId={goalId} />;
}
