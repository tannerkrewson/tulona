import { Column, Row, Text } from '@expo/ui';

import { timestampMs, type CatalogCollection, type TimeTransition } from '@domain';
import { AppIcon, isIconValue } from '@icons';
import { getAccessibleTextColor, useAppTheme } from '@theme';
import { AppButton, DurationText } from '@ui';

import { resolveCatalogItem } from '../catalog/catalog-service';

export interface CurrentActivityHeaderProps {
  activeTransition: TimeTransition | null;
  catalog: CatalogCollection | null;
  nowMs: number;
  onAdjustStart: () => void;
}

function formatStartedAt(timestamp: string): string {
  return new Date(timestamp).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** The active state is reconstructed from the persisted transition, never from a timer tick. */
export function CurrentActivityHeader({
  activeTransition,
  catalog,
  nowMs,
  onAdjustStart,
}: CurrentActivityHeaderProps) {
  const { colors } = useAppTheme();
  const activeItem =
    activeTransition?.activityId && catalog
      ? resolveCatalogItem(catalog, activeTransition.activityId)
      : null;

  if (!activeTransition || activeTransition.activityId === null) {
    return (
      <Column
        spacing={8}
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: 20,
          borderWidth: 1,
          padding: 20,
          width: '100%',
        }}
        testID="current-activity-header"
      >
        <Row alignment="center" spacing={12}>
          <Column
            alignment="center"
            style={{
              backgroundColor: colors.inactive.background,
              borderRadius: 14,
              height: 56,
              width: 56,
            }}
          >
            <AppIcon
              accessibilityLabel="No active activity"
              color={colors.inactive.foreground}
              name="pause"
              size={26}
            />
          </Column>
          <Column spacing={3} style={{ width: '100%' }}>
            <Text textStyle={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>
              No active activity
            </Text>
            <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
              Choose an activity below to start tracking.
            </Text>
          </Column>
        </Row>
        <Row alignment="center" spacing={6}>
          <AppIcon color={colors.inactive.foreground} name="circle" size={15} />
          <Text textStyle={{ color: colors.inactive.foreground, fontSize: 13, fontWeight: '600' }}>
            Inactive
          </Text>
        </Row>
      </Column>
    );
  }

  const item = activeItem?.item;
  const color = activeItem?.displayColor ?? colors.primary;
  const elapsedMs = Math.max(0, nowMs - timestampMs(activeTransition.timestamp));

  return (
    <Column
      spacing={12}
      style={{
        backgroundColor: colors.active.background,
        borderColor: colors.active.foreground,
        borderRadius: 20,
        borderWidth: 2,
        padding: 20,
        width: '100%',
      }}
      testID="current-activity-header"
    >
      <Row alignment="center" spacing={12}>
        <Column
          alignment="center"
          style={{ backgroundColor: color, borderRadius: 14, height: 60, width: 60 }}
        >
          <AppIcon
            accessibilityLabel={`${item?.name ?? 'Current activity'} icon`}
            color={getAccessibleTextColor(color)}
            name={isIconValue(item?.iconName) ? item.iconName : 'activity'}
            size={29}
          />
        </Column>
        <Column spacing={4} style={{ width: '100%' }}>
          <Text textStyle={{ color: colors.active.foreground, fontSize: 14, fontWeight: '700' }}>
            CURRENT ACTIVITY
          </Text>
          <Text
            numberOfLines={2}
            textStyle={{ color: colors.text, fontSize: 25, fontWeight: '800' }}
          >
            {item?.name ?? 'Unavailable activity'}
          </Text>
        </Column>
      </Row>
      <Row alignment="center" spacing={10}>
        <AppIcon color={colors.active.foreground} name="check-circle-2" size={18} />
        <Text textStyle={{ color: colors.active.foreground, fontSize: 14, fontWeight: '700' }}>
          Active now
        </Text>
        <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>|</Text>
        <DurationText
          durationMs={elapsedMs}
          testID="current-activity-elapsed"
          textStyle={{ color: colors.text, fontSize: 20, fontWeight: '800' }}
        />
      </Row>
      <Text textStyle={{ color: colors.textMuted, fontSize: 14 }}>
        {`Started at ${formatStartedAt(activeTransition.timestamp)}`}
      </Text>
      <AppButton
        label="Adjust start"
        onPress={onAdjustStart}
        style={{ height: 52, width: '100%' }}
        testID="adjust-start"
      />
    </Column>
  );
}
