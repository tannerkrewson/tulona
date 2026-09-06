import { Row, Text } from '@expo/ui';
import { View } from 'react-native';

import type { TrackableItem } from '@domain';
import { getAccessibleTextColor, useAppTheme } from '@theme';
import { AppButton } from '@ui';
import { AppIcon } from '@icons';

export interface ActivityRowProps {
  item: TrackableItem;
  color: string | null | undefined;
  active: boolean;
  editMode?: boolean;
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
  editMode = false,
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
        <View
          style={{
            alignItems: 'center',
            backgroundColor: active ? onAccent : accent,
            borderRadius: 10,
            height: 40,
            justifyContent: 'center',
            opacity: active ? 0.9 : 1,
            width: 40,
          }}
        >
          <AppIcon
            accessibilityLabel={
              editMode
                ? `Edit ${item.name}`
                : active
                  ? `${item.name} pause`
                  : item.kind === 'routine'
                    ? `${item.name} routine`
                    : `${item.name} play`
            }
            color={editMode ? onAccent : active ? accent : onAccent}
            name={
              editMode ? 'pencil' : active ? 'pause' : item.kind === 'routine' ? 'repeat' : 'play'
            }
            size={20}
          />
        </View>
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
