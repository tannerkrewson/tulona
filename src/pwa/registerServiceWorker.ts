import { basePathAsset, basePath } from './basePath';

export function registerServiceWorker(): void {
  if (
    process.env.NODE_ENV !== 'production' ||
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator)
  ) {
    return;
  }

  const serviceWorkerUrl = new URL(basePathAsset('sw.js'), window.location.origin);
  const scopeUrl = new URL(`${basePath}/`, window.location.origin);

  void navigator.serviceWorker
    .register(serviceWorkerUrl, {
      scope: scopeUrl.pathname,
      updateViaCache: 'none',
    })
    .catch(() => {
      // Keep the app usable when a static host does not expose the worker.
    });
}
