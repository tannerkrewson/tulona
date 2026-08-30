const fs = require('node:fs');
const path = require('node:path');

const distDirectory = path.resolve('dist');
const indexFile = path.join(distDirectory, 'index.html');
const notFoundFile = path.join(distDirectory, '404.html');

if (!fs.existsSync(indexFile)) {
  throw new Error('Static export did not produce dist/index.html');
}

fs.copyFileSync(indexFile, notFoundFile);
console.log('Created dist/404.html as the GitHub Pages nested-route shell fallback.');
