const fs = require('node:fs');
const path = require('node:path');

const { basePath } = require('./pwa-base-path.cjs');

const distDirectory = path.resolve('dist');
const requiredFiles = [
  'index.html',
  '404.html',
  'manifest.json',
  'sw.js',
  'favicon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

function fail(message) {
  throw new Error(`PWA artifact validation failed: ${message}`);
}

for (const relativeFile of requiredFiles) {
  const filePath = path.join(distDirectory, relativeFile);

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    fail(`missing ${relativeFile}`);
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(distDirectory, 'manifest.json'), 'utf8'));

if (manifest.start_url !== './' || manifest.scope !== './') {
  fail('manifest start_url and scope must remain relative to the project site');
}

if (manifest.display !== 'standalone' || manifest.orientation !== 'portrait') {
  fail('manifest does not describe the expected standalone portrait app');
}

if (!Array.isArray(manifest.icons)) {
  fail('manifest has no icon list');
}

for (const expectedSize of ['192x192', '512x512']) {
  if (!manifest.icons.some((icon) => icon.sizes === expectedSize && icon.type === 'image/png')) {
    fail(`manifest is missing its ${expectedSize} PNG icon`);
  }
}

const serviceWorker = fs.readFileSync(path.join(distDirectory, 'sw.js'), 'utf8');

if (!serviceWorker.includes('precacheAndRoute')) {
  fail('service worker has no Workbox precache route');
}

if (!serviceWorker.includes(`${basePath}/index.html`)) {
  fail(`service worker does not contain the ${basePath || '/'} project-site path`);
}

const htmlFiles = [];
function collectHtmlFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      collectHtmlFiles(entryPath);
    } else if (entry.name.endsWith('.html')) {
      htmlFiles.push(entryPath);
    }
  }
}

collectHtmlFiles(distDirectory);

for (const htmlFile of htmlFiles) {
  const html = fs.readFileSync(htmlFile, 'utf8');

  if (basePath) {
    const absoluteAssetUrls = html.matchAll(/(?:src|href)="(\/[^"#?]*)/g);

    for (const [, assetUrl] of absoluteAssetUrls) {
      if (assetUrl !== basePath && !assetUrl.startsWith(`${basePath}/`)) {
        fail(`${path.relative(distDirectory, htmlFile)} contains root-hosted URL ${assetUrl}`);
      }
    }
  }
}

console.log(
  `Validated ${htmlFiles.length} static HTML file(s), manifest, icons, and scoped Workbox service worker for ${basePath || '/'}.`
);
