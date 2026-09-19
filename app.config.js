const { basePath } = require('./scripts/pwa-base-path.cjs');

module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    baseUrl: basePath,
  },
});
