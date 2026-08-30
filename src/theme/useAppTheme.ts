import { useColorScheme } from 'react-native';

import {
  getThemeColors,
  resolveColorScheme,
  type ThemeColors,
  type ThemeMode,
  type AppColorScheme,
} from './colors';

export interface AppTheme {
  readonly mode: ThemeMode;
  readonly colorScheme: AppColorScheme;
  readonly colors: ThemeColors;
}

export function useAppTheme(mode: ThemeMode = 'system'): AppTheme {
  const systemColorScheme = useColorScheme();
  const colorScheme = resolveColorScheme(mode, systemColorScheme);

  return {
    mode,
    colorScheme,
    colors: getThemeColors(colorScheme),
  };
}
