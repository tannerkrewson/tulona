const { basePath } = require('./scripts/pwa-base-path.cjs');

const easProjectId = process.env.EXPO_EAS_PROJECT_ID;

module.exports = ({ config }) => ({
  ...config,
  ...(easProjectId
    ? {
        extra: {
          ...config.extra,
          eas: {
            ...config.extra?.eas,
            projectId: easProjectId,
          },
        },
      }
    : {}),
  experiments: {
    ...config.experiments,
    baseUrl: basePath,
  },
});
