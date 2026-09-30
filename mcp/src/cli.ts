import { createInterface } from 'node:readline/promises';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { authorization, DropboxReader, exchangeCode } from './dropbox';
import { configDirectory, forgetCredentials, saveCredentials } from './credentials';
import { createServer } from './server';

const help = `Tulona read-only Dropbox MCP (Node.js 22+)

  tulona-mcp                         Start the stdio MCP server
  tulona-mcp login --app-key KEY     Connect Dropbox on this machine
  tulona-mcp status                  Read the latest snapshot metadata
  tulona-mcp logout                  Remove this machine's saved credentials

Login requests only files.content.read and uses PKCE without an app secret.
Use the SAME Dropbox app key and account as Tulona, especially for App Folder apps.
You can also supply TULONA_DROPBOX_APP_KEY and TULONA_DROPBOX_REFRESH_TOKEN.
Credential directory: ${configDirectory()}
Override it with TULONA_MCP_CONFIG_DIR (useful for separate accounts).
`;

async function main() {
  if (Number(process.versions.node.split('.')[0]) < 22)
    throw new Error('Tulona MCP requires Node.js 22 or newer.');
  const [command = 'serve', ...args] = process.argv.slice(2);
  if (command === '--help' || command === '-h' || command === 'help') {
    console.error(help);
    return;
  }
  if (command === 'login') {
    if (args.length && !(args.length === 2 && args[0] === '--app-key')) throw new Error(help);
    const appKey = (args[1] ?? process.env.TULONA_DROPBOX_APP_KEY ?? '').trim();
    if (!appKey)
      throw new Error(
        'Run login --app-key YOUR_APP_KEY, using the same app key configured in Tulona.'
      );
    if (!process.stdin.isTTY)
      throw new Error(
        'Run Dropbox login in an interactive terminal before starting the MCP server.'
      );
    const pending = authorization(appKey);
    console.error(
      `Open this URL in your browser, approve read access, and copy the authorization code shown by Dropbox:\n\n${pending.url}\n`
    );
    const terminal = createInterface({ input: process.stdin, output: process.stderr });
    try {
      const code = await terminal.question('Dropbox authorization code: ');
      await saveCredentials(await exchangeCode(appKey, code, pending.verifier));
    } finally {
      terminal.close();
    }
    console.error('Dropbox connected. You can now start the MCP server.');
    return;
  }
  if (args.length) throw new Error(help);
  if (command === 'logout') {
    await forgetCredentials();
    console.error(
      'Saved MCP credentials removed. Restart MCP clients to clear their in-memory tokens. Environment credentials, if configured, must also be removed from the client configuration.'
    );
    return;
  }
  const reader = new DropboxReader();
  if (command === 'status') {
    const snapshot = await reader.snapshot();
    console.error(JSON.stringify({ source: snapshot.source, counts: snapshot.summary }, null, 2));
    return;
  }
  if (command !== 'serve') throw new Error(help);
  const server = createServer(reader);
  await server.connect(new StdioServerTransport());
  const shutdown = () => {
    void server.close().then(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Tulona MCP failed.');
  process.exitCode = 1;
});
