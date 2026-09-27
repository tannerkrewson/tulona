import { shouldUseExperimentalNativeTabs } from '../src/navigation/nativeTabsPolicy';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(shouldUseExperimentalNativeTabs('ios', '26.4'), 'iOS 26 keeps native tabs');
assert(!shouldUseExperimentalNativeTabs('ios', '27.0'), 'iOS 27 uses the stable tabs fallback');
assert(shouldUseExperimentalNativeTabs('android', 36), 'Android keeps native tabs');
assert(!shouldUseExperimentalNativeTabs('ios', 'unknown'), 'unknown iOS versions use the fallback');

console.log('Native tab runtime policy tests passed');
