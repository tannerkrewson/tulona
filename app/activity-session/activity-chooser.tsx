import { useLocalSearchParams } from 'expo-router';

import { ActivitySessionActivityChooserScreen } from '../../src/tracker/ActivitySessionActivityChooserScreen';

export default function ActivitySessionActivityChooserRoute() {
  const { transitionId, routineId, returnToTracker } = useLocalSearchParams<{
    transitionId?: string | string[];
    routineId?: string | string[];
    returnToTracker?: string | string[];
  }>();
  const id = Array.isArray(transitionId) ? transitionId[0] : transitionId;
  const routine = Array.isArray(routineId) ? routineId[0] : routineId;
  const returnToTabs = Array.isArray(returnToTracker) ? returnToTracker[0] : returnToTracker;
  return (
    <ActivitySessionActivityChooserScreen
      returnToTracker={returnToTabs === '1'}
      routineId={routine}
      transitionId={id ?? ''}
    />
  );
}
