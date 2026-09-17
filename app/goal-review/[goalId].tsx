import { useLocalSearchParams } from 'expo-router';

import { GoalReviewScreen } from '../../src/goals/GoalReviewScreen';

export default function GoalReviewRoute() {
  const { goalId } = useLocalSearchParams<{ goalId: string }>();
  return <GoalReviewScreen goalId={goalId} />;
}
