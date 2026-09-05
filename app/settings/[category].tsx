import { useLocalSearchParams } from 'expo-router';

import SettingsCategoryScreen from '../../src/settings/SettingsCategoryScreen';

export default function SettingsCategoryRoute() {
  const { category } = useLocalSearchParams<{ category?: string | string[] }>();
  return <SettingsCategoryScreen categoryId={category} />;
}
