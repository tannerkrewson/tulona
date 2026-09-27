const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const resolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native/Libraries/Image/AssetRegistry' && platform === 'web') {
    // RN 0.88 moved this API to its public asset-registry entry point, while
    // Skia's web renderer still imports the old private React Native path.
    return context.resolveRequest(context, 'react-native/asset-registry', platform);
  }

  if (moduleName === '@automerge/automerge' && platform === 'web') {
    // Automerge's browser export imports a raw .wasm file, which Metro cannot
    // bundle. Its generic ESM export embeds the same wasm as base64 instead.
    return context.resolveRequest(
      {
        ...context,
        unstable_conditionNames: context.unstable_conditionNames.filter(
          (condition) => condition !== 'node' && condition !== 'browser'
        ),
        unstable_conditionsByPlatform: {
          ...context.unstable_conditionsByPlatform,
          web: [],
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
