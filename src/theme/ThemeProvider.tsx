import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { applyAppearance, readStoredAppearance } from './appearance-store';
import { getThemeColors, resolveColorScheme, type ThemeMode } from './colors';
import { useSystemColorScheme } from './systemColorScheme';

interface ThemePreferenceContextValue {
  appearance: ThemeMode;
  setAppearance: (appearance: ThemeMode) => void;
}

const defaultThemePreference: ThemePreferenceContextValue = {
  appearance: 'system',
  setAppearance: () => undefined,
};

const ThemePreferenceContext = createContext<ThemePreferenceContextValue>(defaultThemePreference);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useSystemColorScheme();
  const [appearance, setAppearance] = useState<ThemeMode>(readStoredAppearance);
  const colorScheme = resolveColorScheme(appearance, systemColorScheme);
  const colors = getThemeColors(colorScheme);
  const baseNavigationTheme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...baseNavigationTheme,
    colors: {
      ...baseNavigationTheme.colors,
      background: colors.background,
      card: colors.surface,
      border: colors.border,
      text: colors.text,
      primary: colors.primary,
      notification: colors.danger.foreground,
    },
  };

  useEffect(() => applyAppearance(appearance), [appearance]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    root.dataset.theme = colorScheme;
    root.style.colorScheme = colorScheme;
    root.style.backgroundColor = colors.background;
    root.style.setProperty('--tulona-background', colors.background);
    root.style.setProperty('--tulona-surface', colors.surface);
    root.style.setProperty('--tulona-border', colors.border);
    root.style.setProperty('--tulona-text', colors.text);
    root.style.setProperty('--tulona-tab-active', colors.primary);
    root.style.setProperty('--tulona-tab-inactive', colors.textMuted);
    document.body.style.backgroundColor = colors.background;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors.background);
  }, [
    colorScheme,
    colors.background,
    colors.border,
    colors.primary,
    colors.surface,
    colors.text,
    colors.textMuted,
  ]);

  return (
    <ThemePreferenceContext.Provider value={{ appearance, setAppearance }}>
      <NavigationThemeProvider value={navigationTheme}>{children}</NavigationThemeProvider>
    </ThemePreferenceContext.Provider>
  );
}

export function useThemePreference(): ThemePreferenceContextValue {
  return useContext(ThemePreferenceContext);
}
