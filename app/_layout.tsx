import { useEffect } from 'react';
import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import { View } from 'react-native';

import { registerServiceWorker } from '@/src/pwa/registerServiceWorker';
import { RoutineStartupRestoration } from '@/src/routine/RoutineStartupRestoration';

export default function RootLayout() {
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <>
      <Head>
        <title>Tulona</title>
      </Head>
      <View role="main" style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="folder/[folderId]" />
          <Stack.Screen name="history" />
          <Stack.Screen name="activity/[activityId]" />
          <Stack.Screen name="routine/[routineId]" />
          <Stack.Screen name="routine-edit/[routineId]" />
          <Stack.Screen name="routine-chooser" />
          <Stack.Screen name="habit/[habitId]" />
          <Stack.Screen name="folder-edit/[folderId]" />
          <Stack.Screen name="backup" />
          <Stack.Screen name="onboarding" />
        </Stack>
        <RoutineStartupRestoration />
      </View>
    </>
  );
}
