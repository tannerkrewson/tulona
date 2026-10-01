const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('@expo/config-plugins');

// Must match APPEARANCE_KEY in src/theme/appearance-store.ios.ts.
const APPEARANCE_KEY = 'TulonaAppearance';
const SCENE_MARKER = '// Extension point for config plugins.';

const sceneOverride = `override func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    super.scene(scene, willConnectTo: session, options: connectionOptions)
    // Apply the saved in-app appearance before React Native draws its first frame.
    switch UserDefaults.standard.string(forKey: "${APPEARANCE_KEY}") {
    case "dark": window?.overrideUserInterfaceStyle = .dark
    case "light": window?.overrideUserInterfaceStyle = .light
    default: break
    }
  }`;

function editFile(file, edit) {
  const before = fs.readFileSync(file, 'utf8');
  const after = edit(before);
  if (after !== before) fs.writeFileSync(file, after);
}

/**
 * The launch screen can't read the in-app appearance, so it stays black (matching the app icon)
 * instead of flashing white for people who chose dark mode on a light system.
 */
module.exports = function withLaunchAppearance(config) {
  return withDangerousMod(config, [
    'ios',
    (modConfig) => {
      const root = path.join(
        modConfig.modRequest.platformProjectRoot,
        modConfig.modRequest.projectName
      );
      editFile(path.join(root, 'SceneDelegate.swift'), (source) =>
        source.includes(APPEARANCE_KEY)
          ? source
          : `import UIKit\n${source.replace(SCENE_MARKER, sceneOverride)}`
      );
      editFile(path.join(root, 'SplashScreen.storyboard'), (source) =>
        source.replace(
          /<color key="backgroundColor" systemColor="systemBackgroundColor"\/>/,
          '<color key="backgroundColor" red="0" green="0" blue="0" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>'
        )
      );
      return modConfig;
    },
  ]);
};
