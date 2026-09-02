import { getAccessibleTextColor, getThemeColors, resolveColorScheme } from '../src/theme/colors';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(
  resolveColorScheme('light', 'dark') === 'light',
  'light mode must override the device theme'
);
assert(resolveColorScheme('dark', 'light') === 'dark', 'dark mode must override the device theme');
assert(
  resolveColorScheme('system', 'dark') === 'dark',
  'system mode must follow a dark device theme'
);
assert(
  resolveColorScheme('system', 'light') === 'light',
  'system mode must follow a light device theme'
);

const dark = getThemeColors('dark');
const light = getThemeColors('light');
assert(dark.background === '#000000', 'dark theme must use an OLED-black background');
assert(light.primary === '#111111', 'light theme must use a monochrome primary color');
assert(getAccessibleTextColor('#FFFFFF') === '#111111', 'white surfaces need dark text');
assert(getAccessibleTextColor('#000000') === '#FFFFFF', 'black surfaces need light text');
