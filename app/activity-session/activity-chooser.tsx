import { useLocalSearchParams } from 'expo-router';

import { ActivitySessionActivityChooserScreen } from '../../src/tracker/ActivitySessionActivityChooserScreen';

export default function ActivitySessionActivityChooserRoute() {
  const { transitionId } = useLocalSearchParams<{ transitionId?: string | string[] }>();
  const id = Array.isArray(transitionId) ? transitionId[0] : transitionId;
  return <ActivitySessionActivityChooserScreen transitionId={id ?? ''} />;
}
