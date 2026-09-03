import { Column, Row, Spacer, Text } from '@expo/ui';
import { View } from 'react-native';

import { useAppTheme } from '@theme';
import { AppButton } from '@ui';

export interface CatalogCreateAction {
  label: string;
  onPress: () => void;
  testID?: string;
}

export interface CatalogHeaderProps {
  title: string;
  onBack?: () => void;
  backLabel?: string;
  editMode: boolean;
  createOpen: boolean;
  createActions: readonly CatalogCreateAction[];
  onToggleCreate: () => void;
  onToggleEdit: () => void;
}

/** Shared catalog navigation and creation/edit affordances. */
export function CatalogHeader({
  title,
  onBack,
  backLabel = 'Activities',
  editMode,
  createOpen,
  createActions,
  onToggleCreate,
  onToggleEdit,
}: CatalogHeaderProps) {
  const { colors } = useAppTheme();

  return (
    <Column spacing={18} style={{ width: '100%' }}>
      <Row alignment="center" style={{ width: '100%' }}>
        {onBack ? (
          <AppButton
            label={backLabel}
            onPress={onBack}
            style={{ height: 42, paddingHorizontal: 0 }}
            testID="catalog-back"
            variant="text"
          />
        ) : (
          <Text
            numberOfLines={1}
            textStyle={{ color: colors.text, fontSize: 38, fontWeight: '800', lineHeight: 44 }}
          >
            {title}
          </Text>
        )}
        <Spacer flexible />
        <AppButton
          label="+"
          onPress={onToggleCreate}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 23,
            height: 46,
            paddingHorizontal: 0,
            width: 46,
          }}
          testID="catalog-add"
        />
        <AppButton
          label={editMode ? 'Done' : 'Edit'}
          onPress={onToggleEdit}
          style={{ height: 42, paddingHorizontal: 10 }}
          testID="catalog-edit"
          variant="text"
        />
      </Row>
      {onBack ? (
        <Text textStyle={{ color: colors.text, fontSize: 38, fontWeight: '800', lineHeight: 44 }}>
          {title}
        </Text>
      ) : null}
      {createOpen ? (
        <View style={{ alignItems: 'flex-end' }}>
          <Column
            spacing={6}
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: 16,
              borderWidth: 1,
              padding: 8,
              width: 220,
            }}
            testID="catalog-create-menu"
          >
            {createActions.map((action) => (
              <AppButton
                key={action.label}
                label={action.label}
                onPress={() => {
                  onToggleCreate();
                  action.onPress();
                }}
                style={{ height: 44, width: '100%' }}
                testID={action.testID}
                variant="text"
              />
            ))}
          </Column>
        </View>
      ) : null}
    </Column>
  );
}
