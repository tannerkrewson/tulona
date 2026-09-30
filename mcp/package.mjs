import { chmod, copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The distribution branch contains only the already bundled server, with no app dependencies.
const directory = fileURLToPath(new URL('.', import.meta.url));
const destination = resolve(process.argv[2] ?? resolve(directory, '.package'));
const source = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
await mkdir(destination, { recursive: true });
await rm(resolve(destination, 'bin'), { recursive: true, force: true });
await cp(resolve(directory, 'bin'), resolve(destination, 'bin'), { recursive: true, force: true });
await chmod(resolve(destination, 'bin/tulona-mcp.cjs'), 0o755);
await copyFile(resolve(directory, 'README.md'), resolve(destination, 'README.md'));
await copyFile(resolve(directory, '../LICENSE'), resolve(destination, 'LICENSE'));
await writeFile(
  resolve(destination, 'package.json'),
  `${JSON.stringify(
    {
      name: source.name,
      version: source.version,
      private: true,
      description: 'Read-only Tulona MCP server for the synchronized Dropbox backup',
      license: 'MIT',
      bin: source.bin,
      engines: source.engines,
      files: ['bin', 'README.md', 'LICENSE'],
      repository: { type: 'git', url: 'https://github.com/tannerkrewson/tulona.git' },
    },
    null,
    2
  )}\n`
);
