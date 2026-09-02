import { Tabs } from 'expo-router';

import { AppIcon } from '@icons';
import { useAppTheme } from '@theme';

export default function TabLayout() {
  const { colors } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          elevation: 0,
          height: 64,
          paddingBottom: 6,
          paddingTop: 6,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
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
