import { Tabs } from 'expo-router';
import { Platform, View } from 'react-native';

import { AppIcon } from '@icons';
import { useAppTheme } from '@theme';

/** The styled web tab bar remains the web/PWA navigation surface. */
export default function AppTabs() {
  const { colors } = useAppTheme();
  const isWeb = Platform.OS === 'web';
  // Live CSS variables keep the web tab bar in sync with the theme even when
  // React Navigation serves cached route options. The root stylesheet gates
  // the safe-area token before this navigator mounts.
  const webSurface = 'var(--tulona-surface)';
  const webBorder = 'var(--tulona-border)';
  const webTabActive = 'var(--tulona-tab-active)';
  const webTabInactive = 'var(--tulona-tab-inactive)';
  const safeAreaBottom = 'var(--tulona-safe-area-bottom)';

  return (
    <Tabs
      // Switching top-level tabs should replace the current destination rather
      // than create browser history that iOS Safari can reveal with an edge
      // swipe. The tracker stack owns the folder back gesture.
      backBehavior="none"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: isWeb ? webTabActive : colors.primary,
        tabBarInactiveTintColor: isWeb ? webTabInactive : colors.textMuted,
        tabBarStyle: {
          backgroundColor: isWeb ? webSurface : colors.surface,
          borderTopColor: isWeb ? webBorder : colors.border,
          borderTopWidth: 1,
          elevation: 0,
          height: (isWeb ? `calc(64px + ${safeAreaBottom})` : 64) as unknown as number,
          paddingBottom: (isWeb ? `calc(6px + ${safeAreaBottom})` : 6) as unknown as number,
          paddingTop: 6,
          boxShadow: 'none',
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
        name="(tracker)"
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
        name="goals"
        options={{
          title: 'Goals',
          tabBarAccessibilityLabel: 'Goals tab',
          tabBarIcon: ({ color, focused, size }) => (
            <AppIcon
              name="award"
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
