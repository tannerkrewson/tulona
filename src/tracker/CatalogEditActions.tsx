import { DragHandle } from '@ui/ReorderableList';
import { View } from 'react-native';

import { CatalogIconButton } from './CatalogIconButton';

export interface CatalogEditActionsProps {
  onEdit?: () => void;
  disabled: boolean;
  inline?: boolean;
  testID: string;
  reorderLabel?: string;
}

/** Compact edit-mode actions; reordering uses a shared drag handle. */
export function CatalogEditActions({
  onEdit,
  disabled,
  inline = false,
  testID,
  reorderLabel,
}: CatalogEditActionsProps) {
  return (
    <View
      style={{
        alignItems: 'center',
        flexDirection: 'row',
        gap: 8,
        ...(inline ? { flexShrink: 0 } : { justifyContent: 'flex-end', width: '100%' }),
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
      <DragHandle label={reorderLabel} disabled={disabled} testID={`${testID}-drag`} />
    </View>
  );
}
