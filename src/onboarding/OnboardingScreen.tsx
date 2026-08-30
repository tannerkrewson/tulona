import { Column, Text } from '@expo/ui';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAppTheme } from '@theme';
import { AppButton, errorText, Screen } from '@ui';
import { bootCoordinator } from '../orchestration';
import { RecoveryActions } from '../orchestration/RecoveryActions';

import { loadOnboardingService } from './onboarding-runtime';
import type { OnboardingService, OnboardingStatus } from './onboarding-service';

function ErrorPanel({
  message,
  onRetry,
  onBack,
}: {
  message: string | null;
  onRetry: () => void;
  onBack: () => void;
}) {
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
      <RecoveryActions onBack={onBack} onRetry={onRetry} testID="onboarding-recovery" />
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
  const lastChoice = useRef<'empty' | 'starter' | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setError(null);
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

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void Promise.resolve().then(() => {
      if (!disposed) cleanup = load();
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [load]);

  const choose = async (choice: 'empty' | 'starter') => {
    if (!service) return;
    lastChoice.current = choice;
    setBusy(true);
    setError(null);
    try {
      const result =
        choice === 'empty' ? await service.startEmpty() : await service.startWithStarterData();
      if (result.starterData) {
        setStatus('complete');
      }
      bootCoordinator.reset();
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
          <AppButton
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
          <AppButton
            disabled={busy || service === null || status === 'complete'}
            label="Add starter activities"
            onPress={() => void choose('starter')}
            testID="onboarding-add-starter"
          />
        </Column>
        {status === 'complete' ? (
          <AppButton
            disabled={busy}
            label="Continue to Tulona"
            onPress={() => router.replace('/(tabs)')}
            testID="onboarding-continue"
            variant="outlined"
          />
        ) : null}
        <ErrorPanel
          message={error}
          onBack={() => router.replace('/(tabs)')}
          onRetry={() => {
            if (service && lastChoice.current) void choose(lastChoice.current);
            else load();
          }}
        />
      </Column>
    </Screen>
  );
}
