import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface Credentials {
  version: 1;
  appKey: string;
  refreshToken: string;
}

export function configDirectory(env: NodeJS.ProcessEnv = process.env): string {
  if (env.TULONA_MCP_CONFIG_DIR) return env.TULONA_MCP_CONFIG_DIR;
  const base = process.platform === 'win32' ? env.APPDATA : env.XDG_CONFIG_HOME;
  return join(base || join(homedir(), '.config'), 'tulona-mcp');
}

function validate(value: unknown): Credentials {
  const record = value as Partial<Credentials> | null;
  if (
    !record ||
    record.version !== 1 ||
    typeof record.appKey !== 'string' ||
    !record.appKey.trim() ||
    typeof record.refreshToken !== 'string' ||
    !record.refreshToken.trim()
  ) {
    throw new Error('Dropbox credentials are invalid. Run tulona-mcp login again.');
  }
  return { version: 1, appKey: record.appKey.trim(), refreshToken: record.refreshToken.trim() };
}

export async function readCredentials(
  directory = configDirectory(),
  env: NodeJS.ProcessEnv = process.env
): Promise<Credentials> {
  // An app key alone can be set for login; only a supplied refresh token selects env credentials.
  if (env.TULONA_DROPBOX_REFRESH_TOKEN) {
    return validate({
      version: 1,
      appKey: env.TULONA_DROPBOX_APP_KEY,
      refreshToken: env.TULONA_DROPBOX_REFRESH_TOKEN,
    });
  }
  const file = join(directory, 'credentials.json');
  let raw: string;
  try {
    const information = await stat(file);
    if (process.platform !== 'win32' && (information.mode & 0o077) !== 0) {
      throw new Error('Dropbox credential file must be private (chmod 600), or run login again.');
    }
    raw = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        'Dropbox is not connected. Run tulona-mcp login --app-key YOUR_APP_KEY in a terminal on this machine.'
      );
    }
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Dropbox credential file is invalid. Run tulona-mcp login again.');
  }
  return validate(value);
}

export async function saveCredentials(credentials: Credentials, directory = configDirectory()) {
  const validated = validate(credentials);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `.credentials-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(validated)}\n`, { mode: 0o600, flag: 'wx' });
    await rename(temporary, join(directory, 'credentials.json'));
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function forgetCredentials(directory = configDirectory()) {
  await rm(join(directory, 'credentials.json'), { force: true });
}
