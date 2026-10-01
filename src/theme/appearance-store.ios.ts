import { Appearance, Settings } from 'react-native';

import type { ThemeMode } from './colors';

// Read natively at launch by plugins/with-launch-appearance.cjs.
const APPEARANCE_KEY = 'TulonaAppearance';

export function readStoredAppearance(): ThemeMode {
  const value = Settings.get(APPEARANCE_KEY);
  return value === 'light' || value === 'dark' ? value : 'system';
}

/** Saves the choice for the next launch and makes UIKit's own views follow it now. */
export function applyAppearance(appearance: ThemeMode): void {
  Settings.set({ [APPEARANCE_KEY]: appearance });
  Appearance.setColorScheme(appearance === 'system' ? 'unspecified' : appearance);
}
