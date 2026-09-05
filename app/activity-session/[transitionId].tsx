import { useLocalSearchParams } from 'expo-router';

import { ActivitySessionScreen } from '../../src/tracker/ActivitySessionScreen';

export default function ActivitySessionRoute() {
  const { transitionId } = useLocalSearchParams<{ transitionId: string }>();
  const id = Array.isArray(transitionId) ? transitionId[0] : transitionId;
  return <ActivitySessionScreen transitionId={id ?? ''} />;
}
