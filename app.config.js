const { basePath } = require('./scripts/pwa-base-path.cjs');

module.exports = ({ config }) => {
  const experiments = { ...config.experiments };

  if (process.env.TULONA_WEB_BUILD === '1') {
    experiments.baseUrl = basePath;
  } else {
    delete experiments.baseUrl;
  }

  return {
    ...config,
    experiments,
  };
};
