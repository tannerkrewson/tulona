import { useLocalSearchParams } from 'expo-router';

import { ActivitySessionScreen } from '../../src/tracker/ActivitySessionScreen';

export default function ActivitySessionRoute() {
  const { transitionId, action } = useLocalSearchParams<{
    transitionId: string;
    action?: string | string[];
  }>();
  const id = Array.isArray(transitionId) ? transitionId[0] : transitionId;
  const requestedAction = Array.isArray(action) ? action[0] : action;
  return (
    <ActivitySessionScreen quickSwitch={requestedAction === 'switch'} transitionId={id ?? ''} />
  );
}
