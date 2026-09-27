const fs = require('node:fs');
const path = require('node:path');

const { withDangerousMod, withInfoPlist } = require('expo/config-plugins');
const { patchTurboModuleSource } = require('../scripts/turbo-module-diagnostic-patch.cjs');

module.exports = function withDiagnosticTurboModuleRecovery(config) {
  config = withInfoPlist(config, (modConfig) => {
    modConfig.modResults.TULONA_BUILD_SHA = process.env.EXPO_PUBLIC_BUILD_SHA || 'local';
    return modConfig;
  });

  return withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const sourcePath = path.join(
        modConfig.modRequest.projectRoot,
        'node_modules/react-native/ReactCommon/react/nativemodule/core/platform/ios/ReactCommon/RCTTurboModule.mm'
      );

      if (!fs.existsSync(sourcePath)) {
        throw new Error(`React Native TurboModule implementation not found at ${sourcePath}`);
      }

      const source = fs.readFileSync(sourcePath, 'utf8');
      const patchedSource = patchTurboModuleSource(source);
      if (patchedSource !== source) {
        fs.writeFileSync(sourcePath, patchedSource);
      }

      console.log('[Tulona diagnostic] Applied async void TurboModule exception workaround.');
      return modConfig;
    },
  ]);
};
