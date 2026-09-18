/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
/* eslint-enable @typescript-eslint/no-require-imports */

const root = path.resolve(process.cwd());
const read = (relativePath: string): string =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const backup = read('src/backup/dropbox-backup.ts');
const screen = read('src/backup/BackupScreen.tsx');
const callback = read('app/dropbox-auth.tsx');
const coordinator = read('src/orchestration/boot-coordinator.ts');
const readme = read('README.md');
const packageJson = JSON.parse(read('package.json')) as {
  dependencies?: { dropbox?: string };
};

assert(packageJson.dependencies?.dropbox, 'the official Dropbox npm package must be installed');
assert(
  backup.includes("mode: { '.tag': 'overwrite' }") &&
    backup.includes('autorename: false') &&
    backup.includes('DROPBOX_BACKUP_PATH'),
  'Dropbox uploads must use one stable overwrite-only path'
);
assert(
  backup.includes('startAutomaticBackups') &&
    backup.includes('backupQueue') &&
    backup.includes('DROPBOX_BACKUP_DEFAULT_DEBOUNCE_MS'),
  'automatic backups must be debounced and serialized'
);
assert(
  screen.includes('dropbox-connect') &&
    screen.includes('dropbox-auto-backup-enabled') &&
    screen.includes('dropbox-backup-now') &&
    screen.includes('dropbox-disconnect'),
  'backup UI must expose connect, automatic, manual, and disconnect actions'
);
assert(
  callback.includes('completeAuthorization') && callback.includes('backupNow'),
  'Dropbox OAuth callback must complete authorization and verify the first backup'
);
assert(
  coordinator.includes('dropboxBackup.startAutomaticBackups()') &&
    coordinator.includes('stopAutomaticBackups'),
  'boot must start automatic backups and clean them up on reset'
);
assert(
  readme.includes('EXPO_PUBLIC_DROPBOX_APP_KEY') &&
    readme.includes('tulona://dropbox-auth') &&
    readme.includes('tulona-backup.json'),
  'Dropbox setup and overwrite policy must be documented'
);

console.log('Validated Dropbox automatic-backup UI, boot integration, and setup contract.');
