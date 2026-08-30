import { useLocalSearchParams } from 'expo-router';

import { HabitDetailScreen } from '../../src/habits/HabitDetailScreen';
import { HabitEditorScreen } from '../../src/habits/HabitEditorScreen';

export default function HabitScreen() {
  const { habitId, edit } = useLocalSearchParams<{ habitId: string; edit?: string }>();
  if (habitId === 'new' || edit === '1') return <HabitEditorScreen id={habitId} />;
  return <HabitDetailScreen id={habitId} />;
}
