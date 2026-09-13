import type { ViewStyle } from 'react-native';

export const ROW_SURFACE_HEIGHT = 64;
export const ROW_SURFACE_PADDING_HORIZONTAL = 12;
export const ROW_SURFACE_CONTENT_GAP = 12;
export const ROW_SURFACE_ICON_SIZE = 40;
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

/** Shared single-line row geometry for catalog and other compact list rows. */
export function getRowSurfaceLayoutStyle({ height = ROW_SURFACE_HEIGHT } = {}): ViewStyle {
  return {
    alignItems: 'center',
    flexDirection: 'row',
    height,
    paddingHorizontal: ROW_SURFACE_PADDING_HORIZONTAL,
    width: '100%',
  };
}
