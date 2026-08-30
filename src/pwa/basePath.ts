const DEFAULT_BASE_PATH = '/tulona';

function normalizeBasePath(value: string | undefined): string {
  const path = (value || DEFAULT_BASE_PATH).trim();

  if (path === '' || path === '/') {
    return '';
  }

  return `/${path.replace(/^\/+|\/+$/g, '')}`;
}

export const basePath = normalizeBasePath(process.env.EXPO_BASE_URL);

export function basePathAsset(relativePath: string): string {
  return `${basePath}/${relativePath.replace(/^\/+/, '')}`;
}
