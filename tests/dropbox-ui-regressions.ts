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
const syncDocument = read('src/backup/dropbox-sync-document.ts');
const readme = read('README.md');
const compactReadme = readme.replace(/\s+/g, ' ');
const packageJson = JSON.parse(read('package.json')) as {
  dependencies?: { dropbox?: string; yjs?: string; 'expo-crypto'?: string };
};

assert(packageJson.dependencies?.dropbox, 'the official Dropbox npm package must be installed');
assert(
  packageJson.dependencies?.yjs && packageJson.dependencies['expo-crypto'],
  'Yjs and the native Web Crypto provider must be installed'
);
assert(
  backup.includes('DROPBOX_SYNC_PATH') &&
    backup.includes("'.tag': 'update'") &&
    backup.includes("'.tag': 'add'") &&
    backup.includes('strict_conflict: true') &&
    backup.includes('DROPBOX_BACKUP_PATH'),
  'Dropbox synchronization must use a separate file with revision-checked writes'
);
assert(
  backup.includes('startAutomaticBackups') &&
    backup.includes('syncQueue') &&
    backup.includes('DROPBOX_BACKUP_DEFAULT_DEBOUNCE_MS') &&
    backup.includes('visibilitychange') &&
    backup.includes("addEventListener('online'"),
  'automatic synchronization must be debounced, serialized, and retried on focus/reconnect'
);
assert(
  backup.includes("import('./dropbox-sync-document')") &&
    backup.startsWith("import './web-crypto';") &&
    syncDocument.startsWith("import './web-crypto';") &&
    backup.includes('subscribeToAppForeground'),
  'Yjs must load lazily after Web Crypto is installed, and sync must resume when the app returns'
);
assert(
  syncDocument.includes('Y.applyUpdateV2') &&
    syncDocument.includes('habitDayStates:') &&
    syncDocument.includes('goalStatuses:') &&
    syncDocument.includes('repairReferences'),
  'the sync document must key records by identity and repair concurrent deletions'
);
assert(
  screen.includes('dropbox-connect') &&
    screen.includes('dropbox-auto-backup-enabled') &&
    screen.includes('dropbox-backup-now') &&
    screen.includes('dropbox-disconnect') &&
    screen.includes('dropbox-sync-unsupported'),
  'backup UI must expose connect, automatic, manual, and disconnect actions'
);
assert(
  callback.includes('completeAuthorization') && callback.includes('syncNow'),
  'Dropbox OAuth callback must complete authorization and start synchronization'
);
assert(
  coordinator.includes('dropboxBackup.startAutomaticBackups()') &&
    coordinator.includes('stopAutomaticBackups'),
  'boot must start automatic backups and clean them up on reset'
);
assert(
  readme.includes('EXPO_PUBLIC_DROPBOX_APP_KEY') &&
    readme.includes('tulona://dropbox-auth') &&
    readme.includes('tulona-backup.json') &&
    readme.includes('files.content.read') &&
    readme.includes('files.metadata.read') &&
    readme.includes('tulona-sync.yjs'),
  'Dropbox setup, OAuth scopes, and sync-file policy must be documented'
);
assert(
  compactReadme.includes('Yjs') && compactReadme.includes('tulona://dropbox-auth'),
  'the sync design and its iOS Dropbox redirect setup must be documented'
);

console.log('Validated Dropbox synchronization UI, boot integration, and setup contract.');
