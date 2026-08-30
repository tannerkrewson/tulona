const { basePath } = require('./scripts/pwa-base-path.cjs');

const basePathPrefix = `${basePath}/`;
const basePathPattern = basePath ? `${basePath}(?:/|$)` : '/';

module.exports = {
  globDirectory: 'dist',
  globPatterns: [
    '**/*.{html,js,css,json,woff,woff2,ttf,otf,eot,svg,png,webp,ico,jpg,jpeg,gif,mp3,m4a,wav,ogg,aac,flac}',
  ],
  globIgnores: ['sw.js'],
  maximumFileSizeToCacheInBytes: 25 * 1024 * 1024,
  modifyURLPrefix: {
    '': basePathPrefix,
  },
  navigateFallback: `${basePath}/index.html`,
  navigateFallbackAllowlist: [new RegExp(`^${basePathPattern}`)],
  swDest: 'dist/sw.js',
  cleanupOutdatedCaches: true,
  clientsClaim: false,
  skipWaiting: false,
  mode: 'production',
};
