import { Row, Spacer, Text } from '@expo/ui';
import { View } from 'react-native';

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

export interface FolderRowProps {
  folder: Folder;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}

/** A catalog folder row with the same measured surface geometry as activities. */
export function FolderRow({ folder, disabled = false, onPress, testID }: FolderRowProps) {
  const { colors } = useAppTheme();
  return (
    <AppButton
      disabled={disabled}
      onPress={onPress}
      style={{
        ...getRowSurfaceStyle({ backgroundColor: colors.surface }),
        ...getRowSurfaceLayoutStyle(),
      }}
      testID={testID}
      variant="filled"
    >
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
            accessibilityLabel={`${folder.name} folder`}
            color={folder.color ?? colors.primary}
            name={folder.iconName ?? 'folder'}
            size={29}
          />
        </View>
        <Text numberOfLines={1} textStyle={{ color: colors.text, fontSize: 19, fontWeight: '600' }}>
          {folder.name}
        </Text>
        <Spacer flexible />
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
      </Row>
    </AppButton>
  );
}
