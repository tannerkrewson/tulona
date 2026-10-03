import { Stack } from 'expo-router';
import { useAppTheme } from '@theme';

export default function TrackerStackLayout() {
  const { colors } = useAppTheme();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
    >
      <Stack.Screen name="index" options={{ gestureEnabled: false }} />
      <Stack.Screen
        name="folder/[folderId]"
        options={{ animation: 'slide_from_right', gestureEnabled: true }}
      />
    </Stack>
  );
}
