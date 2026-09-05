import { Column, Row, Spacer, Text } from '@expo/ui';
import { Pressable, View } from 'react-native';

import { useAppTheme } from '@theme';
import { AppButton } from '@ui';

import { CatalogIconButton } from './CatalogIconButton';

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

/** Shared catalog navigation with a popover creation menu. */
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
    <View style={{ position: 'relative', width: '100%', zIndex: 10 }}>
      {createOpen ? (
        <Pressable
          accessibilityLabel="Dismiss create menu"
          accessibilityRole="button"
          onPress={onToggleCreate}
          style={{
            bottom: -1000,
            left: -1000,
            position: 'absolute',
            right: -1000,
            top: -1000,
          }}
          testID="catalog-create-backdrop"
        />
      ) : null}
      <Column spacing={12} style={{ width: '100%' }}>
        <Row alignment="center" spacing={4} style={{ width: '100%' }}>
          {onBack ? (
            <CatalogIconButton
              icon="arrow-left"
              label={backLabel}
              onPress={onBack}
              testID="catalog-back"
            />
          ) : null}
          <Text
            numberOfLines={1}
            textStyle={{
              color: colors.text,
              fontSize: 30,
              fontWeight: '700',
              lineHeight: 36,
            }}
          >
            {title}
          </Text>
          <Spacer flexible />
          <CatalogIconButton
            icon={editMode ? 'check' : 'pencil'}
            label={editMode ? 'Done' : 'Edit'}
            onPress={onToggleEdit}
            testID="catalog-edit"
          />
          <CatalogIconButton
            expanded={createOpen}
            icon="plus"
            label={createOpen ? 'Close add menu' : 'Add'}
            onPress={onToggleCreate}
            testID="catalog-add"
            primary
          />
        </Row>
      </Column>
      {createOpen ? (
        <View
          style={{
            position: 'absolute',
            right: 0,
            shadowColor: '#000',
            shadowOpacity: 0.15,
            shadowRadius: 12,
            top: 56,
            width: 220,
          }}
        >
          <Column
            spacing={2}
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: 16,
              borderWidth: 1,
              padding: 6,
              width: '100%',
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
    </View>
  );
}
