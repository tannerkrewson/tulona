import { Stack } from 'expo-router';

export default function RootLayout() {
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
