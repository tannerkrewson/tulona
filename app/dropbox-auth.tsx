import { Column, Text } from '@expo/ui';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';

import { errorText, AppButton, Screen } from '@ui';
import { useAppTheme } from '@theme';
import { loadBackupRuntime } from '../src/backup/backup-runtime';

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default function DropboxAuthRoute() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string | string[];
    state?: string | string[];
    error?: string | string[];
    error_description?: string | string[];
  }>();
  const [message, setMessage] = useState('Finishing Dropbox connection...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const code = firstParam(params.code);
    const state = firstParam(params.state);
    const oauthError = firstParam(params.error_description) ?? firstParam(params.error);
    void loadBackupRuntime()
      .then(async ({ dropboxBackupService }) => {
        if (oauthError) throw new Error(`Dropbox authorization was not completed: ${oauthError}`);
        if (!code || !state) throw new Error('Dropbox authorization did not return a code.');
        await dropboxBackupService.completeAuthorization(code, state);
        await dropboxBackupService.syncNow();
      })
      .then(() => {
        if (cancelled) return;
        router.replace('/settings/data' as Href);
      })
      .catch((actionError: unknown) => {
        if (cancelled) return;
        setError(errorText(actionError));
        setMessage('Dropbox connection needs attention.');
      });
    return () => {
      cancelled = true;
    };
  }, [params.code, params.error, params.error_description, params.state, router]);

  return (
    <Screen onBack={() => router.replace('/settings/data' as Href)} title="Dropbox">
      <Column spacing={14} style={{ width: '100%' }}>
        <Text
          textStyle={{ color: error ? colors.danger.foreground : colors.textMuted, fontSize: 16 }}
        >
          {error ?? message}
        </Text>
        {error ? (
          <AppButton
            label="Return to Data"
            onPress={() => router.replace('/settings/data' as Href)}
            style={{ width: '100%' }}
            testID="dropbox-auth-return"
          />
        ) : null}
      </Column>
    </Screen>
  );
}
