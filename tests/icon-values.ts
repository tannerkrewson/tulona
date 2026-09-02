import {
  iconCatalog,
  isEmoji,
  isIconName,
  isIconValue,
  normalizeIconName,
} from '../src/icons/icon-names';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(isIconName('activity'), 'the existing Lucide catalog must remain valid');
assert(!isIconName('rocket'), 'uncurated Lucide names must remain invalid');
assert(isEmoji('😀'), 'single-codepoint emoji must be accepted');
assert(isEmoji('👩‍💻'), 'ZWJ emoji sequences must be accepted');
assert(isEmoji('👍🏽'), 'skin-tone emoji sequences must be accepted');
assert(isEmoji('❤️'), 'variation-selector emoji sequences must be accepted');
assert(!isEmoji('rocket'), 'ordinary text must not be accepted as an emoji');
assert(!isEmoji('😀 text'), 'mixed emoji and text must not be accepted');
assert(isIconValue('😀'), 'emoji values must be valid icon values');
assert(iconCatalog.length > 0, 'the Lucide picker catalog must not be empty');
assert(normalizeIconName('😀') === '😀', 'emoji values must survive normalization');
assert(normalizeIconName('not-an-icon') === 'activity', 'invalid values need a safe fallback');
