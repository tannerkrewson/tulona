import { Column, Row, Spacer, Text } from '@expo/ui';

import { AppIcon, isIconValue, type IconValue } from '@icons';
import { getAccessibleTextColor, getActivityStateVisual, useAppTheme } from '@theme';

import { DurationText } from './DurationText';
import { AppButton } from './AppButton';

export interface ActivityTileProps {
  name: string;
  iconName?: IconValue | null;
  color?: string | null;
  durationMs?: number | null;
  supportingText?: string;
  active?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
}

const isHexColor = (value: string | null | undefined): value is string =>
  value != null && /^#[0-9a-f]{6}$/i.test(value.trim());

/** A large-target activity row that can be used by tracker, routine, or habit features. */
export function ActivityTile({
  name,
  iconName,
  color,
  durationMs,
  supportingText,
  active,
  onPress,
  disabled = false,
  testID,
}: ActivityTileProps) {
  const { colors } = useAppTheme();
  const resolvedIconName = isIconValue(iconName) ? iconName : 'activity';
  const accent = isHexColor(color) ? color : colors.primary;
  const stateVisual =
    active === undefined ? null : getActivityStateVisual(colors, active ? 'active' : 'inactive');

  return (
    <AppButton
      disabled={disabled}
      onPress={onPress}
      style={{
        backgroundColor: stateVisual?.colors.background ?? colors.surface,
        borderColor: stateVisual?.colors.foreground ?? colors.border,
        borderRadius: 14,
        borderWidth: 1,
        height: 76,
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
            backgroundColor: accent,
            borderRadius: 12,
            height: 48,
            width: 48,
          }}
        >
          <AppIcon
            accessibilityLabel={`${name} icon`}
            color={getAccessibleTextColor(accent)}
            name={resolvedIconName}
            size={26}
          />
        </Column>
        <Column spacing={3}>
          <Text
            numberOfLines={1}
            textStyle={{ color: colors.text, fontSize: 17, fontWeight: '700' }}
          >
            {name}
          </Text>
          {supportingText ? (
            <Text numberOfLines={1} textStyle={{ color: colors.textMuted, fontSize: 13 }}>
              {supportingText}
            </Text>
          ) : null}
          {stateVisual ? (
            <Row alignment="center" spacing={4}>
              <AppIcon
                accessibilityLabel={stateVisual.label}
                color={stateVisual.colors.foreground}
                name={stateVisual.iconName}
                size={14}
              />
              <Text
                textStyle={{
                  color: stateVisual.colors.foreground,
                  fontSize: 12,
                  fontWeight: '600',
                }}
              >
                {stateVisual.label}
              </Text>
            </Row>
          ) : null}
        </Column>
        <Spacer flexible />
        {durationMs != null ? <DurationText durationMs={durationMs} /> : null}
      </Row>
    </AppButton>
  );
}
