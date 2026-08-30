import { useLocalSearchParams } from 'expo-router';

import { CatalogEditorScreen } from '../../src/catalog';

export default function ActivityScreen() {
  const { activityId } = useLocalSearchParams<{ activityId: string }>();
  return <CatalogEditorScreen kind="activity" id={activityId} />;
}
