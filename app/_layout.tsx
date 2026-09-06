import { useEffect } from 'react';
import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import { StyleSheet, View } from 'react-native';

import { registerServiceWorker } from '@/src/pwa/registerServiceWorker';
import { BootCoordinatorGate } from '@/src/orchestration';
import { ActiveActivityBar } from '@/src/tracker';
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
        <View role="main" style={{ flex: 1 }}>
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
            <Stack.Screen name="activity/[activityId]" />
            <Stack.Screen name="activity-session/[transitionId]" />
            <Stack.Screen name="routine/[routineId]" />
            <Stack.Screen name="routine-edit/[routineId]" />
            <Stack.Screen name="routine-chooser" />
            <Stack.Screen name="habit/[habitId]" />
            <Stack.Screen name="folder-edit/[folderId]" />
            <Stack.Screen name="backup" />
            <Stack.Screen name="settings/[category]" />
          </Stack>
          <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            <BootCoordinatorGate />
            <ActiveActivityBar />
          </View>
        </View>
      </>
    </ThemeProvider>
  );
}
