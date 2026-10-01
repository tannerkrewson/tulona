import { Column, Row, Text } from '@ui/primitives';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text as NativeText, View } from 'react-native';

import { useAppTheme } from '@theme';
import {
  errorText,
  AppButton,
  FormRow,
  FormSection,
  HeaderTextButton,
  IconButton,
  Screen,
} from '@ui';
import { goBackInAppStack } from '../navigation/app-back';

import { formatGoalWeek, goalReviewWeekIndex, moveGoalReviewWeek } from './goal-review-navigation';
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
  const goBack = () => goBackInAppStack(router, '/(tabs)/goals' as Href);
  const { colors } = useAppTheme();
  const [resource, setResource] = useState<GoalsPageData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedWeekStart, setSelectedWeekStart] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadGoalsPage()
      .then((nextResource) => {
        if (!cancelled) {
          const currentWeek = nextResource.runtime.goalService.week(
            nextResource.currentWeek.weekStart
          );
          setResource(nextResource);
          setSelectedWeekStart(currentWeek.weekStart);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(errorText(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [goalId, reloadToken]);

  if (!resource) {
    return (
      <Screen onBack={goBack} title="Review">
        <Column spacing={12} style={{ width: '100%' }} testID="goal-review-loading">
          <Text
            textStyle={{
              color: loadError ? colors.danger.foreground : colors.textMuted,
              fontSize: 15,
            }}
          >
            {loadError ?? (loading ? 'Loading review...' : 'Review is unavailable.')}
          </Text>
          {loadError ? (
            <AppButton
              label="Retry"
              onPress={() => {
                setResource(null);
                setLoading(true);
                setReloadToken((token) => token + 1);
              }}
              testID="goal-review-retry"
            />
          ) : null}
        </Column>
      </Screen>
    );
  }

  const goal = resource.goals.find((candidate) => candidate.id === goalId);
  if (!goal) {
    return (
      <Screen onBack={goBack} title="Review">
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
      variant="muted"
    />
  );

  const startWeek = goal.startWeek ?? resource.runtime.goalService.week(goal.createdAt).weekStart;
  const reviewSnapshots = [
    ...(resource.reviewWeeks ?? resource.historicalWeeks),
    resource.currentSnapshot,
  ].filter((snapshot) => snapshot.week.weekStart >= startWeek);
  const selectedIndex = goalReviewWeekIndex(
    reviewSnapshots.map((snapshot) => snapshot.week),
    selectedWeekStart
  );
  const selectedSnapshot = reviewSnapshots[selectedIndex] ?? resource.currentSnapshot;
  const selectedWeek = selectedSnapshot.week;
  const currentWeekSelected = selectedWeek.weekStart === resource.currentWeek.weekStart;
  const selectWeekIndex = (index: number) => {
    const nextSnapshot = reviewSnapshots[index];
    if (!nextSnapshot) return;
    const canonical = resource.runtime.goalService.week(nextSnapshot.week.weekStart);
    setSelectedWeekStart(canonical.weekStart);
  };
  const moveWeek = (direction: 'previous' | 'next') => {
    const nextIndex = moveGoalReviewWeek(selectedIndex, direction, reviewSnapshots.length);
    if (nextIndex !== null) selectWeekIndex(nextIndex);
  };
  const weekNavigator = (
    <GoalReviewWeekNavigator
      onMove={moveWeek}
      onSelectIndex={selectWeekIndex}
      selectedIndex={selectedIndex}
      snapshots={reviewSnapshots}
    />
  );

  if (goal.evaluationMode === 'manual') {
    return (
      <Screen headerRight={editButton} onBack={goBack} title={goal.title}>
        <Column spacing={28} style={{ width: '100%' }}>
          {weekNavigator}
          <ReviewPanel
            currentSnapshot={selectedSnapshot}
            currentWeek={selectedWeek}
            goals={[goal]}
            key={selectedWeek.weekStart}
            onSaved={async () => {
              goBack();
            }}
            service={resource.runtime.goalService}
            settings={resource.goalSettings}
          />
        </Column>
      </Screen>
    );
  }

  const status = displayStatus(goal, selectedSnapshot);
  const definition = statusDefinition(resource.goalSettings, status?.statusId);
  return (
    <Screen headerRight={editButton} onBack={goBack} title={goal.title}>
      <Column spacing={28} style={{ width: '100%' }}>
        {weekNavigator}
        <FormSection
          footer="Calculated from this goal’s checks."
          testID="goal-automatic-review"
          title={currentWeekSelected ? 'Result So Far' : 'Result'}
        >
          <FormRow
            label="Status"
            trailing={
              <StatusBadge definition={definition} label={definition?.name ?? 'No result yet'} />
            }
          />
        </FormSection>
        <ReviewPanel
          currentSnapshot={selectedSnapshot}
          currentWeek={selectedWeek}
          goals={[goal]}
          key={selectedWeek.weekStart}
          onSaved={async () => {
            goBack();
          }}
          service={resource.runtime.goalService}
          settings={resource.goalSettings}
        />
      </Column>
    </Screen>
  );
}

function GoalReviewWeekNavigator({
  snapshots,
  selectedIndex,
  onMove,
  onSelectIndex,
}: {
  snapshots: readonly GoalsPageData['currentSnapshot'][];
  selectedIndex: number;
  onMove: (direction: 'previous' | 'next') => void;
  onSelectIndex: (index: number) => void;
}) {
  const { colors } = useAppTheme();
  const selectedSnapshot = snapshots[selectedIndex];
  const previousWeekCount = Math.max(0, snapshots.length - 1);
  const atOldest = selectedIndex <= 0;
  const atCurrent = selectedIndex < 0 || selectedIndex >= snapshots.length - 1;

  if (!selectedSnapshot) {
    return (
      <Text textStyle={{ color: colors.textMuted, fontSize: 14 }} testID="goal-review-no-weeks">
        No review weeks are available.
      </Text>
    );
  }

  const weeksAgo = snapshots.length - 1 - selectedIndex;
  const weekLabel =
    weeksAgo === 0 ? 'This Week' : weeksAgo === 1 ? 'Last Week' : `${weeksAgo} Weeks Ago`;

  return (
    <Column spacing={6} style={{ width: '100%' }} testID="goal-review-week-navigation">
      <Row alignment="center" spacing={8} style={{ width: '100%' }}>
        <IconButton
          disabled={atOldest}
          icon="chevron-left"
          label={atOldest ? 'No earlier week' : 'Previous week'}
          onPress={() => onMove('previous')}
          testID="goal-review-previous-week"
          variant="plain"
        />
        <View
          accessibilityLabel={`${weekLabel}, ${formatGoalWeek(selectedSnapshot.week)}`}
          accessible
          style={{ alignItems: 'center', flex: 1, minWidth: 0 }}
          testID="goal-review-selected-week"
        >
          <NativeText
            numberOfLines={1}
            style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}
          >
            {weekLabel}
          </NativeText>
          <NativeText
            numberOfLines={1}
            style={{ color: colors.textMuted, fontSize: 14 }}
            testID="goal-review-selected-week-range"
          >
            {formatGoalWeek(selectedSnapshot.week)}
          </NativeText>
        </View>
        <IconButton
          disabled={atCurrent}
          icon="chevron-right"
          label={atCurrent ? 'Already on this week' : 'Next week'}
          onPress={() => onMove('next')}
          testID="goal-review-next-week"
          variant="plain"
        />
      </Row>
      {previousWeekCount === 0 ? (
        <Text
          textStyle={{ color: colors.textMuted, fontSize: 13, textAlign: 'center' }}
          testID="goal-review-no-previous-weeks"
        >
          Earlier weeks appear here once this goal has been running longer.
        </Text>
      ) : null}
      {!atCurrent ? (
        <View style={{ alignItems: 'center', width: '100%' }}>
          <HeaderTextButton
            compact
            label="Go to This Week"
            onPress={() => onSelectIndex(snapshots.length - 1)}
            testID="goal-review-current-week"
          />
        </View>
      ) : null}
    </Column>
  );
}
