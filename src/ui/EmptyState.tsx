import { Column, Text } from '@expo/ui';

import { AppIcon, normalizeIconName, type IconName } from '@icons';
import { useAppTheme } from '@theme';

import { AppButton } from './AppButton';

export interface EmptyStateProps {
  title: string;
  description?: string;
  iconName?: IconName | string | null;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

/** A neutral, action-ready empty state for any feature collection. */
export function EmptyState({
  title,
  description,
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
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 14,
        borderWidth: 1,
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
      {description ? (
        <Text
          textStyle={{ color: colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center' }}
        >
          {description}
        </Text>
      ) : null}
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
