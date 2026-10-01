const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const resolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native/Libraries/Image/AssetRegistry' && platform === 'web') {
    // RN 0.88 moved this API to its public asset-registry entry point, while
    // Skia's web renderer still imports the old private React Native path.
    return context.resolveRequest(context, 'react-native/asset-registry', platform);
  }

  if (moduleName === 'lib0/webcrypto' && platform !== 'web') {
    // lib0's react-native export needs isomorphic-webcrypto. The default export reads the
    // global Web Crypto, which src/backup/web-crypto.native.ts installs from expo-crypto.
    return context.resolveRequest(
      {
        ...context,
        unstable_conditionNames: context.unstable_conditionNames.filter(
          (condition) => condition !== 'react-native'
        ),
        unstable_conditionsByPlatform: {
          ...context.unstable_conditionsByPlatform,
          [platform]: [],
        },
      },
      moduleName,
      platform
    );
  }

  return resolveRequest
    ? resolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
