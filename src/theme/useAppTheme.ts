import { useThemePreference } from './ThemeProvider';
import { useSystemColorScheme } from './systemColorScheme';
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

export function useAppTheme(mode?: ThemeMode): AppTheme {
  const { appearance } = useThemePreference();
  const systemColorScheme = useSystemColorScheme();
  const resolvedMode = mode ?? appearance;
  const colorScheme = resolveColorScheme(resolvedMode, systemColorScheme);

  return {
    mode: resolvedMode,
    colorScheme,
    colors: getThemeColors(colorScheme),
  };
}
