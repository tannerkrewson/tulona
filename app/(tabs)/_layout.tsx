import { Tabs } from 'expo-router';
import { Platform, View } from 'react-native';

import { AppIcon } from '@icons';
import { useAppTheme } from '@theme';
import { isIOSSafari } from '@ui';

export default function TabLayout() {
  const { colors } = useAppTheme();
  const iOSSafari = isIOSSafari();
  const webSurface =
    Platform.OS === 'web' ? ('var(--tulona-surface)' as unknown as string) : colors.surface;
  const webBorder =
    Platform.OS === 'web' ? ('var(--tulona-border)' as unknown as string) : colors.border;
  const safeAreaBottom = 'var(--tulona-safe-area-bottom)';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: webSurface,
          borderTopColor: webBorder,
          borderTopWidth: 1,
          elevation: 0,
          height: iOSSafari ? (`calc(64px + ${safeAreaBottom})` as unknown as number) : 64,
          paddingBottom: iOSSafari ? (`calc(6px + ${safeAreaBottom})` as unknown as number) : 6,
          paddingTop: 6,
          shadowOpacity: 0,
        },
        tabBarBackground: () => <View style={{ backgroundColor: webSurface, flex: 1 }} />,
        tabBarLabelStyle: { flexShrink: 0, fontSize: 11, fontWeight: '600', lineHeight: 14 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Tracker',
          tabBarAccessibilityLabel: 'Tracker tab',
          tabBarIcon: ({ color, size }) => <AppIcon name="activity" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="habits"
        options={{
          title: 'Habits',
          tabBarAccessibilityLabel: 'Habits tab',
          tabBarIcon: ({ color, size }) => <AppIcon name="heart" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarAccessibilityLabel: 'Insights tab',
          tabBarIcon: ({ color, size }) => <AppIcon name="bar-chart-3" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarAccessibilityLabel: 'Settings tab',
          tabBarIcon: ({ color, size }) => <AppIcon name="settings" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
