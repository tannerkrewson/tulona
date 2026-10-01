import { Column, Text } from '@ui/primitives';
import { usePathname, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { exportRawDataJson } from '../backup/export-file';
import { AppButton, confirmAction, errorText, Screen } from '@ui';
import { useAppTheme, useThemePreference } from '@theme';

import {
  bootCoordinator,
  destinationAfterBoot,
  type BootCoordinatorError,
  type BootDestination,
  type BootHydrationResult,
} from './boot-coordinator';

type GateState =
  | { kind: 'hydrating' }
  | { kind: 'ready'; result: BootHydrationResult }
  | { kind: 'error'; error: unknown };

export function destinationPath(destination: BootDestination): Href {
  switch (destination.kind) {
    case 'tabs':
      return '/';
    case 'runner':
      return `/routine/${destination.routineId}`;
    case 'chooser':
      return '/routine-chooser';
  }
}

function stageLabel(error: unknown): string {
  if (error instanceof Error && 'stage' in error) {
    return String((error as BootCoordinatorError).stage);
  }
  return 'startup';
}

export function BootCoordinatorGate() {
  const { colors } = useAppTheme();
  const { setAppearance } = useThemePreference();
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<GateState>({ kind: 'hydrating' });
  const [rawError, setRawError] = useState<string | null>(null);
  const [clearBusy, setClearBusy] = useState(false);
  const destinationApplied = useRef(false);

  const hydrate = useCallback(() => {
    destinationApplied.current = false;
    setRawError(null);
    setState({ kind: 'hydrating' });
    void bootCoordinator
      .hydrate()
      .then((result) => setState({ kind: 'ready', result }))
      .catch((error: unknown) => setState({ kind: 'error', error }));
  }, []);

  const retry = hydrate;

  const clearLocalData = () => {
    if (clearBusy) return;
    setRawError(null);
    setClearBusy(true);
    void bootCoordinator
      .clearAllData()
      .catch((error: unknown) => setRawError(errorText(error)))
      .finally(() => setClearBusy(false));
  };

  useEffect(() => {
    const unsubscribe = bootCoordinator.subscribeToReset(hydrate);
    void Promise.resolve().then(hydrate);
    return unsubscribe;
  }, [hydrate]);

  useEffect(() => {
    if (state.kind !== 'ready' || destinationApplied.current) return;
    destinationApplied.current = true;
    const target = destinationAfterBoot(state.result.destination, pathname);
    if (target) router.replace(target as Href);
  }, [pathname, router, state]);

  useEffect(() => {
    if (state.kind !== 'ready') return;
    setAppearance(state.result.runtime?.settings.appearance ?? 'system');
  }, [setAppearance, state]);

  if (state.kind === 'ready') return null;
  if (state.kind === 'hydrating') {
    return (
      <Screen testID="boot-hydrating">
        <Column alignment="center" spacing={12} style={{ width: '100%' }}>
          <Text textStyle={{ color: colors.primary, fontSize: 24, fontWeight: '800' }}>
            Restoring Tulona
          </Text>
          <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>
            Checking local data before opening the app...
          </Text>
        </Column>
      </Screen>
    );
  }

  const category = errorText(state.error);
  return (
    <>
      <Screen testID="boot-error">
        <Column alignment="center" spacing={14} style={{ width: '100%' }}>
          <Text textStyle={{ color: colors.danger.foreground, fontSize: 24, fontWeight: '800' }}>
            Tulona needs recovery
          </Text>
          <Column
            spacing={8}
            style={{
              backgroundColor: colors.danger.background,
              borderColor: colors.danger.foreground,
              borderRadius: 14,
              borderWidth: 1,
              padding: 16,
              width: '100%',
            }}
          >
            <Text textStyle={{ color: colors.danger.foreground, fontSize: 15, fontWeight: '700' }}>
              {`Startup ${stageLabel(state.error)} failed`}
            </Text>
            <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{category}</Text>
            <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>
              Local data was not deleted or replaced.
            </Text>
          </Column>
          {rawError ? (
            <Text textStyle={{ color: colors.danger.foreground, fontSize: 14 }}>{rawError}</Text>
          ) : null}
          <AppButton label="Retry startup" onPress={retry} testID="boot-retry" />
          <AppButton
            label="Export raw local data"
            onPress={() => {
              setRawError(null);
              void bootCoordinator
                .exportRawData()
                .then((content) => exportRawDataJson(content))
                .catch((error: unknown) => setRawError(errorText(error)));
            }}
            testID="boot-export-raw"
            variant="outlined"
          />
          <AppButton
            disabled={clearBusy}
            label="Clear local data"
            onPress={() =>
              void confirmAction({
                confirmLabel: 'Clear Local Data',
                destructive: true,
                message: 'This clears all local data and restarts with an empty workspace.',
                title: 'Clear Local Data?',
              }).then((confirmed) => {
                if (confirmed) clearLocalData();
              })
            }
            testID="boot-clear-local-data"
            variant="outlined"
          />
        </Column>
      </Screen>
    </>
  );
}
