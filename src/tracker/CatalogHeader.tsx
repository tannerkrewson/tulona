import type { ReactNode } from 'react';
import { Platform, Pressable, View } from 'react-native';

import {
  AppButton,
  NativeMenuButton,
  type NativeMenuItem,
  PageHeader,
  PopoverAction,
  PopoverSurface,
} from '@ui';

import { CatalogIconButton } from './CatalogIconButton';

export interface CatalogCreateAction {
  label: string;
  onPress: () => void;
  systemImage?: NativeMenuItem['systemImage'];
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
  onAlphabetize?: () => void;
  onSaveOrder?: () => void;
  onCancelOrder?: () => void;
  hasOrderDraft?: boolean;
  disabled?: boolean;
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
  onAlphabetize,
  onSaveOrder,
  onCancelOrder,
  hasOrderDraft = false,
  disabled = false,
}: CatalogHeaderProps) {
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
          disabled={disabled}
          icon={editMode ? 'check' : 'pencil'}
          label={editMode ? 'Done' : 'Edit'}
          onPress={onToggleEdit}
          testID="catalog-edit"
        />
        {Platform.OS === 'ios' ? (
          <NativeMenuButton
            icon="plus"
            label="Add"
            sections={[
              {
                id: 'create',
                items: createActions.map((action) => ({
                  id: action.testID ?? action.label,
                  onSelect: action.onPress,
                  systemImage: action.systemImage,
                  title: action.label,
                })),
              },
            ]}
            testID="catalog-add"
            variant="primary"
          />
        ) : (
          <CatalogIconButton
            expanded={createOpen}
            icon="plus"
            label={createOpen ? 'Close add menu' : 'Add'}
            onPress={onToggleCreate}
            testID="catalog-add"
            primary
          />
        )}
      </PageHeader>
      {editMode && onAlphabetize ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <AppButton
            disabled={disabled}
            label="Alphabetize"
            onPress={onAlphabetize}
            testID="catalog-alphabetize"
            variant="outlined"
          />
          {hasOrderDraft ? (
            <>
              <AppButton
                disabled={disabled}
                label="Cancel"
                onPress={onCancelOrder}
                testID="catalog-order-cancel"
                variant="text"
              />
              <AppButton
                disabled={disabled}
                label="Save"
                onPress={onSaveOrder}
                testID="catalog-order-save"
              />
            </>
          ) : null}
        </View>
      ) : null}
      {createOpen ? (
        <PopoverSurface
          style={{
            position: 'absolute',
            right: 0,
            top: 56,
            width: 220,
          }}
          testID="catalog-create-menu"
        >
          <View style={{ gap: 2, padding: 6, width: '100%' }}>
            {createActions.map((action) => (
              <PopoverAction
                key={action.label}
                label={action.label}
                onPress={() => {
                  onToggleCreate();
                  action.onPress();
                }}
                testID={action.testID}
              />
            ))}
          </View>
        </PopoverSurface>
      ) : null}
    </View>
  );
}
