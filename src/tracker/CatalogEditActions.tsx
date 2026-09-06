import { View } from 'react-native';

import { CatalogIconButton } from './CatalogIconButton';

export interface CatalogEditActionsProps {
  onUp: () => void;
  onDown: () => void;
  onEdit?: () => void;
  disabled: boolean;
  testID: string;
}

/** Compact edit-mode actions; movement stays inline and icon-only. */
export function CatalogEditActions({
  onUp,
  onDown,
  onEdit,
  disabled,
  testID,
}: CatalogEditActionsProps) {
  return (
    <View
      style={{
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'flex-end',
        width: '100%',
      }}
    >
      {onEdit ? (
        <CatalogIconButton
          disabled={disabled}
          icon="pencil"
          label="Edit folder"
          onPress={onEdit}
          testID={`${testID}-edit`}
        />
      ) : null}
      <CatalogIconButton
        disabled={disabled}
        icon="chevron-up"
        label="Move up"
        onPress={onUp}
        testID={`${testID}-up`}
      />
      <CatalogIconButton
        disabled={disabled}
        icon="chevron-down"
        label="Move down"
        onPress={onDown}
        testID={`${testID}-down`}
      />
    </View>
  );
}
