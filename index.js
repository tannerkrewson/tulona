const { Platform } = require('react-native');
const { installLaunchCrashReporter } = require('./src/diagnostics/launchCrashReporter');
const app = require('./app.json').expo;

if (Platform.OS !== 'web') {
  installLaunchCrashReporter({
    errorUtils: global.ErrorUtils,
    storage: {
      setItem: (key, value) =>
        require('@react-native-async-storage/async-storage').default.setItem(key, value),
    },
    metadata: {
      appVersion: app.version,
      buildNumber: app.ios.buildNumber,
      buildSha: process.env.EXPO_PUBLIC_BUILD_SHA || 'local',
      bundleIdentifier: app.ios.bundleIdentifier,
      platform: Platform.OS,
      platformVersion: String(Platform.Version),
    },
  });
}

require('expo-router/entry');
