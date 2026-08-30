const DEFAULT_BASE_PATH = '/tulona';

function normalizeBasePath(value) {
  const path = (value || DEFAULT_BASE_PATH).trim();

  if (path === '' || path === '/') {
    return '';
  }

  if (!path.startsWith('/')) {
    throw new Error(`EXPO_BASE_URL must be a path beginning with '/': ${path}`);
  }

  return `/${path.replace(/^\/+|\/+$/g, '')}`;
}

module.exports = {
  basePath: normalizeBasePath(process.env.EXPO_BASE_URL),
  normalizeBasePath,
};
