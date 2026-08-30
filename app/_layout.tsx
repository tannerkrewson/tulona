import { useEffect } from 'react';
import { Stack } from 'expo-router';

import { registerServiceWorker } from '@/src/pwa/registerServiceWorker';

export default function RootLayout() {
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="folder/[folderId]" />
      <Stack.Screen name="history" />
      <Stack.Screen name="activity/[activityId]" />
      <Stack.Screen name="routine/[routineId]" />
      <Stack.Screen name="habit/[habitId]" />
      <Stack.Screen name="folder-edit/[folderId]" />
      <Stack.Screen name="backup" />
    </Stack>
  );
}
