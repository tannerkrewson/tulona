import { Tabs } from 'expo-router';
import { Platform, View } from 'react-native';

import { AppIcon } from '@icons';
import { useAppTheme } from '@theme';
import { isIOSSafari } from '@ui';

export default function TabLayout() {
  const { colors } = useAppTheme();
  const isWeb = Platform.OS === 'web';
  const iOSSafari = isIOSSafari();
  // Live CSS variables keep the natively-rendered tab bar in sync with the
  // theme even when React Navigation serves cached route options. The
  // safe-area inset is only enabled for iOS Safari and installed iOS PWAs.
  const webSurface = 'var(--tulona-surface)';
  const webBorder = 'var(--tulona-border)';
  const webTabActive = 'var(--tulona-tab-active)';
  const webTabInactive = 'var(--tulona-tab-inactive)';
  const safeAreaBottom = 'var(--tulona-safe-area-bottom)';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: isWeb ? webTabActive : colors.primary,
        tabBarInactiveTintColor: isWeb ? webTabInactive : colors.textMuted,
        tabBarStyle: {
          backgroundColor: isWeb ? webSurface : colors.surface,
          borderTopColor: isWeb ? webBorder : colors.border,
          borderTopWidth: 1,
          elevation: 0,
          height: iOSSafari ? (`calc(64px + ${safeAreaBottom})` as unknown as number) : 64,
          paddingBottom: iOSSafari ? (`calc(6px + ${safeAreaBottom})` as unknown as number) : 6,
          paddingTop: 6,
          shadowOpacity: 0,
        },
        tabBarBackground: () => (
          <View
            style={{
              backgroundColor: isWeb ? webSurface : colors.surface,
              flex: 1,
            }}
          />
        ),
        tabBarLabelStyle: { flexShrink: 0, fontSize: 11, fontWeight: '600', lineHeight: 14 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Tracker',
          tabBarAccessibilityLabel: 'Tracker tab',
          tabBarIcon: ({ color, focused, size }) => (
            <AppIcon
              name="activity"
              color={isWeb ? (focused ? webTabActive : webTabInactive) : color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="habits"
        options={{
          title: 'Habits',
          tabBarAccessibilityLabel: 'Habits tab',
          tabBarIcon: ({ color, focused, size }) => (
            <AppIcon
              name="heart"
              color={isWeb ? (focused ? webTabActive : webTabInactive) : color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarAccessibilityLabel: 'Insights tab',
          tabBarIcon: ({ color, focused, size }) => (
            <AppIcon
              name="bar-chart-3"
              color={isWeb ? (focused ? webTabActive : webTabInactive) : color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarAccessibilityLabel: 'Settings tab',
          tabBarIcon: ({ color, focused, size }) => (
            <AppIcon
              name="settings"
              color={isWeb ? (focused ? webTabActive : webTabInactive) : color}
              size={size}
            />
          ),
        }}
      />
    </Tabs>
  );
}
