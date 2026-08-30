import { Button, Column, Row, Text } from '@expo/ui';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import type { ActiveRoutine, CatalogCollection, RoutineDefinition } from '@domain';
import { AppIcon, type IconName } from '@icons';
import { useAppTheme } from '@theme';
import { Screen } from '@ui';

import { loadRoutineRuntime } from './routine-runtime';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function RoutineCatalogScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const [catalog, setCatalog] = useState<CatalogCollection | null>(null);
  const [active, setActive] = useState<ActiveRoutine | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadRoutineRuntime()
      .then(async (runtime) => ({
        catalog: await runtime.catalogService.read(),
        active: await runtime.routineService.recover(),
      }))
      .then(({ catalog: nextCatalog, active: nextActive }) => {
        if (cancelled) return;
        setCatalog(nextCatalog);
        setActive(nextActive);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(errorText(loadError));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!catalog) {
    return (
      <Screen title="Tracker" description="Your activity catalog and routines">
        <Column
          spacing={6}
          style={{
            backgroundColor: colors.danger.background,
            borderColor: colors.danger.foreground,
            borderRadius: 14,
            borderWidth: 1,
            padding: 16,
            width: '100%',
          }}
        >
          <Text
            textStyle={{ color: error ? colors.danger.foreground : colors.textMuted, fontSize: 15 }}
          >
            {error ?? 'Loading catalog...'}
          </Text>
        </Column>
      </Screen>
    );
  }

  const routines = catalog.routines
    .filter((routine) => routine.archivedAt === null)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const activeRoutine =
    active && (active.status === 'running' || active.status === 'paused') ? active : null;

  return (
    <Screen
      title="Tracker"
      description="Start a routine or continue the persisted current activity."
    >
      <Column spacing={14} style={{ width: '100%' }}>
        {active?.status === 'awaiting-next-activity' ? (
          <Column
            spacing={8}
            style={{
              backgroundColor: colors.warning.background,
              borderColor: colors.warning.foreground,
              borderRadius: 14,
              borderWidth: 1,
              padding: 16,
              width: '100%',
            }}
          >
            <Text textStyle={{ color: colors.warning.foreground, fontSize: 16, fontWeight: '700' }}>
              Routine complete
            </Text>
            <Text textStyle={{ color: colors.warning.foreground, fontSize: 14 }}>
              Choose the next activity to finish this transition.
            </Text>
            <Button
              label="Open next-activity chooser"
              onPress={() => router.push('/routine-chooser')}
              testID="open-chooser-from-tracker"
            />
          </Column>
        ) : null}
        {activeRoutine ? (
          <Column
            spacing={8}
            style={{
              backgroundColor: colors.active.background,
              borderColor: colors.active.foreground,
              borderRadius: 14,
              borderWidth: 1,
              padding: 16,
              width: '100%',
            }}
          >
            <Text textStyle={{ color: colors.active.foreground, fontSize: 16, fontWeight: '700' }}>
              {`${activeRoutine.routineSnapshot.name} is ${activeRoutine.status}`}
            </Text>
            <Button
              label="Return to runner"
              onPress={() => router.push(`/routine/${activeRoutine.routineId}`)}
              testID="return-to-runner"
            />
          </Column>
        ) : null}
        <Row alignment="center" spacing={10}>
          <Text textStyle={{ color: colors.text, fontSize: 21, fontWeight: '700' }}>Routines</Text>
          <Button
            label="New routine"
            onPress={() => router.push('/routine-edit/new')}
            testID="new-routine"
          />
        </Row>
        {routines.map((routine) => (
          <RoutineCatalogItem
            key={routine.id}
            routine={routine}
            disabled={activeRoutine !== null || active?.status === 'awaiting-next-activity'}
            onRun={() => {
              void startRoutine(routine);
            }}
            onEdit={() => router.push(`/routine-edit/${routine.id}`)}
          />
        ))}
        {routines.length === 0 ? (
          <Text textStyle={{ color: colors.textMuted, fontSize: 15 }}>
            No routines yet. Create one and add ordered steps in the editor.
          </Text>
        ) : null}
      </Column>
    </Screen>
  );

  async function startRoutine(routine: RoutineDefinition): Promise<void> {
    try {
      const runtime = await loadRoutineRuntime();
      const started = await runtime.routineService.startRoutine(routine.id);
      router.push(`/routine/${started.routineId}`);
    } catch (startError) {
      setError(errorText(startError));
    }
  }
}

function RoutineCatalogItem({
  routine,
  disabled,
  onRun,
  onEdit,
}: {
  routine: RoutineDefinition;
  disabled: boolean;
  onRun: () => void;
  onEdit: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Column
      spacing={10}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 14,
        borderWidth: 1,
        padding: 14,
        width: '100%',
      }}
    >
      <Row alignment="center" spacing={10}>
        <AppIcon
          name={(routine.iconName || 'repeat') as IconName}
          color={colors.primary}
          size={25}
        />
        <Column spacing={3} style={{ width: '100%' }}>
          <Text textStyle={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>
            {routine.name}
          </Text>
          <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
            {`${routine.steps.length} ${routine.steps.length === 1 ? 'step' : 'steps'}`}
          </Text>
        </Column>
      </Row>
      <Row alignment="center" spacing={8}>
        <Button
          disabled={disabled || routine.steps.length === 0}
          label="Start"
          onPress={onRun}
          testID={`start-routine-${routine.id}`}
        />
        <Button
          disabled={disabled}
          label="Edit"
          onPress={onEdit}
          variant="outlined"
          testID={`edit-routine-${routine.id}`}
        />
      </Row>
    </Column>
  );
}
