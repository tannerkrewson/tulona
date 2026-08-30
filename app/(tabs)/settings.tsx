import { Button, Column, Text } from '@expo/ui';
import { useRouter } from 'expo-router';

import { useAppTheme } from '@theme';
import { Screen } from '@ui';

export default function SettingsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  return (
    <Screen title="Settings" description="App settings live on this device.">
      <Column spacing={12} style={{ width: '100%' }}>
        <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>
          Preferences will be added separately. Manage portable data from Backup & restore.
        </Text>
        <Button
          label="Backup & restore"
          onPress={() => router.push('/backup')}
          testID="open-backup"
        />
      </Column>
    </Screen>
  );
}
