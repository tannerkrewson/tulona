import { Column, Row, Spacer, Text } from '@expo/ui';
import { View } from 'react-native';

import type { Folder } from '@domain';
import { AppIcon } from '@icons';
import { useAppTheme } from '@theme';
import { AppButton } from '@ui';

export interface FolderRowProps {
  folder: Folder;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}

/** A low-chrome folder row that is visually distinct from trackable items. */
export function FolderRow({ folder, disabled = false, onPress, testID }: FolderRowProps) {
  const { colors } = useAppTheme();
  return (
    <AppButton
      disabled={disabled}
      onPress={onPress}
      style={{
        backgroundColor: colors.background,
        borderColor: 'transparent',
        borderRadius: 14,
        borderWidth: 0,
        height: 68,
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
            height: 40,
            justifyContent: 'center',
            width: 40,
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
        <Column alignment="center" style={{ width: 24 }}>
          <AppIcon color={colors.textMuted} name="chevron-right" size={20} strokeWidth={2.5} />
        </Column>
      </Row>
    </AppButton>
  );
}
