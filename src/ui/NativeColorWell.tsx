export interface NativeColorWellProps {
  value: string | null;
  selected: boolean;
  onChange: (value: string) => void;
  testID?: string;
}

/** Only iOS has a system color well; other platforms use the custom color panel. */
export function NativeColorWell(_props: NativeColorWellProps) {
  return null;
}

NativeColorWell.supported = false;
