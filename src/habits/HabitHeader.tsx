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
  description?: string;
  onBack?: () => void;
  onAdd?: () => void;
  onToggleEdit?: () => void;
  editOpen?: boolean;
  editActions?: readonly HabitHeaderAction[];
  testID?: string;
}

/** Compact habits navigation shared by the list and detail screens. */
export function HabitHeader({
  title,
  description,
  onBack,
  onAdd,
  onToggleEdit,
  editOpen = false,
  editActions = [],
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
            accessibilityHint="Opens habit edit actions"
            expanded={editOpen}
            icon="pencil"
            label="Edit habit"
            onPress={onToggleEdit}
            testID="edit-habit"
            variant="plain"
            iconSize={21}
          />
        ) : onAdd ? (
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
      {description ? (
        <Text textStyle={{ color: colors.textMuted, fontSize: 15, lineHeight: 22 }}>
          {description}
        </Text>
      ) : null}
      {editOpen ? (
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
            position: 'absolute',
            right: 0,
            shadowColor: '#000',
            shadowOpacity: 0.15,
            shadowRadius: 12,
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
