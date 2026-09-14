import type { ViewStyle } from 'react-native';

export const ROW_SURFACE_HEIGHT = 64;
export const ROW_SURFACE_PADDING_HORIZONTAL = 12;
export const ROW_SURFACE_CONTENT_GAP = 12;
export const ROW_SURFACE_ICON_SIZE = 40;
export const ROW_SURFACE_RADIUS = 14;
export const ROW_SURFACE_BORDER_WIDTH = 0;
export const ROW_SURFACE_DIVIDER_WIDTH = 1;
export const ROW_SURFACE_LIST_GAP = 8;
export const ROW_SURFACE_SHADOW: ViewStyle = {
  boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.14)',
  elevation: 3,
};

/** Shared borderless, elevated surface for compact rows and collection cards. */
export function getRowSurfaceStyle({ backgroundColor }: { backgroundColor: string }): ViewStyle {
  return {
    backgroundColor,
    borderRadius: ROW_SURFACE_RADIUS,
    borderWidth: ROW_SURFACE_BORDER_WIDTH,
    ...ROW_SURFACE_SHADOW,
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
