import { Column, Host } from '@expo/ui';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useAppTheme } from '@theme';
import { AppButton, PageHeader } from '@ui';

import { CatalogIconButton } from './CatalogIconButton';

export interface CatalogCreateAction {
  label: string;
  onPress: () => void;
  testID?: string;
}

export interface CatalogHeaderProps {
  title: string;
  onBack?: () => void;
  onHistory?: () => void;
  backLabel?: string;
  editMode: boolean;
  createOpen: boolean;
  createActions: readonly CatalogCreateAction[];
  onToggleCreate: () => void;
  onToggleEdit: () => void;
  filterMenu?: ReactNode;
}

/** Shared catalog navigation with a popover creation menu. */
export function CatalogHeader({
  title,
  onBack,
  onHistory,
  backLabel = 'Activities',
  editMode,
  createOpen,
  createActions,
  onToggleCreate,
  onToggleEdit,
  filterMenu,
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
      <PageHeader backLabel={backLabel} backTestID="catalog-back" onBack={onBack} title={title}>
        {onHistory ? (
          <CatalogIconButton
            icon="clock"
            label="History"
            onPress={onHistory}
            testID="tracker-history"
          />
        ) : null}
        {filterMenu}
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
      </PageHeader>
      {createOpen ? (
        <View
          style={{
            boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.15)',
            position: 'absolute',
            right: 0,
            top: 56,
            width: 220,
          }}
        >
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: 16,
              borderWidth: 1,
              overflow: 'hidden',
              padding: 6,
              width: '100%',
            }}
          >
            <Host matchContents={{ vertical: true }} style={{ width: '100%' }}>
              <Column spacing={2} style={{ width: '100%' }} testID="catalog-create-menu">
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
            </Host>
          </View>
        </View>
      ) : null}
    </View>
  );
}
