# Tulona MCP

A read-only stdio MCP server that downloads Tulona's synchronized Dropbox backup.
The Tulona app can be on a different machine and does not need to be running.
The server uses its own Dropbox authorization and shares the app's backup
parser, schema/reference validation, and tracked-time interval calculations.

Requires Node.js 22 or newer. Git is also required for GitHub installation.
No npm publication or separate repository is needed.

## Connect Dropbox once on the MCP machine

Use **the same Dropbox account and app key configured in Tulona**. The key is
the public `EXPO_PUBLIC_DROPBOX_APP_KEY` used to build the app, available from
that app's Dropbox App Console settings. A different App Folder registration
has a different folder and will not see Tulona's backup. An app key is not an
app secret; do not supply an app secret.

First open Tulona's Dropbox panel and sync. The MCP reads `/tulona-backup.json`,
the JSON projection the app updates after synchronization. It does not read the
app's local storage or modify the sync file.

Run this in a terminal on the machine where your MCP client runs:

```bash
npx --yes --allow-git=all github:tannerkrewson/tulona#mcp login --app-key YOUR_DROPBOX_APP_KEY
```

Open the printed URL in a browser, approve read access, and paste the code
Dropbox displays back into the terminal. Login requests only
`files.content.read`, uses S256 PKCE, and requires no callback URL or server.
It saves an offline refresh token so subsequent MCP launches do not need login.

Credentials are stored in `credentials.json` under
`$XDG_CONFIG_HOME/tulona-mcp` or `~/.config/tulona-mcp`; on Windows,
`%APPDATA%\tulona-mcp`. The file has mode `0600` and a newly created directory
has mode `0700` on Unix. These are local credentials, independent of the
Tulona app. Do not put the refresh token in a shared project config.

For separate accounts or a custom location, set `TULONA_MCP_CONFIG_DIR` to an
absolute directory **both during login and in the MCP client's environment**.
Secret managers can instead supply both `TULONA_DROPBOX_APP_KEY` and
`TULONA_DROPBOX_REFRESH_TOKEN`; environment credentials take precedence over
the saved file. Login itself only needs the app key, optionally supplied as
`TULONA_DROPBOX_APP_KEY`.

## Add it to an MCP client

For Claude Desktop or Cursor, add this server to the client's MCP JSON config
(merge it into any existing `mcpServers` object):

```json
{
  "mcpServers": {
    "tulona": {
      "command": "npx",
      "args": ["--yes", "--allow-git=all", "github:tannerkrewson/tulona#mcp"]
    }
  }
}
```

VS Code uses a `servers` object in `.vscode/mcp.json` instead of `mcpServers`;
use the same entry and add `"type": "stdio"` inside it. Other clients that
accept a command and arguments can use these same values. Restart or reconnect
the client after adding the server. If a desktop app cannot find `npx`, use
its absolute path; on Windows it may need `npx.cmd`.

For a reproducible installation, replace `#mcp` with a full **distribution-branch**
commit SHA in both the login command and client config. Update the SHA when you
want a new build.
`--allow-git=all` permits the GitHub package source on recent npm versions.
The `mcp` branch contains the bundled executable, documentation, and licenses.
Its package has no dependencies or install hooks, so it needs neither
`--legacy-peer-deps` nor `--ignore-scripts`. CI updates that branch after the
MCP checks pass on `main`; all source and shared app code live on `main`.

Use `#mcp` for MCP installation, rather than `#main`: the source branch's root
package is the Expo app and still has its beta React Native peer requirements.
If you prefer a local source checkout, clone the repo and run the included
bundle directly:

```bash
git clone https://github.com/tannerkrewson/tulona.git
node /absolute/path/to/tulona/mcp/bin/tulona-mcp.cjs login --app-key YOUR_DROPBOX_APP_KEY
```

Then configure the client with:

```json
{
  "mcpServers": {
    "tulona": {
      "command": "node",
      "args": ["/absolute/path/to/tulona/mcp/bin/tulona-mcp.cjs"]
    }
  }
}
```

The bundle needs no `npm install` or build, and can run from any working
directory. Keep `THIRD_PARTY_LICENSES.txt` alongside it. Clients that only
accept an HTTPS MCP URL cannot launch this local stdio server.

## Available tools

| Tool                     | Purpose                                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `tulona_summary`         | Latest snapshot timestamps/revision, counts, settings, and active routine                                                                 |
| `tulona_query`           | Paginated folders, activities, routines, transitions, routine history, habits, habit day states, goals, weekly goal statuses, or settings |
| `tulona_activity_report` | Tracked duration by activity/routine in an explicit ISO timestamp range                                                                   |

Example requests: “What habits do I have?”, “Show my habit completions for
September”, “How much time did I spend on each activity last week?”, or “How
recent is my Tulona data?”

Queries support search, record/linked entity IDs, inclusive day ranges,
archived/superseded inclusion, and pagination. `limit` defaults to 50 and cannot
exceed 100. Follow `next_offset` until it is null. Results include the Dropbox
revision; if it changes between pages, re-run the query to obtain a consistent
view. Each tool call downloads a fresh backup. There is no stale-data fallback
when Dropbox is unavailable or validation fails.

All results describe the **last synchronized export**. `source.exportedAt`
tells you how old the app data is; `fetchedAt` only tells you when the server
downloaded it. A JSON projection can briefly lag the sync file during a
sync. The MCP does not observe live or unsynced app changes. Time reports stop
at the export timestamp, even when a timer was running, and use UTC or explicit
offsets rather than guessing the app machine's timezone. Habit dates are the
app's saved logical days. Query timestamp day filters use UTC calendar dates.

Backups are limited to 64 MiB; query pages are limited to 256 KiB. Invalid,
unsupported, or corrupt backups produce tool errors. The server only calls
Dropbox token and file-download endpoints and exposes no write tools.

## Check connection or remove credentials

Append `status` or `logout` to the same launcher used above:

```bash
node /absolute/path/to/tulona/mcp/bin/tulona-mcp.cjs status
node /absolute/path/to/tulona/mcp/bin/tulona-mcp.cjs logout
```

`status` downloads and validates the current backup. `logout` removes only the
MCP's saved credentials; it does not unlink the real app. Restart running MCP
clients to clear their in-memory access tokens. If you supplied credentials
through environment variables, remove those from the client's configuration.

If the backup is missing, verify the account and app key and sync Tulona again.
If Dropbox rejects authorization, repeat login. The server can initialize and
list tools before login, but data tools return a connection error until login
is complete. All CLI messages go to stderr; stdout is reserved for MCP.

## Development

Only the MCP package's dependencies are needed to rebuild it:

```bash
npm ci --prefix mcp --ignore-scripts --legacy-peer-deps=false
npm --prefix mcp run typecheck
npm --prefix mcp test
npm --prefix mcp run build
npm --prefix mcp run package
```

The committed `mcp/bin/tulona-mcp.cjs` bundles its runtime dependencies and the
shared app code. Rebuild it whenever shared backup or domain logic changes.
`Check read-only MCP` CI verifies the tests, independent typecheck, and that
the committed bundle matches the source, then updates the `mcp` distribution
branch on a successful `main` build. `package.mjs` creates that branch's
dependency-free package in `mcp/.package` by default, or in a supplied directory.
Dependency licenses are generated in `mcp/bin/THIRD_PARTY_LICENSES.txt`.
