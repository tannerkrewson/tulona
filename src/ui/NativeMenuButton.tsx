import { MenuView, type MenuAction } from '@expo/ui/community/menu';
import { View } from 'react-native';

import { AppIcon, type IconValue } from '@icons';
import { useAppTheme } from '@theme';

import type { IconButtonVariant } from './IconButton';

export interface NativeMenuItem {
  id: string;
  title: string;
  systemImage?: Extract<MenuAction['image'], string>;
  checked?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export interface NativeMenuSection {
  id: string;
  title?: string;
  items: readonly NativeMenuItem[];
}

export interface NativeMenuButtonProps {
  icon: IconValue;
  label: string;
  sections: readonly NativeMenuSection[];
  variant?: IconButtonVariant;
  testID?: string;
}

function toAction(item: NativeMenuItem): MenuAction {
  return {
    attributes: { destructive: item.destructive, disabled: item.disabled },
    id: item.id,
    image: item.systemImage,
    state: item.checked === undefined ? undefined : item.checked ? 'on' : 'off',
    title: item.title,
  };
}

/** An icon button that opens the system menu (UIMenu) on iOS. */
export function NativeMenuButton({
  icon,
  label,
  sections,
  variant = 'muted',
  testID,
}: NativeMenuButtonProps) {
  const { colors } = useAppTheme();
  const primary = variant === 'primary';
  const plain = variant === 'plain';
  const size = primary ? 46 : 42;
  const items = new Map(
    sections.flatMap((section) => section.items.map((item) => [item.id, item]))
  );
  const actions: MenuAction[] =
    sections.length === 1 && !sections[0]?.title
      ? sections[0].items.map(toAction)
      : sections.map((section) => ({
          displayInline: true,
          id: section.id,
          subactions: section.items.map(toAction),
          title: section.title ?? '',
        }));

  return (
    <MenuView
      actions={actions}
      onPressAction={({ nativeEvent }) => items.get(nativeEvent.event)?.onSelect()}
      testID={testID}
    >
      <View
        accessibilityLabel={label}
        accessibilityRole="button"
        style={{
          alignItems: 'center',
          backgroundColor: primary ? colors.primary : plain ? 'transparent' : colors.surfaceMuted,
          borderColor: primary || plain ? 'transparent' : colors.border,
          borderRadius: primary ? 23 : 12,
          borderWidth: primary || plain ? 0 : 1,
          height: size,
          justifyContent: 'center',
          width: size,
        }}
      >
        <AppIcon
          color={primary ? colors.onPrimary : plain ? colors.primary : colors.text}
          name={icon}
          size={primary ? 23 : 20}
          strokeWidth={2.5}
        />
      </View>
    </MenuView>
  );
}
