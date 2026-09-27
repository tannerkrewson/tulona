/** Avoid the experimental Expo native tab host on iOS 27 pending launch-crash diagnosis. */
export function shouldUseExperimentalNativeTabs(
  platform: string,
  platformVersion: string | number
): boolean {
  if (platform !== 'ios') return true;

  const majorVersion = Number.parseInt(String(platformVersion).split('.')[0], 10);
  return Number.isFinite(majorVersion) && majorVersion < 27;
}
