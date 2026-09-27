const { basePath } = require('./scripts/pwa-base-path.cjs');

module.exports = ({ config }) => {
  const experiments = { ...config.experiments };
  const plugins = [...(config.plugins ?? [])];

  if (
    process.env.TULONA_DIAGNOSTIC_TURBOMODULE_CATCH === '1' &&
    !plugins.includes('./plugins/withDiagnosticTurboModuleRecovery')
  ) {
    plugins.push('./plugins/withDiagnosticTurboModuleRecovery');
  }

  if (process.env.TULONA_WEB_BUILD === '1') {
    experiments.baseUrl = basePath;
  } else {
    delete experiments.baseUrl;
  }

  return {
    ...config,
    plugins,
    experiments,
  };
};
