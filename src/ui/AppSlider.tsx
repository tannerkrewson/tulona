import { Host, Slider } from '@expo/ui';
import { View } from 'react-native';

import { useAppTheme } from '@theme';

export interface AppSliderProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  testID?: string;
}

/** A system slider hosted at a fixed height inside React Native layout. */
export function AppSlider({ disabled = false, ...sliderProps }: AppSliderProps) {
  const { colorScheme, colors } = useAppTheme();
  return (
    <View style={{ height: 44, opacity: disabled ? 0.5 : 1, width: '100%' }}>
      <Host colorScheme={colorScheme} seedColor={colors.primary} style={{ flex: 1 }}>
        <Slider {...sliderProps} disabled={disabled} />
      </Host>
    </View>
  );
}
