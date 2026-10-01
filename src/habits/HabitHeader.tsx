import type { ReactNode } from 'react';
import { Platform, Pressable, View } from 'react-native';

import {
  IconButton,
  NativeMenuButton,
  type NativeMenuItem,
  PageHeader,
  PopoverAction,
  PopoverSurface,
} from '@ui';

export interface HabitHeaderAction {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  systemImage?: NativeMenuItem['systemImage'];
  testID?: string;
}

export interface HabitHeaderProps {
  title: string;
  onBack?: () => void;
  onAdd?: () => void;
  onToggleEdit?: () => void;
  editOpen?: boolean;
  editLabel?: string;
  editOpenLabel?: string;
  editActions?: readonly HabitHeaderAction[];
  filterMenu?: ReactNode;
  editTestID?: string;
  testID?: string;
}

/** Compact habits navigation shared by the list and detail screens. */
export function HabitHeader({
  title,
  onBack,
  onAdd,
  onToggleEdit,
  editOpen = false,
  editLabel = 'Edit habit',
  editOpenLabel = 'Close habit edit actions',
  editActions = [],
  filterMenu,
  editTestID = 'edit-habit',
  testID,
}: HabitHeaderProps) {
  return (
    <View
      style={{
        elevation: 1000,
        overflow: 'visible',
        position: 'relative',
        width: '100%',
        zIndex: 1000,
      }}
      testID={testID}
    >
      <PageHeader
        backLabel="Back to habits"
        backTestID="habit-detail-back"
        onBack={onBack}
        title={title}
      >
        {filterMenu}
        {Platform.OS === 'ios' && editActions.length > 0 ? (
          <NativeMenuButton
            icon="pencil"
            label={editLabel}
            sections={[
              {
                id: 'edit',
                items: editActions.map((action) => ({
                  disabled: action.disabled,
                  id: action.testID ?? action.label,
                  onSelect: action.onPress,
                  systemImage: action.systemImage,
                  title: action.label,
                })),
              },
            ]}
            testID={editTestID}
          />
        ) : onToggleEdit ? (
          <IconButton
            accessibilityHint={editOpen ? 'Closes habit edit actions' : 'Opens habit edit actions'}
            expanded={editOpen}
            icon={editOpen ? 'check' : 'pencil'}
            label={editOpen ? editOpenLabel : editLabel}
            onPress={onToggleEdit}
            testID={editTestID}
            variant="muted"
          />
        ) : null}
        {onAdd ? (
          <IconButton
            accessibilityHint="Opens a new habit"
            icon="plus"
            label="Add habit"
            onPress={onAdd}
            testID="new-habit"
            variant="primary"
          />
        ) : null}
      </PageHeader>
      {editOpen && editActions.length > 0 ? (
        <Pressable
          accessibilityLabel="Dismiss habit edit menu"
          accessibilityRole="button"
          onPress={onToggleEdit}
          style={{
            bottom: -1000,
            left: -1000,
            position: 'absolute',
            right: -1000,
            top: -1000,
          }}
          testID="habit-edit-backdrop"
        />
      ) : null}
      {editOpen && editActions.length > 0 ? (
        <PopoverSurface
          style={{
            position: 'absolute',
            right: 0,
            top: 54,
            width: 210,
          }}
          testID="habit-edit-menu"
        >
          <View style={{ gap: 2, padding: 6, width: '100%' }}>
            {editActions.map((action) => (
              <PopoverAction
                disabled={action.disabled}
                key={action.label}
                label={action.label}
                onPress={() => {
                  onToggleEdit?.();
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
