export interface ColorOption {
  readonly value: string;
  readonly label: string;
  readonly isSemanticBase?: boolean;
}

export const COLOR_PALETTE = [
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
