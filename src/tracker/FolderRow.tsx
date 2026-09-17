import { Row, Spacer, Text } from '@expo/ui';
import { Pressable, View } from 'react-native';

import type { Folder } from '@domain';
import { AppIcon } from '@icons';
import { useAppTheme } from '@theme';
import {
  AppButton,
  getRowSurfaceLayoutStyle,
  getRowSurfaceStyle,
  ROW_SURFACE_CONTENT_GAP,
  ROW_SURFACE_ICON_SIZE,
} from '@ui';

import { CatalogEditActions } from './CatalogEditActions';
import { TRACKER_ROW_FONT_SIZE, TRACKER_ROW_HEIGHT } from './catalog-row-geometry';

export interface FolderRowProps {
  folder: Folder;
  editMode?: boolean;
  disabled?: boolean;
  onPress: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  actionsTestID?: string;
  testID?: string;
}

/** A catalog folder row with the same measured surface geometry as activities. */
export function FolderRow({
  folder,
  editMode = false,
  disabled = false,
  onPress,
  onMoveUp,
  onMoveDown,
  actionsTestID,
  testID,
}: FolderRowProps) {
  const { colorScheme, colors } = useAppTheme();
  const folderColor = folder.color ?? colors.primary;
  const rowStyle = {
    ...getRowSurfaceStyle({
      backgroundColor: colorScheme === 'dark' ? colors.surfaceMuted : colors.surface,
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
          accessibilityLabel={editMode ? `Edit ${folder.name}` : `${folder.name} folder`}
          color={editMode ? colors.textMuted : folderColor}
          fill={editMode ? 'none' : folderColor}
          name={editMode ? 'pencil' : (folder.iconName ?? 'folder')}
          size={editMode ? 20 : 29}
          strokeWidth={editMode ? 2.5 : 0}
        />
      </View>
      <Text
        numberOfLines={1}
        textStyle={{ color: colors.text, fontSize: TRACKER_ROW_FONT_SIZE, fontWeight: '600' }}
      >
        {folder.name}
      </Text>
      {!editMode ? <Spacer flexible /> : null}
      {!editMode ? (
        <View
          style={{
            alignItems: 'center',
            alignSelf: 'stretch',
            justifyContent: 'center',
            width: 24,
          }}
        >
          <AppIcon color={colors.textMuted} name="chevron-right" size={20} strokeWidth={2.5} />
        </View>
      ) : null}
    </Row>
  );

  if (editMode) {
    return (
      <View style={rowStyle} testID={testID}>
        <Pressable
          accessibilityLabel={`Edit ${folder.name}`}
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
            testID={actionsTestID ?? `${testID ?? 'folder-row'}-actions`}
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
