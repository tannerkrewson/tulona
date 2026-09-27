const expoConfig = require('eslint-config-expo/flat');
const { fixupConfigRules } = require('@eslint/compat');

module.exports = [
  ...fixupConfigRules(expoConfig),
  {
    ignores: ['.expo/**', 'dist/**', 'node_modules/**', 'web-build/**'],
  },
];
