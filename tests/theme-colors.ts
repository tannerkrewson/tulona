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
function channelDistance(first: string, second: string): number {
  const parse = (value: string) =>
    [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset + 1, offset + 3), 16));
  const firstChannels = parse(first);
  const secondChannels = parse(second);
  return (
    firstChannels.reduce(
      (total, channel, index) => total + Math.abs(channel - secondChannels[index]),
      0
    ) / 3
  );
}

assert(dark.background === '#000000', 'dark theme must use an OLED-black background');
assert(light.primary === '#111111', 'light theme must use a monochrome primary color');
assert(
  channelDistance(light.surface, light.background) >= 8,
  'light row surfaces must visibly contrast the light page background'
);
assert(
  channelDistance(dark.surface, dark.background) >= 8,
  'dark row surfaces must visibly contrast the dark page background'
);
assert(getAccessibleTextColor('#FFFFFF') === '#111111', 'white surfaces need dark text');
assert(getAccessibleTextColor('#000000') === '#FFFFFF', 'black surfaces need light text');
