import { Row, Text } from '@expo/ui';
import { Pressable, View } from 'react-native';

import type { TrackableItem } from '@domain';
import { getAccessibleTextColor, useAppTheme } from '@theme';
import {
  AppButton,
  getRowSurfaceBackground,
  getRowSurfaceLayoutStyle,
  getRowSurfaceStyle,
  ROW_SURFACE_CONTENT_GAP,
  ROW_SURFACE_ICON_SIZE,
} from '@ui';
import { AppIcon } from '@icons';

import { CatalogEditActions } from './CatalogEditActions';
import {
  TRACKER_PLAYBACK_ICON_SIZE,
  TRACKER_ROW_FONT_SIZE,
  TRACKER_ROW_HEIGHT,
} from './catalog-row-geometry';

export interface ActivityRowProps {
  item: TrackableItem;
  color: string | null | undefined;
  active: boolean;
  editMode?: boolean;
  disabled?: boolean;
  onPress: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  actionsTestID?: string;
  testID?: string;
}

const isHexColor = (value: string | null | undefined): value is string =>
  value != null && /^#[0-9a-f]{6}$/i.test(value.trim());

/**
 * The single canonical catalog row. An active row is filled with the
 * resolved catalog color; inactive rows use the theme surface.
 */
export function ActivityRow({
  item,
  color,
  active,
  editMode = false,
  disabled = false,
  onPress,
  onMoveUp,
  onMoveDown,
  actionsTestID,
  testID,
}: ActivityRowProps) {
  const { colorScheme, colors } = useAppTheme();
  const configuredColor = color ?? item.color;
  const accent = isHexColor(configuredColor) ? configuredColor.trim() : colors.primary;
  const activeForeground = getAccessibleTextColor(accent);
  const inactiveBackground = getRowSurfaceBackground({
    colorScheme,
    surface: colors.surface,
    surfaceMuted: colors.surfaceMuted,
  });
  const iconName = editMode
    ? 'pencil'
    : active
      ? item.kind === 'routine'
        ? 'repeat'
        : 'pause'
      : item.kind === 'routine'
        ? 'repeat'
        : 'play';
  const solidIcon = iconName === 'play' || iconName === 'pause';
  const rowStyle = {
    ...getRowSurfaceStyle({
      backgroundColor: active ? accent : inactiveBackground,
    }),
    ...getRowSurfaceLayoutStyle({ height: TRACKER_ROW_HEIGHT }),
  } as const;
  const rowContent = (
    <Row alignment="center" spacing={ROW_SURFACE_CONTENT_GAP} style={{ width: '100%' }}>
      <View
        style={{
          alignItems: 'center',
          height: ROW_SURFACE_ICON_SIZE,
          justifyContent: 'center',
          width: ROW_SURFACE_ICON_SIZE,
        }}
      >
        <AppIcon
          accessibilityLabel={
            editMode
              ? `Edit ${item.name}`
              : active
                ? item.kind === 'routine'
                  ? `${item.name} active routine`
                  : `${item.name} pause`
                : item.kind === 'routine'
                  ? `${item.name} routine`
                  : `${item.name} play`
          }
          color={
            editMode
              ? active
                ? activeForeground
                : colors.textMuted
              : active
                ? activeForeground
                : accent
          }
          fill={
            solidIcon ? (editMode ? colors.textMuted : active ? activeForeground : accent) : 'none'
          }
          name={iconName}
          size={solidIcon ? TRACKER_PLAYBACK_ICON_SIZE : 20}
          strokeWidth={solidIcon ? 0 : 2.5}
        />
      </View>
      <Text
        numberOfLines={1}
        textStyle={{
          color: active ? activeForeground : colors.text,
          fontSize: TRACKER_ROW_FONT_SIZE,
          fontWeight: active ? '700' : '600',
        }}
      >
        {item.name}
      </Text>
    </Row>
  );

  if (editMode) {
    return (
      <View style={rowStyle} testID={testID}>
        <Pressable
          accessibilityLabel={`Edit ${item.name}`}
          accessibilityRole="button"
          disabled={disabled}
          onPress={onPress}
          style={({ pressed }) => ({
            flex: 1,
            minWidth: 0,
            opacity: disabled ? 0.45 : pressed ? 0.72 : 1,
          })}
        >
          {rowContent}
        </Pressable>
        {onMoveUp && onMoveDown ? (
          <CatalogEditActions
            disabled={disabled}
            inline
            onDown={onMoveDown}
            onUp={onMoveUp}
            testID={actionsTestID ?? `${testID ?? 'activity-row'}-actions`}
          />
        ) : null}
      </View>
    );
  }

  return (
    <AppButton
      disabled={disabled}
      onPress={onPress}
      style={rowStyle}
      testID={testID}
      variant="filled"
    >
      {rowContent}
    </AppButton>
  );
}
