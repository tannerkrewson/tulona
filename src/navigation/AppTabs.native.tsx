import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { ActiveActivityBar, supportsNativeBottomAccessory } from '@/src/tracker/ActiveActivityBar';
import { useAppTheme } from '@theme';

/**
 * Use the system tab bar on native platforms. On iOS 26+, this is the native
 * Liquid Glass tab bar; older iOS versions receive the system tab bar style
 * supported by that OS. The web/PWA keeps its intentionally styled tab bar.
 */
export default function AppTabs() {
  const { colors } = useAppTheme();
  const useBottomAccessory = Platform.OS === 'ios' && supportsNativeBottomAccessory();

  return (
    <NativeTabs
      backBehavior="none"
      disableTransparentOnScrollEdge
      iconColor={{ default: colors.textMuted, selected: colors.primary }}
      labelStyle={{ color: colors.textMuted, fontWeight: '600' }}
      minimizeBehavior="onScrollDown"
      tintColor={colors.primary}
    >
      {useBottomAccessory ? (
        <NativeTabs.BottomAccessory>
          <ActiveActivityBar placement="accessory" />
        </NativeTabs.BottomAccessory>
      ) : null}
      <NativeTabs.Trigger
        name="(tracker)"
        accessibilityLabel="Tracker tab"
        disablePopToTop
        testID="native-tracker-tab"
      >
        <NativeTabs.Trigger.Label>Tracker</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md={{ default: 'timer', selected: 'timer' }}
          sf={{ default: 'timer', selected: 'timer.circle.fill' }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="habits" accessibilityLabel="Habits tab" testID="native-habits-tab">
        <NativeTabs.Trigger.Label>Habits</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md={{ default: 'favorite_border', selected: 'favorite' }}
          sf={{ default: 'heart', selected: 'heart.fill' }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="goals" accessibilityLabel="Goals tab" testID="native-goals-tab">
        <NativeTabs.Trigger.Label>Goals</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md={{ default: 'track_changes', selected: 'track_changes' }}
          sf={{ default: 'target', selected: 'target' }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="settings"
        accessibilityLabel="Settings tab"
        testID="native-settings-tab"
      >
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md={{ default: 'settings', selected: 'settings' }}
          sf={{ default: 'gear', selected: 'gearshape.fill' }}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
