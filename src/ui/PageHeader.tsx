import { Text } from '@expo/ui';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

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
            textStyle={{ color: colors.text, fontSize: 30, fontWeight: '700', lineHeight: 36 }}
          >
            {title}
          </Text>
        </View>
      ) : null}
      <View style={styles.spacer} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    height: 42,
    width: '100%',
  },
  spacer: { flex: 1 },
  title: { flexShrink: 1, minWidth: 0 },
});
