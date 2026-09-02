import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

import { getThemeColors, resolveColorScheme, type ThemeMode } from './colors';

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
  const systemColorScheme = useColorScheme();
  const [appearance, setAppearance] = useState<ThemeMode>('system');
  const colorScheme = resolveColorScheme(appearance, systemColorScheme);
  const colors = getThemeColors(colorScheme);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    root.dataset.theme = colorScheme;
    root.style.colorScheme = colorScheme;
    root.style.backgroundColor = colors.background;
    document.body.style.backgroundColor = colors.background;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors.background);
  }, [colorScheme, colors.background]);

  return (
    <ThemePreferenceContext.Provider value={{ appearance, setAppearance }}>
      {children}
    </ThemePreferenceContext.Provider>
  );
}

export function useThemePreference(): ThemePreferenceContextValue {
  return useContext(ThemePreferenceContext);
}
