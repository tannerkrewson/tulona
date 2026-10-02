import '@/src/setup/ignore-logs';

import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { BootCoordinatorGate } from '@/src/orchestration';
import { ActiveActivityBar } from '@/src/tracker';
import { ActiveActivityWidgetBridge } from '@/src/widgets/ActiveActivityWidgetBridge';
import { registerServiceWorker } from '@/src/pwa/registerServiceWorker';
import { ThemeProvider } from '@theme';
export default function RootLayout() {
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <ThemeProvider>
      <>
        <Head>
          <title>Tulona</title>
        </Head>
        <GestureHandlerRootView role="main" style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen
              name="(tabs)"
              options={{
                // The tab navigator is the root destination. Never let an
                // edge swipe pop it while leaving nested route gestures on.
                gestureEnabled: false,
              }}
            />
            <Stack.Screen name="history" />
            <Stack.Screen name="goal-edit/[goalId]" />
            <Stack.Screen name="goal-review/[goalId]" />
            <Stack.Screen name="activity/[activityId]" />
            <Stack.Screen
              name="activity-session/[transitionId]"
              options={{
                animation: 'slide_from_bottom',
                contentStyle: { backgroundColor: 'transparent' },
                gestureEnabled: false,
                presentation: 'transparentModal',
              }}
            />
            <Stack.Screen name="activity-session/activity-chooser" />
            <Stack.Screen
              name="routine/[routineId]"
              // An active routine is left only through its stop menu.
              options={{ gestureEnabled: false }}
            />
            <Stack.Screen name="routine-edit/[routineId]" />
            <Stack.Screen name="routine-chooser" />
            <Stack.Screen name="habit/[habitId]" />
            <Stack.Screen name="habit-import" />
            <Stack.Screen name="habit-review" />
            <Stack.Screen name="folder-edit/[folderId]" />
            <Stack.Screen name="backup" />
            <Stack.Screen name="dropbox-auth" />
            <Stack.Screen name="settings/[category]" />
          </Stack>
          <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            <BootCoordinatorGate />
            <ActiveActivityWidgetBridge />
            <ActiveActivityBar />
          </View>
        </GestureHandlerRootView>
      </>
    </ThemeProvider>
  );
}
