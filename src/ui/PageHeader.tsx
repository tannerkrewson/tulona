import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@theme';
import { IconButton } from './IconButton';

export interface PageHeaderProps {
  title?: string;
  onBack?: () => void;
  backLabel?: string;
  backTestID?: string;
  children?: ReactNode;
}

/** Shared page title row keeps tracker, habits, goals, and detail screens aligned. */
export function PageHeader({
  title,
  onBack,
  backLabel = 'Back',
  backTestID = 'screen-back',
  children,
}: PageHeaderProps) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.row}>
      {onBack ? (
        <IconButton
          accessibilityHint="Returns to the previous screen"
          icon="arrow-left"
          label={backLabel}
          onPress={onBack}
          testID={backTestID}
          variant="plain"
          iconSize={23}
        />
      ) : null}
      {title ? (
        <View style={styles.title}>
          <Text
            numberOfLines={1}
            style={{ color: colors.text, fontSize: 30, fontWeight: '700', lineHeight: 36 }}
          >
            {title}
          </Text>
        </View>
      ) : null}
      <View style={styles.spacer} />
      <View style={styles.actions}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    height: 42,
    width: '100%',
  },
  spacer: { flex: 1 },
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 8,
    minWidth: 0,
  },
  title: { flexShrink: 1, minWidth: 0 },
});
