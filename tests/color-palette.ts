import { COLOR_PALETTE, getColorOptions } from '../src/ui/color-palette';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const expectedPalette = [
  '#9824D3',
  '#D31A78',
  '#D91B30',
  '#DF6510',
  '#D6A900',
  '#45B82A',
  '#1596D0',
  '#246DE0',
  '#453DDE',
  '#8B42E8',
  '#D44BA9',
  '#DB4F58',
  '#91642C',
  '#80BF1F',
  '#32B85D',
  '#17B8B5',
  '#11AACC',
  '#6675E8',
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
