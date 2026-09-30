import { build } from 'esbuild';
import { chmod, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = fileURLToPath(new URL('.', import.meta.url));
const options = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  legalComments: 'external',
  alias: {
    zod: resolve(directory, 'node_modules/zod'),
    luxon: resolve(directory, 'node_modules/luxon'),
  },
  tsconfigRaw: {
    compilerOptions: {
      baseUrl: resolve(directory, '..'),
      paths: { '@domain': ['src/domain/index.ts'] },
    },
  },
};
const executable = resolve(directory, 'bin/tulona-mcp.cjs');
const compiled = await build({
  ...options,
  entryPoints: [resolve(directory, 'src/cli.ts')],
  outfile: executable,
  minify: true,
  metafile: true,
  banner: { js: '#!/usr/bin/env node' },
});
await chmod(executable, 0o755);

// Preserve licenses for every third-party package actually included in the bundle.
const packages = new Map();
for (const input of Object.keys(compiled.metafile.inputs)) {
  const absolute = resolve(input).replaceAll('\\', '/');
  const marker = '/node_modules/';
  const position = absolute.lastIndexOf(marker);
  if (position < 0) continue;
  const parts = absolute.slice(position + marker.length).split('/');
  const name = parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  packages.set(name, absolute.slice(0, position + marker.length) + name);
}
const notices = [];
for (const [name, location] of [...packages.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const manifest = JSON.parse(await readFile(resolve(location, 'package.json'), 'utf8'));
  const files = (await readdir(location)).filter((file) => /^(license|copying)(\.|$)/i.test(file));
  const texts = await Promise.all(
    files.sort().map((file) => readFile(resolve(location, file), 'utf8'))
  );
  if (!texts.length) throw new Error(`No license file found for bundled dependency ${name}`);
  notices.push(
    `${name}@${manifest.version} (${manifest.license ?? 'see license'})\n${texts.join('\n')}`
  );
}
await writeFile(
  resolve(directory, 'bin/THIRD_PARTY_LICENSES.txt'),
  notices.join('\n\n--------------------\n\n')
);

if (process.argv.includes('--test')) {
  const tests = resolve(directory, '.test-build/tests.cjs');
  await build({
    ...options,
    entryPoints: [resolve(directory, 'tests/index.ts')],
    outfile: tests,
  });
  const result = spawnSync(process.execPath, ['--test', tests], {
    stdio: 'inherit',
    cwd: directory,
  });
  process.exitCode = result.status ?? 1;
}
