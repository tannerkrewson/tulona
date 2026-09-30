const expoConfig = require('eslint-config-expo/flat');
const { fixupConfigRules } = require('@eslint/compat');

module.exports = [
  ...fixupConfigRules(expoConfig),
  {
    ignores: [
      '.expo/**',
      'dist/**',
      '**/node_modules/**',
      'web-build/**',
      'mcp/bin/**',
      'mcp/.test-build/**',
    ],
  },
  {
    files: ['mcp/**/*.ts'],
    rules: {
      // The independently installed MCP SDK is checked by mcp's TypeScript project.
      'import/no-unresolved': ['error', { ignore: ['^@modelcontextprotocol/sdk/'] }],
    },
  },
];
