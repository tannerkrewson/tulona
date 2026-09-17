import { Column, Text } from '@expo/ui';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';

import { useAppTheme } from '@theme';
import { errorText, AppButton, IconButton, Screen } from '@ui';

import {
  displayStatus,
  loadGoalsPage,
  statusDefinition,
  StatusBadge,
  type GoalsPageData,
  ReviewPanel,
} from './GoalsScreen';

export interface GoalReviewScreenProps {
  goalId: string;
}

export function GoalReviewScreen({ goalId }: GoalReviewScreenProps) {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [resource, setResource] = useState<GoalsPageData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadGoalsPage()
      .then((nextResource) => {
        if (!cancelled) setResource(nextResource);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(errorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, [goalId]);

  if (!resource) {
    return (
      <Screen onBack={() => router.back()} title="Review">
        <Text
          textStyle={{
            color: loadError ? colors.danger.foreground : colors.textMuted,
            fontSize: 15,
          }}
        >
          {loadError ?? 'Loading review...'}
        </Text>
      </Screen>
    );
  }

  const goal = resource.goals.find((candidate) => candidate.id === goalId);
  if (!goal) {
    return (
      <Screen onBack={() => router.back()} title="Review">
        <Text
          textStyle={{ color: colors.danger.foreground, fontSize: 15 }}
          testID="goal-review-not-found"
        >
          This goal no longer exists.
        </Text>
      </Screen>
    );
  }

  const editButton = (
    <IconButton
      icon="pencil"
      label="Edit goal"
      onPress={() => router.push(`/goal-edit/${goal.id}` as Href)}
      testID="goal-review-edit"
      variant="plain"
    />
  );

  if (goal.evaluationMode === 'manual') {
    return (
      <Screen headerRight={editButton} onBack={() => router.back()} title={goal.title}>
        <ReviewPanel
          currentSnapshot={resource.currentSnapshot}
          currentWeek={resource.currentWeek}
          goals={[goal]}
          onCancel={() => router.back()}
          onSaved={async () => {
            router.back();
          }}
          service={resource.runtime.goalService}
          settings={resource.goalSettings}
        />
      </Screen>
    );
  }

  const status = displayStatus(goal, resource.currentSnapshot);
  const definition = statusDefinition(resource.goalSettings, status?.statusId);
  return (
    <Screen headerRight={editButton} onBack={() => router.back()} title={goal.title}>
      <Column
        spacing={14}
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: 14,
          borderWidth: 1,
          padding: 16,
          width: '100%',
        }}
        testID="goal-automatic-review"
      >
        <Text textStyle={{ color: colors.text, fontSize: 19, fontWeight: '700' }}>
          Current result
        </Text>
        <StatusBadge definition={definition} label={definition?.name ?? 'No result yet'} />
        <AppButton
          label="Edit goal"
          onPress={() => router.push(`/goal-edit/${goal.id}` as Href)}
          testID="goal-automatic-review-edit"
          variant="outlined"
        />
      </Column>
    </Screen>
  );
}
