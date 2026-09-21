import { Column, Row, Spacer, Text } from '@expo/ui';
import { Pressable, View } from 'react-native';

import { useAppTheme } from '@theme';
import { AppButton, IconButton } from '@ui';

export interface HabitHeaderAction {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}

export interface HabitHeaderProps {
  title: string;
  onBack?: () => void;
  onAdd?: () => void;
  onImport?: () => void;
  onToggleEdit?: () => void;
  editOpen?: boolean;
  editLabel?: string;
  editOpenLabel?: string;
  editActions?: readonly HabitHeaderAction[];
  editTestID?: string;
  testID?: string;
}

/** Compact habits navigation shared by the list and detail screens. */
export function HabitHeader({
  title,
  onBack,
  onAdd,
  onImport,
  onToggleEdit,
  editOpen = false,
  editLabel = 'Edit habit',
  editOpenLabel = 'Close habit edit actions',
  editActions = [],
  editTestID = 'edit-habit',
  testID,
}: HabitHeaderProps) {
  const { colors } = useAppTheme();

  return (
    <View style={{ position: 'relative', width: '100%', zIndex: 10 }} testID={testID}>
      <Row alignment="center" spacing={4} style={{ width: '100%' }}>
        {onBack ? (
          <IconButton
            accessibilityHint="Returns to the habits list"
            icon="arrow-left"
            label="Back to habits"
            onPress={onBack}
            testID="habit-detail-back"
            variant="plain"
            iconSize={24}
          />
        ) : null}
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            textStyle={{ color: colors.text, fontSize: 30, fontWeight: '700', lineHeight: 36 }}
          >
            {title}
          </Text>
        </View>
        <Spacer flexible />
        {onToggleEdit ? (
          <IconButton
            accessibilityHint={editOpen ? 'Closes habit edit actions' : 'Opens habit edit actions'}
            expanded={editOpen}
            icon={editOpen ? 'check' : 'pencil'}
            label={editOpen ? editOpenLabel : editLabel}
            onPress={onToggleEdit}
            testID={editTestID}
            variant="muted"
            iconSize={editOpen ? 23 : 21}
          />
        ) : null}
        {onImport ? (
          <IconButton
            accessibilityHint="Opens the TickTick habit import"
            icon="upload"
            label="Import TickTick habits"
            onPress={onImport}
            testID="import-ticktick-habits"
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
      </Row>
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
        <View
          style={{
            boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.15)',
            position: 'absolute',
            right: 0,
            top: 54,
            width: 210,
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
            testID="habit-edit-menu"
          >
            {editActions.map((action) => (
              <AppButton
                disabled={action.disabled}
                key={action.label}
                label={action.label}
                onPress={() => {
                  onToggleEdit?.();
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
