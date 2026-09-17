import { Column, Text } from '@expo/ui';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';

import { useAppTheme } from '@theme';
import { errorText, AppButton, Screen } from '@ui';

import { GoalEditor, loadGoalsPage, type GoalsPageData } from './GoalsScreen';

export interface GoalEditorScreenProps {
  goalId: string;
}

export function GoalEditorScreen({ goalId }: GoalEditorScreenProps) {
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
      <Screen onBack={() => router.back()} title={goalId === 'new' ? 'New goal' : 'Edit goal'}>
        <Column spacing={12} style={{ width: '100%' }} testID="goal-editor-loading">
          <Text
            textStyle={{
              color: loadError ? colors.danger.foreground : colors.textMuted,
              fontSize: 15,
            }}
          >
            {loadError ?? 'Loading goal...'}
          </Text>
          {loadError ? (
            <AppButton
              label="Retry"
              onPress={() => router.replace(`/goal-edit/${goalId}` as Href)}
            />
          ) : null}
        </Column>
      </Screen>
    );
  }

  const goal =
    goalId === 'new' ? null : resource.goals.find((candidate) => candidate.id === goalId);
  if (goalId !== 'new' && !goal) {
    return (
      <Screen onBack={() => router.back()} title="Edit goal">
        <Text
          textStyle={{ color: colors.danger.foreground, fontSize: 15 }}
          testID="goal-editor-not-found"
        >
          This goal no longer exists.
        </Text>
      </Screen>
    );
  }

  return (
    <GoalEditor
      catalog={resource.catalog}
      goal={goal ?? null}
      habits={resource.habits}
      onCancel={() => router.back()}
      onSaved={async () => {
        router.back();
      }}
      service={resource.runtime.goalService}
      settings={resource.goalSettings}
    />
  );
}
