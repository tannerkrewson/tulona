import { Host } from '@expo/ui';
import { ColorPicker } from '@expo/ui/swift-ui';
import { scaleEffect } from '@expo/ui/swift-ui/modifiers';
import { View } from 'react-native';

import { useAppTheme } from '@theme';

import type { NativeColorWellProps } from './NativeColorWell';

/** The system rainbow color well, which opens the iOS color picker sheet. */
export function NativeColorWell({ value, selected, onChange, testID }: NativeColorWellProps) {
  const { colorScheme, colors } = useAppTheme();
  return (
    <View
      accessibilityLabel={selected ? 'Custom color, selected' : 'Custom color'}
      style={{
        alignItems: 'center',
        borderColor: selected ? colors.focus : 'transparent',
        borderRadius: 22,
        borderWidth: 2,
        height: 44,
        justifyContent: 'center',
        width: 44,
      }}
      testID={testID}
    >
      <Host colorScheme={colorScheme} matchContents>
        <ColorPicker
          modifiers={[scaleEffect(1.3)]}
          onSelectionChange={(next) => onChange(next.slice(0, 7).toLowerCase())}
          selection={selected ? value : null}
          supportsOpacity={false}
        />
      </Host>
    </View>
  );
}

NativeColorWell.supported = true;
