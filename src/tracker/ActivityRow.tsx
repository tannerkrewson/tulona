import { Column, Row, Text } from '@expo/ui';

import type { TrackableItem } from '@domain';
import { useAppTheme } from '@theme';
import { AppButton } from '@ui';
import { AppIcon } from '@icons';

export const ACTIVE_ACTIVITY_BACKGROUND = '#22D3EE';
export const ACTIVE_ACTIVITY_FOREGROUND = '#06343A';

const isHexColor = (value: string | null | undefined): value is string =>
  value != null && /^#[0-9a-f]{6}$/i.test(value.trim());

export interface ActivityRowProps {
  item: TrackableItem;
  color: string | null | undefined;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}

/** A deliberately simple catalog row; all item metadata stays out of the list. */
export function ActivityRow({
  item,
  color,
  active,
  disabled = false,
  onPress,
  testID,
}: ActivityRowProps) {
  const { colors } = useAppTheme();
  const accent = isHexColor(color) ? color : colors.primary;
  const foreground = active ? ACTIVE_ACTIVITY_FOREGROUND : colors.text;

  return (
    <AppButton
      disabled={disabled}
      onPress={onPress}
      style={{
        backgroundColor: active ? ACTIVE_ACTIVITY_BACKGROUND : colors.surfaceMuted,
        borderColor: active ? ACTIVE_ACTIVITY_BACKGROUND : colors.border,
        borderRadius: 20,
        borderWidth: active ? 0 : 1,
        height: 84,
        paddingHorizontal: 20,
        width: '100%',
      }}
      testID={testID}
      variant="outlined"
    >
      <Row alignment="center" spacing={18} style={{ width: '100%' }}>
        <Column alignment="center" style={{ width: 28 }}>
          <AppIcon
            accessibilityLabel={active ? `${item.name} pause` : `${item.name} play`}
            color={active ? ACTIVE_ACTIVITY_FOREGROUND : accent}
            fill={active ? 'none' : accent}
            name={active ? 'pause' : 'play'}
            size={active ? 25 : 28}
            strokeWidth={active ? 3 : 1.5}
          />
        </Column>
        <Text numberOfLines={1} textStyle={{ color: foreground, fontSize: 21, fontWeight: '700' }}>
          {item.name}
        </Text>
      </Row>
    </AppButton>
  );
}
