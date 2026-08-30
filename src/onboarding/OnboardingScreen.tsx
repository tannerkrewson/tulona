import { Button, Column, Text } from '@expo/ui';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { useAppTheme } from '@theme';
import { Screen } from '@ui';

import { loadOnboardingService } from './onboarding-runtime';
import type { OnboardingService, OnboardingStatus } from './onboarding-service';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ErrorPanel({ message }: { message: string | null }) {
  const { colors } = useAppTheme();
  if (!message) return null;
  return (
    <Column
      spacing={6}
      style={{
        backgroundColor: colors.danger.background,
        borderColor: colors.danger.foreground,
        borderRadius: 14,
        borderWidth: 1,
        padding: 14,
        width: '100%',
      }}
      testID="onboarding-error"
    >
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 15, fontWeight: '700' }}>
        Setup could not be completed
      </Text>
      <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{message}</Text>
    </Column>
  );
}

export default function OnboardingScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const [service, setService] = useState<OnboardingService | null>(null);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadOnboardingService()
      .then(async (nextService) => ({ service: nextService, status: await nextService.status() }))
      .then((result) => {
        if (!cancelled) {
          setService(result.service);
          setStatus(result.status);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(errorText(loadError));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = async (choice: 'empty' | 'starter') => {
    if (!service) return;
    setBusy(true);
    setError(null);
    try {
      const result =
        choice === 'empty' ? await service.startEmpty() : await service.startWithStarterData();
      if (result.starterData) {
        setStatus('complete');
      }
      router.replace('/(tabs)');
    } catch (choiceError) {
      setError(errorText(choiceError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title="Welcome to Tulona"
      description="Choose how to start this device's local workspace."
    >
      <Column spacing={16} style={{ width: '100%' }} testID="onboarding-choice">
        <Column
          spacing={8}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 18,
            borderWidth: 1,
            padding: 18,
            width: '100%',
          }}
        >
          <Text textStyle={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>
            Start empty
          </Text>
          <Text textStyle={{ color: colors.textMuted, fontSize: 15, lineHeight: 22 }}>
            Create a blank workspace and add only the activities, routines, and habits you want.
          </Text>
          <Button
            disabled={busy || service === null || status === 'complete'}
            label="Start empty"
            onPress={() => void choose('empty')}
            testID="onboarding-start-empty"
          />
        </Column>
        <Column
          spacing={8}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 18,
            borderWidth: 1,
            padding: 18,
            width: '100%',
          }}
        >
          <Text textStyle={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>
            Add starter activities
          </Text>
          <Text textStyle={{ color: colors.textMuted, fontSize: 15, lineHeight: 22 }}>
            Add a small editable set for morning routine, work, exercise, eating, errands, and
            leisure, including TV, video games, and reading.
          </Text>
          <Button
            disabled={busy || service === null || status === 'complete'}
            label="Add starter activities"
            onPress={() => void choose('starter')}
            testID="onboarding-add-starter"
          />
        </Column>
        {status === 'complete' ? (
          <Button
            disabled={busy}
            label="Continue to Tulona"
            onPress={() => router.replace('/(tabs)')}
            testID="onboarding-continue"
            variant="outlined"
          />
        ) : null}
        <ErrorPanel message={error} />
      </Column>
    </Screen>
  );
}
