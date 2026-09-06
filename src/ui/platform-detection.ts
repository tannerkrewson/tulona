export interface IOSWebEnvironment {
  readonly userAgent: string;
  readonly platform: string;
  readonly maxTouchPoints: number;
  readonly standalone: boolean;
  readonly displayModeStandalone?: boolean;
}

/** Identifies iOS Safari and an installed iOS PWA, but not other web targets. */
export function isIOSSafariEnvironment({
  userAgent,
  platform,
  maxTouchPoints,
  standalone,
  displayModeStandalone = false,
}: IOSWebEnvironment): boolean {
  const isIOS =
    /iPad|iPhone|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
  if (!isIOS) return false;

  const isOtherIOSBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|GSA|DuckDuckGo/i.test(userAgent);
  const isSafari = /Safari\//i.test(userAgent) && !isOtherIOSBrowser;

  // navigator.standalone is present for an iOS home-screen PWA, whose UA does
  // not contain Safari. It is intentionally checked only after the iOS test.
  return isSafari || standalone || displayModeStandalone;
}
