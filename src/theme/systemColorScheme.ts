import { useColorScheme, Platform, type ColorSchemeName } from 'react-native';
import { useEffect, useState } from 'react';

function browserColorScheme(): ColorSchemeName {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Uses the browser media query directly because iOS Safari can hydrate Appearance as light. */
export function useSystemColorScheme(): ColorSchemeName {
  const nativeColorScheme = useColorScheme();
  const [webColorScheme, setWebColorScheme] = useState<ColorSchemeName>(browserColorScheme);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setWebColorScheme(media.matches ? 'dark' : 'light');
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);

  return Platform.OS === 'web' ? webColorScheme : nativeColorScheme;
}
