import { Paths } from 'expo-file-system';

export const WIDGET_APP_GROUP = 'group.com.tannerkrewson.tulona';

/**
 * Whether iOS granted this install the App Group the widget reads from.
 * Re-signing an IPA with a profile that lacks the group silently removes it.
 */
export function widgetSharedStorageAvailable(): boolean | null {
  try {
    return WIDGET_APP_GROUP in Paths.appleSharedContainers;
  } catch {
    return false;
  }
}
