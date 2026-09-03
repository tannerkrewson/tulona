import { Column, Row, Text } from '@expo/ui';

import type { TrackableItem } from '@domain';
import { getAccessibleTextColor, useAppTheme } from '@theme';
import { AppButton } from '@ui';
import { AppIcon } from '@icons';

export interface ActivityRowProps {
  item: TrackableItem;
  color: string | null | undefined;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}

const isHexColor = (value: string | null | undefined): value is string =>
  value != null && /^#[0-9a-f]{6}$/i.test(value.trim());

/**
 * The single canonical catalog row. An active row is filled with the
 * activity's own color; inactive rows use the theme surface.
 */
export function ActivityRow({
  item,
  color,
  active,
  disabled = false,
  onPress,
  testID,
}: ActivityRowProps) {
  const { colors } = useAppTheme();
  const configuredColor = item.color ?? color;
  const accent = isHexColor(configuredColor) ? configuredColor.trim() : colors.primary;
  const onAccent = getAccessibleTextColor(accent);

  return (
    <AppButton
      disabled={disabled}
      onPress={onPress}
      style={{
        backgroundColor: active ? accent : colors.surface,
        borderColor: active ? accent : colors.border,
        borderRadius: 14,
        borderWidth: 1,
        height: 64,
        paddingHorizontal: 12,
        width: '100%',
      }}
      testID={testID}
      variant="outlined"
    >
      <Row alignment="center" spacing={12} style={{ width: '100%' }}>
        <Column
          alignment="center"
          style={{
            backgroundColor: active ? onAccent : accent,
            borderRadius: 10,
            height: 40,
            opacity: active ? 0.9 : 1,
            width: 40,
          }}
        >
          <AppIcon
            accessibilityLabel={active ? `${item.name} pause` : `${item.name} play`}
            color={active ? accent : onAccent}
            name={active ? 'pause' : 'play'}
            size={20}
          />
        </Column>
        <Text
          numberOfLines={1}
          textStyle={{
            color: active ? onAccent : colors.text,
            fontSize: 17,
            fontWeight: active ? '700' : '600',
          }}
        >
          {item.name}
        </Text>
      </Row>
    </AppButton>
  );
}
