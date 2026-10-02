import { useLocalSearchParams } from 'expo-router';

import HabitReviewScreen from '../src/habits/HabitReviewScreen';

export default function HabitReviewRoute() {
  const { afterRoutine, day } = useLocalSearchParams<{
    afterRoutine?: string;
    day?: string | string[];
  }>();
  return <HabitReviewScreen afterRoutine={afterRoutine === '1'} day={day} />;
}
