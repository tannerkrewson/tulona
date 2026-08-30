import { Column, Row, Text } from '@expo/ui';

import { AppIcon, type IconName } from '@icons';
import { useAppTheme } from '@theme';

import { Screen } from './Screen';

export interface PlaceholderScreenProps {
  title: string;
  description: string;
  iconName: IconName;
}

/** Stable route content until a feature agent supplies its explicit actions. */
export function PlaceholderScreen({ title, description, iconName }: PlaceholderScreenProps) {
  const { colors } = useAppTheme();

  return (
    <Screen title={title} description={description}>
      <Column
        alignment="start"
        spacing={16}
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: 16,
          borderWidth: 1,
          paddingHorizontal: 20,
          paddingVertical: 20,
          width: '100%',
        }}
      >
        <Row alignment="center" spacing={12}>
          <AppIcon name={iconName} color={colors.primary} size={28} />
          <Text textStyle={{ color: colors.text, fontSize: 20, fontWeight: '600' }}>{title}</Text>
        </Row>
        <Text textStyle={{ color: colors.textMuted, fontSize: 16, lineHeight: 24 }}>
          This foundation route is ready for feature work.
        </Text>
      </Column>
    </Screen>
  );
}
