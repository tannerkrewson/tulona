import { COLOR_PALETTE, getColorOptions } from '../src/ui/color-palette';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const expectedPalette = [
  '#B349E9',
  '#E43290',
  '#EA3347',
  '#F09336',
  '#F7CB46',
  '#62D74B',
  '#58BEEF',
  '#4291F6',
  '#5654F3',
  '#B584F9',
  '#EF88CD',
  '#EF7E84',
  '#B69467',
  '#A0E848',
  '#71F38F',
  '#6BE7E5',
  '#72DEFB',
  '#8D9CF9',
] as const;

assert(
  JSON.stringify(COLOR_PALETTE) === JSON.stringify(expectedPalette),
  'the shared palette must match the issue order exactly'
);

const options = getColorOptions('#FFFFFF');
assert(options.length === expectedPalette.length + 1, 'base color must precede the full palette');
assert(
  options[0]?.value === '#FFFFFF' &&
    options[0]?.label === 'Base color' &&
    options[0]?.isSemanticBase === true,
  'the scheme-aware base color must be the first option'
);
assert(
  JSON.stringify(options.slice(1).map((option) => option.value)) ===
    JSON.stringify(expectedPalette),
  'palette options must retain the exact requested order'
);
assert(
  options.every((option) => !option.label.toLowerCase().includes('default')),
  'color options must not use the retired default nomenclature'
);

const configured = getColorOptions('#111111', [{ value: '#111111', label: 'Legacy base' }]);
assert(
  configured.length === 1 && configured[0]?.isSemanticBase === true,
  'configured options must not duplicate the semantic base color'
);
