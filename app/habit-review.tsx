import { useLocalSearchParams } from 'expo-router';

import HabitReviewScreen from '../src/habits/HabitReviewScreen';

export default function HabitReviewRoute() {
  const { day } = useLocalSearchParams<{ day?: string | string[] }>();
  return <HabitReviewScreen day={day} />;
}
