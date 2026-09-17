import { Column, Text } from '@expo/ui';

import { AppIcon, normalizeIconName, type IconName } from '@icons';
import { useAppTheme } from '@theme';

import { AppButton } from './AppButton';
import { getRowSurfaceStyle } from './row-surface';

export interface EmptyStateProps {
  title: string;
  iconName?: IconName | string | null;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

/** A neutral, action-ready empty state for any feature collection. */
export function EmptyState({
  title,
  iconName = 'inbox',
  actionLabel,
  onAction,
  testID,
}: EmptyStateProps) {
  const { colors } = useAppTheme();

  return (
    <Column
      alignment="center"
      spacing={12}
      style={{
        ...getRowSurfaceStyle({ backgroundColor: colors.surface }),
        paddingHorizontal: 20,
        paddingVertical: 24,
        width: '100%',
      }}
      testID={testID}
    >
      <AppIcon color={colors.primary} name={normalizeIconName(iconName, 'inbox')} size={32} />
      <Text
        textStyle={{ color: colors.text, fontSize: 20, fontWeight: '700', textAlign: 'center' }}
      >
        {title}
      </Text>
      {actionLabel && onAction ? (
        <AppButton
          label={actionLabel}
          onPress={onAction}
          testID={testID ? `${testID}-action` : undefined}
        />
      ) : null}
    </Column>
  );
}
