import { NativeTabs } from 'expo-router/native-tabs';

import {
  ActiveActivityAccessory,
  supportsNativeBottomAccessory,
  useActiveActivityRuntime,
  useHasActivitySession,
} from '@/src/tracker/ActiveActivityBar';
import type { RoutineRuntime } from '@/src/routine/routine-runtime';
import { useAppTheme } from '@theme';

function AccessoryContent({ runtime }: { runtime: RoutineRuntime }) {
  const placement = NativeTabs.BottomAccessory.usePlacement();
  return <ActiveActivityAccessory accessoryPlacement={placement} runtime={runtime} />;
}

/**
 * Use the system tab bar on native platforms, including its current iOS glass
 * treatment. The web target continues to use the JavaScript tab implementation.
 */
export default function AppTabs() {
  const { colors } = useAppTheme();
  const accessorySupported = supportsNativeBottomAccessory();
  const runtime = useActiveActivityRuntime(accessorySupported);
  const hasSession = useHasActivitySession(runtime);

  return (
    <NativeTabs
      backBehavior="none"
      disableTransparentOnScrollEdge
      iconColor={{ default: colors.textMuted, selected: colors.primary }}
      labelStyle={{ color: colors.textMuted, fontWeight: '600' }}
      minimizeBehavior="onScrollDown"
      tintColor={colors.primary}
    >
      {accessorySupported && runtime && hasSession ? (
        <NativeTabs.BottomAccessory>
          <AccessoryContent runtime={runtime} />
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
