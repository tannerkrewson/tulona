import { DropboxBackupService } from '../src/backup/dropbox-backup';
import { emptyDropboxBackupRecord } from '../src/backup/dropbox-backup-storage';
import { AsyncStorageDatabase, DatasetManager, type AsyncStorageLike } from '../src/data';
import { BootCoordinator } from '../src/orchestration/boot-coordinator';

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
/* eslint-enable @typescript-eslint/no-require-imports */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Every storage call crosses the native bridge on a phone, so reads are budgeted. */
class CountingStorage implements AsyncStorageLike {
  readonly values = new Map<string, string>();
  reads = 0;
  writes = 0;
  bytesRead = 0;

  async getItem(key: string): Promise<string | null> {
    this.reads += 1;
    const value = this.values.get(key) ?? null;
    this.bytesRead += value?.length ?? 0;
    return value;
  }

  async multiGet(keys: readonly string[]) {
    this.reads += 1;
    return keys.map((key) => {
      const value = this.values.get(key) ?? null;
      this.bytesRead += value?.length ?? 0;
      return [key, value] as const;
    });
  }

  async setItem(key: string, value: string): Promise<void> {
    this.writes += 1;
    this.values.set(key, value);
  }

  async multiSet(entries: readonly (readonly [string, string])[]) {
    this.writes += 1;
    for (const [key, value] of entries) this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.writes += 1;
    this.values.delete(key);
  }

  async multiRemove(keys: readonly string[]) {
    this.writes += 1;
    for (const key of keys) this.values.delete(key);
  }

  async getAllKeys(): Promise<readonly string[]> {
    this.reads += 1;
    return [...this.values.keys()];
  }

  reset() {
    this.reads = 0;
    this.writes = 0;
    this.bytesRead = 0;
  }
}

/** Four years of back-to-back sessions across a handful of tasks. */
function syntheticTimematorCsv(): string {
  const tasks = ['Work', 'Exercise', 'Reading', 'Cooking', 'Sleep', 'Leisure'];
  const rows = ['unix_begin;unix_end;date;begin;end;folder;task;duration;duration_decimal'];
  const end = Math.floor(Date.now() / 1000) - 3600;
  let begin = end - 4 * 365 * 86_400;
  let index = 0;
  while (begin < end) {
    const length = 1800 + ((index * 7919) % 9000);
    const stop = Math.min(begin + length, end);
    rows.push(
      `${begin};${stop};2023-01-01;12:00 PM;12:30 PM;"";"${tasks[index % tasks.length]}";0:30;0.5`
    );
    begin = stop;
    index += 1;
  }
  return rows.join('\n');
}

const storage = new CountingStorage();
const results: { label: string; ms: number; reads: number; writes: number; mb: number }[] = [];

async function measure<T>(label: string, task: () => Promise<T>): Promise<T> {
  storage.reset();
  const started = performance.now();
  const value = await task();
  results.push({
    label,
    ms: Math.round(performance.now() - started),
    reads: storage.reads,
    writes: storage.writes,
    mb: Math.round((storage.bytesRead / 1_000_000) * 10) / 10,
  });
  return value;
}

function readsFor(label: string): number {
  return results.find((result) => result.label === label)?.reads ?? Number.POSITIVE_INFINITY;
}

class MemoryDropbox {
  private readonly files = new Map<string, { rev: string; contents: string }>();
  private revision = 0;
  downloads = 0;

  private file(path: string) {
    const file = this.files.get(path);
    if (!file) {
      throw Object.assign(new Error('not_found'), {
        status: 409,
        error: { error: { '.tag': 'not_found' } },
      });
    }
    return file;
  }

  async filesGetMetadata(args: { path: string }): Promise<unknown> {
    return { result: { '.tag': 'file', rev: this.file(args.path).rev } };
  }

  async filesDownload(args: { path: string }): Promise<unknown> {
    this.downloads += 1;
    const file = this.file(args.path);
    return { result: { rev: file.rev, fileBinary: new TextEncoder().encode(file.contents) } };
  }

  async filesUpload(upload: { path: string; contents: string }): Promise<unknown> {
    const rev = `rev-${++this.revision}`;
    this.files.set(upload.path, { rev, contents: upload.contents });
    return { result: { rev } };
  }
}

async function dropboxHarness(runtime: Awaited<ReturnType<typeof boot>>) {
  await runtime.database.write(
    'tulona:dropbox-backup',
    JSON.stringify({
      ...emptyDropboxBackupRecord(),
      enabled: true,
      refreshToken: 'refresh-token',
      accessToken: 'access-token',
      accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    })
  );
  const dropbox = new MemoryDropbox();
  const service = new DropboxBackupService(runtime.services.backup, runtime.database, {
    appKey: 'perf-app-key',
    redirectUri: 'https://example.test/dropbox-auth',
    authFactory: () => ({}) as never,
    clientFactory: () => dropbox as never,
  });
  return { dropbox, service };
}

async function boot() {
  const database = new AsyncStorageDatabase(storage);
  const coordinator = new BootCoordinator(database, new DatasetManager(database));
  const { runtime } = await coordinator.hydrate();
  assert(runtime, 'boot should produce a runtime');
  return runtime;
}

async function main() {
  const csvPath = process.env.TULONA_PERF_CSV;
  const csv: string = csvPath ? fs.readFileSync(csvPath, 'utf8') : syntheticTimematorCsv();
  const first = await measure('first boot (empty)', boot);
  const summary = await measure('import CSV', () =>
    first.services.timematorImport.importCsv(csv).then((result) => result.summary)
  );

  const runtime = await measure('boot with history', boot);
  const tracker = runtime.services.tracker;
  const store = runtime.stores.tracker;
  const activity = runtime.catalog.activities[0];
  assert(activity, 'the import should create activities');

  await measure('tracker store refresh', () => store.getState().refresh());
  const active = await measure('switch activity', () =>
    store.getState().switchActivity(activity.id)
  );
  await measure('open active session (context)', () => tracker.getTransitionContext(active.id));
  await measure('active transition lookup', () => tracker.getActiveTransition());
  await measure('stop activity', () => store.getState().switchActivity(null));
  const yearStart = Date.now() - 365 * 86_400_000;
  await measure('query last year', () => tracker.query({ startMs: yearStart, endMs: Date.now() }));

  const { dropbox, service: sync } = await dropboxHarness(runtime);
  await measure('first Dropbox sync', () => sync.syncNow());
  const downloadsBeforeSwitch = dropbox.downloads;
  await store.getState().switchActivity(activity.id);
  await measure('Dropbox sync after one switch', () => sync.syncNow({ automatic: true }));
  await measure('Dropbox sync with no changes', () => sync.syncNow({ automatic: true }));
  assert(
    dropbox.downloads === downloadsBeforeSwitch,
    'syncing this device’s own edits must not download Dropbox again'
  );

  if (csvPath || process.env.TULONA_PERF_VERBOSE) {
    console.log(`Imported ${summary.insertedTransitions} transitions.`);
    console.table(results);
  }

  assert(readsFor('first boot (empty)') < 60, 'an empty boot must not scan every possible month');
  assert(readsFor('boot with history') < 60, 'boot must load tracker history in one batch');
  assert(readsFor('tracker store refresh') === 0, 'store refresh must be served from memory');
  assert(readsFor('open active session (context)') === 0, 'session context must not read storage');
  assert(readsFor('active transition lookup') === 0, 'the active session must not read storage');
  assert(readsFor('switch activity') < 40, 'switching must only touch the journal and one month');
  assert(readsFor('stop activity') < 40, 'stopping must only touch the journal and one month');
  console.log(
    `Large history (${summary.insertedTransitions} transitions) stays in memory after boot.`
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
