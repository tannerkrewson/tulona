export interface ColorOption {
  readonly value: string;
  readonly label: string;
  readonly isSemanticBase?: boolean;
}

export const COLOR_PALETTE = [
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
