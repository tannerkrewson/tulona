import { useLocalSearchParams } from 'expo-router';

import SettingsCategoryScreen from '../../src/settings/SettingsCategoryScreen';

export default function SettingsCategoryRoute() {
  const { category, returnFromDropbox } = useLocalSearchParams<{
    category?: string | string[];
    returnFromDropbox?: string | string[];
  }>();
  return <SettingsCategoryScreen categoryId={category} returnFromDropbox={returnFromDropbox} />;
}
