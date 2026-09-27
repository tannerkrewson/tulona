const fs = require('node:fs');
const path = require('node:path');
const { Buffer } = require('node:buffer');

const { DIAGNOSTIC_FILENAME, PATCH_MARKER } = require('./turbo-module-diagnostic-patch.cjs');

const appPath = process.argv[2];
if (!appPath) throw new Error('Pass the built .app directory as the first argument');

const expectedStrings = [Buffer.from(PATCH_MARKER), Buffer.from(DIAGNOSTIC_FILENAME)];
const executablePaths = [path.join(appPath, path.basename(appPath, '.app'))];
const frameworksPath = path.join(appPath, 'Frameworks');

if (fs.existsSync(frameworksPath)) {
  for (const entry of fs.readdirSync(frameworksPath, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.endsWith('.framework')) {
      executablePaths.push(
        path.join(frameworksPath, entry.name, entry.name.slice(0, -'.framework'.length))
      );
    } else if (entry.isFile() && entry.name.endsWith('.dylib')) {
      executablePaths.push(path.join(frameworksPath, entry.name));
    }
  }
}

const checkedPaths = [];
let patchedExecutable;
for (const executablePath of executablePaths) {
  if (!fs.existsSync(executablePath)) continue;

  checkedPaths.push(executablePath);
  const binary = fs.readFileSync(executablePath);
  if (expectedStrings.every((expected) => binary.includes(expected))) {
    patchedExecutable = executablePath;
    break;
  }
}

if (!patchedExecutable) {
  throw new Error(
    `Diagnostic patch markers were not found in the built app executables. Checked: ${checkedPaths.join(', ')}`
  );
}

console.log(`Verified native diagnostic patch is linked in ${patchedExecutable}`);
