import { HexColorInput, HexColorPicker } from 'react-colorful';
import type { CSSProperties } from 'react';

import { useAppTheme } from '@theme';

import type { ColorPickerPlatformProps } from './ColorPickerPlatform';

const FALLBACK_COLOR = '#176B87';

const isHexColorValue = (value: string | null): value is string =>
  value != null && /^#[0-9a-f]{6}$/i.test(value.trim());

/** Uses react-colorful for the web color surface and precise hex entry. */
export function ColorPickerPlatform({ value, onChange, testID }: ColorPickerPlatformProps) {
  const { colors } = useAppTheme();
  const selectedColor = isHexColorValue(value) ? value : FALLBACK_COLOR;
  const inputStyle: CSSProperties = {
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    color: colors.text,
    fontSize: 16,
    height: 44,
    marginTop: 8,
    padding: '0 12px',
    width: '100%',
  };

  return (
    <div data-testid={testID} style={{ width: '100%' }}>
      <HexColorPicker
        color={selectedColor}
        onChange={(next) => onChange(next.toUpperCase())}
        style={{ height: 220, width: '100%' }}
      />
      <HexColorInput
        aria-label="Custom color hex value"
        color={selectedColor}
        onChange={(next) => onChange(next.toUpperCase())}
        prefixed
        style={inputStyle}
      />
    </div>
  );
}
