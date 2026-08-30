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
    background: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceMuted: '#F1F5F9',
    border: '#CBD5E1',
    text: '#102033',
    textMuted: '#536174',
    primary: '#176B87',
    onPrimary: '#FFFFFF',
    focus: '#0F766E',
    active: { background: '#DFF6F5', foreground: '#0F4C5C' },
    inactive: { background: '#E2E8F0', foreground: '#334155' },
    success: { background: '#DCFCE7', foreground: '#166534' },
    warning: { background: '#FEF3C7', foreground: '#854D0E' },
    danger: { background: '#FEE2E2', foreground: '#991B1B' },
  },
  dark: {
    background: '#0B1220',
    surface: '#111C2E',
    surfaceMuted: '#1E293B',
    border: '#475569',
    text: '#F8FAFC',
    textMuted: '#CBD5E1',
    primary: '#73D1D0',
    onPrimary: '#082F49',
    focus: '#5EEAD4',
    active: { background: '#164E63', foreground: '#CCFBF1' },
    inactive: { background: '#334155', foreground: '#E2E8F0' },
    success: { background: '#14532D', foreground: '#BBF7D0' },
    warning: { background: '#713F12', foreground: '#FEF3C7' },
    danger: { background: '#7F1D1D', foreground: '#FECACA' },
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
export function getAccessibleTextColor(background: string): '#102033' | '#FFFFFF' {
  const match = /^#([0-9a-f]{6})$/i.exec(background.trim());
  if (!match) {
    return '#102033';
  }

  const channels = [0, 2, 4].map(
    (offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16) / 255
  );
  const luminance = channels.reduce((total, channel, index) => {
    const linear = channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    return total + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);

  return luminance > 0.179 ? '#102033' : '#FFFFFF';
}
