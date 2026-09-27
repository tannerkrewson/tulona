export interface ColorOption {
  readonly value: string;
  readonly label: string;
  readonly isSemanticBase?: boolean;
}

export const COLOR_PALETTE = [
  '#c240f1',
  '#f90292',
  '#ff003f',
  '#ff8d02',
  '#fec907',
  '#00da28',
  '#0cc1f4',
  '#0a93fe',
  '#5654fc',
  '#be81ff',
  '#ff81d1',
  '#ff7681',
  '#bd9260',
  '#89ea02',
  '#01f783',
  '#00eae6',
  '#39e1ff',
] as const;

function normalizeColor(value: string): string {
  return value.trim().toUpperCase();
}

/** Builds the shared picker order with the active scheme's base color first. */
export function getColorOptions(
  baseColor: string,
  configuredOptions?: readonly ColorOption[]
): readonly ColorOption[] {
  const normalizedBaseColor = normalizeColor(baseColor);
  const paletteOptions =
    configuredOptions ?? COLOR_PALETTE.map((value) => ({ value, label: value }));

  return [
    { value: normalizedBaseColor, label: 'Base color', isSemanticBase: true },
    ...paletteOptions.filter((option) => normalizeColor(option.value) !== normalizedBaseColor),
  ];
}
