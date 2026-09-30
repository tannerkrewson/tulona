import { createHash, randomBytes } from 'node:crypto';
import { parseBackup, type BackupImportSummary } from '../../src/backup/backup-import';
import type { LifeTrackerBackup } from '../../src/backup/backup-schema';
import { readCredentials, type Credentials } from './credentials';

export const BACKUP_PATH = '/tulona-backup.json';
export const MAX_BACKUP_BYTES = 64 * 1024 * 1024;
const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
type Fetch = typeof fetch;

export interface Snapshot {
  backup: LifeTrackerBackup;
  summary: BackupImportSummary;
  source: {
    path: string;
    revision: string;
    modifiedAt: string;
    exportedAt: string;
    fetchedAt: string;
  };
}

/** No callback listener or app secret is needed for Dropbox's manual code flow. */
export function authorization(appKey: string) {
  if (!appKey.trim()) throw new Error('A Dropbox app key is required.');
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const url = new URL('https://www.dropbox.com/oauth2/authorize');
  url.search = new URLSearchParams({
    client_id: appKey.trim(),
    response_type: 'code',
    token_access_type: 'offline',
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: 'files.content.read',
  }).toString();
  return { verifier, url: url.toString() };
}

async function request(url: string, init: RequestInit, fetcher: Fetch): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try {
      response = await fetcher(url, { ...init, signal: AbortSignal.timeout(20_000) });
    } catch {
      throw new Error(
        'Dropbox could not be reached within 20 seconds. Check your connection and try again.'
      );
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      const retryAfter = Number(response.headers.get('retry-after'));
      await response.body?.cancel();
      const delay = Math.min(2000, Math.max(200 * 2 ** attempt, (retryAfter || 0) * 1000));
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    return response;
  }
  throw new Error('Dropbox is temporarily unavailable. Try again.');
}

async function tokenRequest(parameters: Record<string, string>, fetcher: Fetch) {
  const response = await request(
    TOKEN_URL,
    {
      method: 'POST',
      body: new URLSearchParams(parameters),
    },
    fetcher
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      response.status === 400 || response.status === 401
        ? 'Dropbox authorization failed. Run tulona-mcp login again with the same Dropbox app key used by Tulona.'
        : `Dropbox authorization is unavailable (HTTP ${response.status}). Try again.`
    );
  }
  let value: Record<string, unknown>;
  try {
    value = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new Error('Dropbox returned an invalid authorization response.');
  }
  if (
    !value ||
    typeof value.access_token !== 'string' ||
    !value.access_token ||
    typeof value.expires_in !== 'number' ||
    !Number.isFinite(value.expires_in) ||
    value.expires_in <= 0
  ) {
    throw new Error('Dropbox returned an invalid authorization response.');
  }
  return value as { access_token: string; expires_in: number; refresh_token?: unknown };
}

export async function exchangeCode(
  appKey: string,
  code: string,
  verifier: string,
  fetcher: Fetch = fetch
): Promise<Credentials> {
  if (!code.trim()) throw new Error('An authorization code is required.');
  const value = await tokenRequest(
    {
      grant_type: 'authorization_code',
      client_id: appKey,
      code: code.trim(),
      code_verifier: verifier,
    },
    fetcher
  );
  if (typeof value.refresh_token !== 'string' || !value.refresh_token) {
    throw new Error('Dropbox did not return offline access. Run login again.');
  }
  return { version: 1, appKey, refreshToken: value.refresh_token };
}

async function boundedText(response: Response): Promise<string> {
  if (Number(response.headers.get('content-length')) > MAX_BACKUP_BYTES) {
    await response.body?.cancel();
    throw new Error('The Tulona backup exceeds the 64 MiB download limit.');
  }
  if (!response.body) throw new Error('Dropbox returned an empty backup.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BACKUP_BYTES) {
        await reader.cancel();
        throw new Error('The Tulona backup exceeds the 64 MiB download limit.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, length).toString('utf8');
}

export class DropboxReader {
  private accessToken: { value: string; expiresAt: number } | null = null;
  private refreshing: Promise<string> | null = null;

  constructor(
    private readonly credentials: () => Promise<Credentials> = readCredentials,
    private readonly fetcher: Fetch = fetch
  ) {}

  private token(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) {
      return Promise.resolve(this.accessToken.value);
    }
    this.refreshing ??= this.refresh();
    return this.refreshing;
  }

  private async refresh(): Promise<string> {
    try {
      const credentials = await this.credentials();
      const token = await tokenRequest(
        {
          grant_type: 'refresh_token',
          client_id: credentials.appKey,
          refresh_token: credentials.refreshToken,
        },
        this.fetcher
      );
      this.accessToken = {
        value: token.access_token,
        expiresAt: Date.now() + token.expires_in * 1000,
      };
      return token.access_token;
    } finally {
      this.refreshing = null;
    }
  }

  /** Every call reads Dropbox again; unavailable or invalid data never falls back to a stale cache. */
  async snapshot(): Promise<Snapshot> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.token();
      const response = await request(
        'https://content.dropboxapi.com/2/files/download',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Dropbox-API-Arg': JSON.stringify({ path: BACKUP_PATH }),
          },
        },
        this.fetcher
      );
      if (response.status === 401 && attempt === 0) {
        await response.body?.cancel();
        this.accessToken = null;
        continue;
      }
      if (!response.ok) {
        const status = response.status;
        // Only inspect the error tag, never return the API body or credentials to the MCP host.
        const error =
          status === 409
            ? ((await response.json().catch(() => null)) as { error_summary?: unknown } | null)
            : null;
        await response.body?.cancel().catch(() => undefined);
        if (
          status === 409 &&
          typeof error?.error_summary === 'string' &&
          error.error_summary.startsWith('path/not_found')
        ) {
          throw new Error(
            'No /tulona-backup.json was found. Sync Tulona to Dropbox first and use the same Dropbox account and app key (App Folder registrations have separate folders).'
          );
        }
        throw new Error(
          status === 401 || status === 403
            ? 'Dropbox read access was rejected. Run tulona-mcp login again.'
            : `Dropbox download failed (HTTP ${status}). Try again.`
        );
      }
      let metadata: { rev?: unknown; server_modified?: unknown };
      try {
        metadata = JSON.parse(response.headers.get('dropbox-api-result') || '');
      } catch {
        await response.body?.cancel();
        throw new Error('Dropbox returned invalid backup metadata.');
      }
      if (typeof metadata?.rev !== 'string' || typeof metadata?.server_modified !== 'string') {
        await response.body?.cancel();
        throw new Error('Dropbox returned invalid backup metadata.');
      }
      const { backup, summary } = parseBackup(await boundedText(response));
      if (!Number.isFinite(Date.parse(backup.exportedAt)))
        throw new Error('The backup export timestamp is invalid. Sync Tulona again.');
      return {
        backup,
        summary,
        source: {
          path: BACKUP_PATH,
          revision: metadata.rev,
          modifiedAt: metadata.server_modified,
          exportedAt: backup.exportedAt,
          fetchedAt: new Date().toISOString(),
        },
      };
    }
    throw new Error('Dropbox read access was rejected. Run tulona-mcp login again.');
  }
}
