import type { ViewStyle } from 'react-native';

export const ROW_SURFACE_RADIUS = 14;
export const ROW_SURFACE_BORDER_WIDTH = 1;

export function getRowSurfaceStyle({
  backgroundColor,
  borderColor,
}: {
  backgroundColor: string;
  borderColor: string;
}): ViewStyle {
  return {
    backgroundColor,
    borderColor,
    borderRadius: ROW_SURFACE_RADIUS,
    borderWidth: ROW_SURFACE_BORDER_WIDTH,
  };
}
