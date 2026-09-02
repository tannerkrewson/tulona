import type { ColorSchemeName } from 'react-native';

export type ThemeMode = 'system' | 'light' | 'dark';
export type AppColorScheme = 'light' | 'dark';

export interface ColorPair {
  readonly background: string;
  readonly foreground: string;
}

export interface ThemeColors {
  readonly background: string;
  readonly surface: string;
  readonly surfaceMuted: string;
  readonly border: string;
  readonly text: string;
  readonly textMuted: string;
  readonly primary: string;
  readonly onPrimary: string;
  readonly focus: string;
  readonly active: ColorPair;
  readonly inactive: ColorPair;
  readonly success: ColorPair;
  readonly warning: ColorPair;
  readonly danger: ColorPair;
}

export const themeColors: Record<AppColorScheme, ThemeColors> = {
  light: {
    background: '#F5F5F5',
    surface: '#FFFFFF',
    surfaceMuted: '#EEEEEE',
    border: '#D4D4D4',
    text: '#171717',
    textMuted: '#666666',
    primary: '#111111',
    onPrimary: '#FFFFFF',
    focus: '#111111',
    active: { background: '#E7E7E7', foreground: '#111111' },
    inactive: { background: '#F0F0F0', foreground: '#666666' },
    success: { background: '#E7E7E7', foreground: '#222222' },
    warning: { background: '#EDEDED', foreground: '#333333' },
    danger: { background: '#E5E5E5', foreground: '#1A1A1A' },
  },
  dark: {
    background: '#000000',
    surface: '#0D0D0D',
    surfaceMuted: '#171717',
    border: '#2A2A2A',
    text: '#F5F5F5',
    textMuted: '#A3A3A3',
    primary: '#FFFFFF',
    onPrimary: '#000000',
    focus: '#FFFFFF',
    active: { background: '#1F1F1F', foreground: '#FFFFFF' },
    inactive: { background: '#111111', foreground: '#A3A3A3' },
    success: { background: '#1C1C1C', foreground: '#F5F5F5' },
    warning: { background: '#222222', foreground: '#E5E5E5' },
    danger: { background: '#2A2A2A', foreground: '#FFFFFF' },
  },
};

export function resolveColorScheme(
  mode: ThemeMode,
  systemColorScheme: ColorSchemeName = 'light'
): AppColorScheme {
  if (mode === 'light' || mode === 'dark') {
    return mode;
  }

  return systemColorScheme === 'dark' ? 'dark' : 'light';
}

export function getThemeColors(colorScheme: AppColorScheme): ThemeColors {
  return themeColors[colorScheme];
}

/** Returns a readable foreground for a six-digit hex background. */
export function getAccessibleTextColor(background: string): '#111111' | '#FFFFFF' {
  const match = /^#([0-9a-f]{6})$/i.exec(background.trim());
  if (!match) {
    return '#111111';
  }

  const channels = [0, 2, 4].map(
    (offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16) / 255
  );
  const luminance = channels.reduce((total, channel, index) => {
    const linear = channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    return total + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);

  return luminance > 0.179 ? '#111111' : '#FFFFFF';
}
