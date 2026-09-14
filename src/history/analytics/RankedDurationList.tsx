import { Text } from '@expo/ui';
import { useAppTheme } from '@theme';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActivityCompositionBar } from './ActivityCompositionBar';
import { AnalyticsEmptyState } from './AnalyticsEmptyState';
import {
  formatAnalyticsDuration,
  formatAnalyticsPercentage,
  type RankedDurationItem,
} from './analytics-data';

export interface RankedDurationListProps {
  items: readonly RankedDurationItem[];
  onItemPress?: (item: RankedDurationItem) => void;
  emptyMessage?: string;
  testID?: string;
}

function itemAccessibilityLabel(item: RankedDurationItem): string {
  const secondary = item.secondaryLabel ? `, ${item.secondaryLabel}` : '';
  return `${item.name}${secondary}, ${formatAnalyticsDuration(item.durationMs)}, ${formatAnalyticsPercentage(item.percentage)} of tracked time`;
}

function ColorDots({ colors }: { colors: readonly string[] }) {
  const { colors: themeColors } = useAppTheme();
  const visibleColors = colors.length > 0 ? colors : [themeColors.surfaceMuted];
  return (
    <View accessibilityElementsHidden style={styles.colorDots}>
      {visibleColors.map((color, index) => (
        <View
          key={`${color}-${index}`}
          style={[styles.colorDot, { backgroundColor: color, borderColor: themeColors.border }]}
        />
      ))}
    </View>
  );
}

function NeutralProportionBar({ percentage }: { percentage: number }) {
  const { colors } = useAppTheme();
  const width = Math.min(100, Math.max(0, percentage * 100));
  return (
    <View
      accessibilityElementsHidden
      style={[styles.proportionTrack, { backgroundColor: colors.surfaceMuted }]}
    >
      <View
        style={{
          backgroundColor: colors.textMuted,
          borderRadius: 99,
          height: '100%',
          minWidth: width > 0 ? 3 : 0,
          width: `${width}%`,
        }}
      />
    </View>
  );
}

/** Renders every ranked item in order; callers can virtualize the outer screen if needed. */
export function RankedDurationList({
  items,
  onItemPress,
  emptyMessage = 'No tracked activity in this period.',
  testID,
}: RankedDurationListProps) {
  const { colors } = useAppTheme();

  if (items.length === 0) {
    return <AnalyticsEmptyState message={emptyMessage} testID={testID} />;
  }

  return (
    <View style={styles.list} testID={testID}>
      {items.map((item) => {
        const onPress = onItemPress ? () => onItemPress(item) : undefined;
        return (
          <Pressable
            accessibilityHint={onPress ? 'Opens this history breakdown item' : undefined}
            accessibilityLabel={itemAccessibilityLabel(item)}
            accessibilityRole={onPress ? 'button' : undefined}
            key={item.key}
            onPress={onPress}
            style={({ pressed }) => [
              styles.item,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && onPress ? styles.pressed : null,
            ]}
            testID={testID ? `${testID}-${item.kind}-${item.id ?? 'root'}` : undefined}
          >
            <View style={styles.itemHeader}>
              <ColorDots colors={item.activityColors} />
              <View style={styles.itemName}>
                <Text
                  numberOfLines={1}
                  textStyle={{ color: colors.text, fontSize: 15, fontWeight: '700' }}
                >
                  {item.name}
                </Text>
                {item.secondaryLabel ? (
                  <Text numberOfLines={1} textStyle={{ color: colors.textMuted, fontSize: 12 }}>
                    {item.secondaryLabel}
                  </Text>
                ) : null}
              </View>
              <View style={styles.itemValue}>
                <Text textStyle={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>
                  {formatAnalyticsDuration(item.durationMs)}
                </Text>
                <Text textStyle={{ color: colors.textMuted, fontSize: 12 }}>
                  {formatAnalyticsPercentage(item.percentage)}
                </Text>
              </View>
            </View>
            {item.kind === 'activity' && item.composition.length > 0 ? (
              <ActivityCompositionBar
                accessible={false}
                accessibilityLabel={`${item.name} composition, ${formatAnalyticsPercentage(item.percentage)} of tracked time`}
                segments={item.composition}
              />
            ) : (
              <NeutralProportionBar percentage={item.percentage} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
    width: '100%',
  },
  item: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    minHeight: 72,
    padding: 12,
    width: '100%',
  },
  itemHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 44,
    width: '100%',
  },
  itemName: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  itemValue: {
    alignItems: 'flex-end',
    gap: 2,
    minWidth: 58,
  },
  colorDots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    minWidth: 14,
  },
  colorDot: {
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    height: 12,
    width: 12,
  },
  proportionTrack: {
    borderRadius: 99,
    height: 6,
    overflow: 'hidden',
    width: '100%',
  },
  pressed: {
    opacity: 0.72,
  },
});
