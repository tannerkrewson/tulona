import type { ThemeMode } from './colors';

export function readStoredAppearance(): ThemeMode {
  return 'system';
}

export function applyAppearance(_appearance: ThemeMode): void {}
