import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { parseBackup } from '../../src/backup/backup-import';
import type { LifeTrackerBackup } from '../../src/backup/backup-schema';
import { defaultGoalSettings } from '../../src/domain/goals';
import { forgetCredentials, readCredentials, saveCredentials } from '../src/credentials';
import {
  authorization,
  DropboxReader,
  exchangeCode,
  MAX_BACKUP_BYTES,
  type Snapshot,
} from '../src/dropbox';
import { activityReport, query } from '../src/queries';
import { createServer } from '../src/server';

const ACTIVITY = '11111111-1111-4111-8111-111111111111';
const HABIT = '22222222-2222-4222-8222-222222222222';
const STAMP = '2026-09-01T12:00:00.000Z';
const credentials = {
  version: 1 as const,
  appKey: 'test-key',
  refreshToken: 'private-refresh-token',
};

function fixture(): LifeTrackerBackup {
  return {
    format: 'life-tracker-backup',
    backupVersion: 1,
    schemaVersion: 2,
    exportedAt: STAMP,
    appVersion: '0.1.0',
    settings: {
      settingsVersion: 1,
      logicalDayRolloverHour: 0,
      appearance: 'system',
      weekStartsOn: 0,
      minimumActivityDurationMs: 0,
      alarmSettings: { enabled: false, leadTimeMs: 0, sound: true, vibration: true, volume: 1 },
      defaultRoutineBehavior: 'resume',
      showArchived: false,
    },
    catalog: {
      folders: [],
      routines: [],
      activities: [
        {
          id: ACTIVITY,
          kind: 'activity',
          name: 'Work',
          folderId: null,
          sortOrder: 0,
          color: null,
          iconName: null,
          createdAt: STAMP,
          updatedAt: STAMP,
          archivedAt: null,
        },
      ],
    },
    routineDefinitions: [],
    routineHistory: [],
    activeRoutine: null,
    transitions: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        activityId: ACTIVITY,
        timestamp: '2026-09-01T10:00:00.000Z',
        source: 'manual',
        status: 'recorded',
        createdAt: STAMP,
        correctionOfId: null,
        note: 'Started work',
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        activityId: null,
        timestamp: '2026-09-01T11:00:00.000Z',
        source: 'manual',
        status: 'recorded',
        createdAt: STAMP,
        correctionOfId: null,
        note: null,
      },
    ],
    habits: [
      {
        id: HABIT,
        name: 'Walk',
        sortOrder: 0,
        schedule: { kind: 'daily' },
        trigger: null,
        color: null,
        iconName: null,
        createdAt: STAMP,
        updatedAt: STAMP,
        archivedAt: null,
      },
    ],
    habitDayStates: [
      { habitId: HABIT, logicalDay: '2026-09-01', manual: true, automatic: null, updatedAt: STAMP },
      {
        habitId: HABIT,
        logicalDay: '2026-08-31',
        manual: false,
        automatic: null,
        updatedAt: STAMP,
      },
    ],
    goals: [],
    goalSettings: defaultGoalSettings(),
    goalWeeks: [],
  };
}

function snapshot(backup = fixture()): Snapshot {
  const parsed = parseBackup(backup);
  return {
    ...parsed,
    source: {
      path: '/tulona-backup.json',
      revision: 'rev-one',
      modifiedAt: STAMP,
      exportedAt: backup.exportedAt,
      fetchedAt: STAMP,
    },
  };
}

function download(backup = fixture(), revision = 'rev-one') {
  return new Response(JSON.stringify(backup), {
    headers: { 'Dropbox-API-Result': JSON.stringify({ rev: revision, server_modified: STAMP }) },
  });
}

const token = () =>
  new Response(JSON.stringify({ access_token: 'private-access-token', expires_in: 3600 }));

test('manual authorization uses S256 PKCE, offline access, and only the read scope', async () => {
  const pending = authorization(credentials.appKey);
  const url = new URL(pending.url);
  assert.equal(url.searchParams.get('scope'), 'files.content.read');
  assert.equal(url.searchParams.get('token_access_type'), 'offline');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(
    url.searchParams.get('code_challenge'),
    createHash('sha256').update(pending.verifier).digest('base64url')
  );
  assert.equal(url.searchParams.has('redirect_uri'), false);
  assert.equal(url.searchParams.has('client_secret'), false);
  const result = await exchangeCode(
    credentials.appKey,
    'code',
    pending.verifier,
    async (_url, init) => {
      const body = init?.body as URLSearchParams;
      assert.equal(body.get('code_verifier'), pending.verifier);
      assert.equal(body.get('grant_type'), 'authorization_code');
      assert.equal(body.has('client_secret'), false);
      return new Response(
        JSON.stringify({
          access_token: 'unused-access-token',
          expires_in: 3600,
          refresh_token: credentials.refreshToken,
        })
      );
    }
  );
  assert.deepEqual(result, credentials);
});

test('credentials persist privately, support env injection, and logout removes them', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tulona-credentials-'));
  try {
    await saveCredentials(credentials, directory);
    assert.deepEqual(await readCredentials(directory, {}), credentials);
    if (process.platform !== 'win32')
      assert.equal((await stat(join(directory, 'credentials.json'))).mode & 0o777, 0o600);
    assert.deepEqual(
      await readCredentials(directory, {
        TULONA_DROPBOX_APP_KEY: credentials.appKey,
        TULONA_DROPBOX_REFRESH_TOKEN: credentials.refreshToken,
      }),
      credentials
    );
    await assert.rejects(
      readCredentials(directory, { TULONA_DROPBOX_REFRESH_TOKEN: credentials.refreshToken }),
      /invalid/
    );
    await writeFile(
      join(directory, 'credentials.json'),
      'not-json containing private-refresh-token'
    );
    await assert.rejects(
      readCredentials(directory, {}),
      (error: Error) => !error.message.includes(credentials.refreshToken)
    );
    await forgetCredentials(directory);
    await assert.rejects(readCredentials(directory, {}), /not connected/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('reader refreshes once, downloads fresh snapshots each time, and only calls read/token endpoints', async () => {
  let refreshes = 0;
  let downloads = 0;
  const reader = new DropboxReader(
    async () => credentials,
    async (url, init) => {
      if (String(url).endsWith('/oauth2/token')) {
        refreshes++;
        assert.equal(
          (init?.body as URLSearchParams).get('refresh_token'),
          credentials.refreshToken
        );
        return token();
      }
      assert.equal(String(url), 'https://content.dropboxapi.com/2/files/download');
      assert.equal(
        (init?.headers as Record<string, string>)['Dropbox-API-Arg'],
        '{"path":"/tulona-backup.json"}'
      );
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        'Bearer private-access-token'
      );
      downloads++;
      const backup = fixture();
      backup.habits[0]!.name = `Walk ${downloads}`;
      return download(backup, `rev-${downloads}`);
    }
  );
  const first = await reader.snapshot();
  const second = await reader.snapshot();
  assert.equal(refreshes, 1);
  assert.equal(downloads, 2);
  assert.equal(first.backup.habits[0]!.name, 'Walk 1');
  assert.equal(second.backup.habits[0]!.name, 'Walk 2');
  assert.equal(second.source.revision, 'rev-2');
});

test('concurrent calls share token refresh and a 401 causes one refresh retry', async () => {
  let refreshes = 0;
  let downloads = 0;
  const reader = new DropboxReader(
    async () => credentials,
    async (url) => {
      if (String(url).endsWith('/oauth2/token')) {
        refreshes++;
        return token();
      }
      downloads++;
      return download();
    }
  );
  await Promise.all([reader.snapshot(), reader.snapshot()]);
  assert.equal(refreshes, 1);
  assert.equal(downloads, 2);
  refreshes = 0;
  downloads = 0;
  const unauthorized = new DropboxReader(
    async () => credentials,
    async (url) => {
      if (String(url).endsWith('/oauth2/token')) {
        refreshes++;
        return token();
      }
      return ++downloads === 1 ? new Response('', { status: 401 }) : download();
    }
  );
  await unauthorized.snapshot();
  assert.equal(refreshes, 2);
  assert.equal(downloads, 2);
});

test('bad authorization responses do not expose tokens in errors', async () => {
  for (const response of [
    new Response('private-refresh-token', { status: 400 }),
    new Response('private-refresh-token'),
    new Response('null'),
  ]) {
    await assert.rejects(
      exchangeCode('key', 'code', 'verifier', async () => response),
      (error: Error) =>
        /authorization/.test(error.message) && !error.message.includes('private-refresh-token')
    );
  }
});

test('missing files, invalid references, and oversized files fail instead of returning stale data', async () => {
  const responses = [
    new Response(JSON.stringify({ error_summary: 'path/not_found/' }), { status: 409 }),
    download({
      ...fixture(),
      transitions: [
        { ...fixture().transitions[0]!, activityId: '55555555-5555-4555-8555-555555555555' },
      ],
    }),
    new Response('too big', {
      headers: {
        'content-length': String(MAX_BACKUP_BYTES + 1),
        'Dropbox-API-Result': '{"rev":"rev-one","server_modified":"now"}',
      },
    }),
  ];
  const patterns = [/Sync Tulona/, /invalid references/, /64 MiB/];
  for (let i = 0; i < responses.length; i++) {
    const reader = new DropboxReader(
      async () => credentials,
      async (url) => (String(url).endsWith('/oauth2/token') ? token() : responses[i]!)
    );
    await assert.rejects(reader.snapshot(), patterns[i]!);
  }
});

test('temporary Dropbox failures retry with a bound', async () => {
  let downloads = 0;
  const reader = new DropboxReader(
    async () => credentials,
    async (url) => {
      if (String(url).endsWith('/oauth2/token')) return token();
      return ++downloads < 3 ? new Response('', { status: 503 }) : download();
    }
  );
  await reader.snapshot();
  assert.equal(downloads, 3);
});

test('queries filter linked IDs/days and page deterministically; archived records are opt-in', () => {
  const data = snapshot();
  const page = query(data, { collection: 'habit_days', entity_id: HABIT, limit: 1 });
  assert.equal(page.records[0]!.logicalDay, '2026-09-01');
  assert.equal(page.total, 2);
  assert.equal(page.next_offset, 1);
  assert.equal(
    query(data, { collection: 'habit_days', offset: 1 }).records[0]!.logicalDay,
    '2026-08-31'
  );
  assert.equal(
    query(data, { collection: 'habit_days', from_day: '2026-09-01', to_day: '2026-09-01' }).total,
    1
  );
  assert.equal(
    query(data, { collection: 'activities', search: 'work', record_id: ACTIVITY }).total,
    1
  );
  assert.equal(query(data, { collection: 'transitions', entity_id: ACTIVITY }).total, 1);
  data.backup.catalog.activities[0]!.archivedAt = STAMP;
  assert.equal(query(data, { collection: 'activities' }).total, 0);
  assert.equal(query(data, { collection: 'activities', include_archived: true }).total, 1);
  assert.throws(
    () => query(data, { collection: 'habits', from_day: '2026-09-02', to_day: '2026-09-01' }),
    /from_day/
  );
});

test('reports use shared interval semantics, include the earlier transition, and never extrapolate beyond export', () => {
  const data = snapshot();
  const report = activityReport(data, '2026-09-01T10:30:00.000Z', '2026-09-01T15:00:00.000Z');
  assert.equal(report.tracked_ms, 30 * 60_000);
  assert.equal(report.idle_ms, 60 * 60_000);
  assert.equal(report.activities[0]!.name, 'Work');
  assert.equal(report.observed_through, STAMP);
  data.backup.transitions[1]!.status = 'superseded';
  assert.equal(
    activityReport(data, '2026-09-01T10:00:00.000Z', '2026-09-01T15:00:00.000Z').tracked_ms,
    2 * 60 * 60_000
  );
  assert.equal(
    activityReport(data, '2026-09-02T10:00:00.000Z', '2026-09-02T15:00:00.000Z').tracked_ms,
    0
  );
});

test('real MCP client discovers annotated tools, calls them, and gets validation and provider errors', async () => {
  let fail = false;
  const server = createServer({
    snapshot: async () => {
      if (fail) throw new Error('Dropbox unavailable');
      return snapshot();
    },
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 3);
    assert(tools.every((tool) => tool.annotations?.readOnlyHint));
    const result = await client.callTool({
      name: 'tulona_query',
      arguments: { collection: 'habit_days', limit: 1 },
    });
    assert.equal(result.isError, undefined);
    const content = result.content as { text: string }[];
    assert.equal(JSON.parse(content[0]!.text).records.length, 1);
    const invalid = await client.callTool({
      name: 'tulona_query',
      arguments: { collection: 'habit_days', from_day: '2026-02-30' },
    });
    assert.equal(invalid.isError, true);
    fail = true;
    const failure = await client.callTool({ name: 'tulona_summary', arguments: {} });
    assert.equal(failure.isError, true);
    assert.match(JSON.stringify(failure.content), /Dropbox unavailable/);
  } finally {
    await client.close();
    await server.close();
  }
});

test('shipped bundle launches over stdio on a clean machine before login without stdout contamination', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tulona-stdio-'));
  const binary = resolve('bin/tulona-mcp.cjs');
  const environment: NodeJS.ProcessEnv = { ...process.env, TULONA_MCP_CONFIG_DIR: directory };
  delete environment.TULONA_DROPBOX_APP_KEY;
  delete environment.TULONA_DROPBOX_REFRESH_TOKEN;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [binary],
    env: environment as Record<string, string>,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'stdio-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    assert.equal((await client.listTools()).tools.length, 3);
    const result = await client.callTool({ name: 'tulona_summary', arguments: {} });
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(result.content), /not connected/);
    const help = spawnSync(process.execPath, [binary, '--help'], { encoding: 'utf8' });
    assert.equal(help.status, 0);
    assert.equal(help.stdout, '');
    assert.match(help.stderr, /login/);
    assert(!(await readFile(binary, 'utf8')).includes('private-refresh-token'));
  } finally {
    await client.close();
    await rm(directory, { recursive: true, force: true });
  }
});
