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

| Tool                     | Purpose                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `tulona_day_overview`    | One-call snapshot freshness, latest recorded activity/start, day totals in minutes, and optional timeline              |
| `tulona_summary`         | Snapshot freshness, counts, settings, and active routine                                                               |
| `tulona_query`           | Compact, paginated catalog, transitions, routine history, habits, habit days, goals, weekly goal statuses, or settings |
| `tulona_activity_report` | Tracked, idle, and unknown minutes in an explicit timestamp range                                                      |

For day questions, start with `tulona_day_overview`:

```json
{ "day": "2026-09-01", "timezone": "America/New_York", "day_kind": "calendar", "timeline": true }
```

`day` defaults to the current day in the requested timezone. `timezone` defaults
to UTC, never the server machine's timezone. `day_kind` defaults to `calendar`
(midnight to midnight); `logical` uses `settings.logicalDayRolloverHour` from
the snapshot (normally 5 a.m.). DST boundaries use local dates, so calendar
days can be 23 or 25 hours. Responses state the day kind, timezone, UTC bounds,
and logical rollover when applicable. Timeline timestamps include local offsets.
`latest_recorded` describes the last recorded transition across **all days**
at the snapshot cutoff, with its actual start time; it is null when no state is
known. `Idle` means an explicit stop transition. It does not claim live activity.

The optional timeline includes tracked and idle intervals, clipped to the day
and export cutoff. It defaults to 100 entries; use `timeline_limit` (1–100),
`timeline_offset`, and `timeline_next_offset` to page. Activity totals include
all matching intervals; the overview shows the top 100 activities and reports
`total_activities` and `truncated`. Use `tulona_activity_report` for other ranges
or raw transition queries for detailed auditing.

### Compact records and auditing

Query records default to `detail: "compact"`. Events resolve linked names and
omit repeated activity/routine snapshots, event UUIDs, colors/icons, bookkeeping
timestamps, and null fields. Catalog definitions retain their IDs for follow-up
queries. Historical snapshot names take precedence over renamed catalog entries.
Compact routine history shows routine name, status, start/end, and duration;
full mode includes step sessions and snapshots. Compact durations use minutes,
rounded to three decimal places; totals are calculated before rounding.

Use `detail: "full"` for complete original records, including IDs, nulls, metadata,
and exact milliseconds. Alternatively, `fields` selects exact **raw top-level**
fields and overrides `detail`; absent fields are omitted, explicit nulls retained:

```json
{
  "collection": "transitions",
  "from_day": "2026-09-01",
  "to_day": "2026-09-01",
  "timezone": "America/New_York",
  "fields": ["id", "activityId", "timestamp", "note"]
}
```

Use a returned ID with `record_id` for an exact lookup or `entity_id` for linked
records. Search applies to the original record, including fields omitted from
compact output. Catalog/habit queries exclude archived items; transition queries
exclude superseded/corrected entries unless explicitly included. Sorting remains
newest date first, then ID. `limit` defaults to 50 (maximum 100). Follow
`next_offset` until null. Query pages are bounded to 256 KiB **after projection**,
so field selection can retrieve parts of otherwise oversized records.

### Day filtering and snapshot limits

Transition queries accept inclusive `from_day`/`to_day` with the same `timezone`
and `day_kind` controls as the overview. Alternatively, supply `start` and/or
`end` as ISO timestamps with `Z` or an explicit offset. Start is inclusive and
end exclusive; do not combine timestamps with day filters. Timezone/day-kind
controls apply only to transition queries. Other collection dates remain routine
start days in UTC, saved logical days for habits, week starts for goal statuses,
and updated UTC days for catalog/habit/goal definitions. Saved logical keys
cannot be reinterpreted as calendar days without the original event timestamps.

Every result includes `source.exportedAt`, `source.observedThrough` (cutoff), and
`source.age_minutes`. These describe the **last synchronized export**;
unsynced changes are unavailable. Reports never infer timer duration after
that cutoff. `unknown_minutes` covers time before the first known transition
within the observed range, separately from explicit idle time. Future unobserved
time contributes to neither unknown nor tracked time. Interval counts describe
slices in the requested range, not completed sessions.

Dropbox path/revision/modified/fetched timestamps are opt-in via
`diagnostics: true` on any tool. Full detail does not enable diagnostics.
Each call downloads and validates a fresh backup with no stale-data fallback.
Concurrent Dropbox edits can change pages; enable diagnostics and restart
pagination if the revision changes. A projection can briefly lag the sync file
during synchronization. `fetchedAt` describes download time, not app freshness.
Backups are bounded to 64 MiB and tool payloads to 512 KiB. Invalid or unsupported
backups produce tool errors. The server exposes no write tools.

### Result transport and client compatibility

The default `TULONA_MCP_RESULT_FORMAT=text` returns exactly one compact JSON text
block in MCP's required `content` wrapper. The JSON string is the MCP text
representation, not double encoding inside Tulona's data. Existing text-only
clients can parse it normally.

Set `TULONA_MCP_RESULT_FORMAT=structured` in the client server environment to
advertise `outputSchema` and return the object in `structuredContent`, with an
empty `content` array. The server and SDK client validate the output schema.
This avoids a duplicate serialized text copy and removes string escaping from
the data payload. Both modes return ordinary text tool errors. Invalid format
settings stop server startup with a clear error.

The [MCP specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#structured-content)
recommends a serialized text copy alongside structured output for older clients.
Tulona instead keeps text as the default and makes structured-only output an
explicit client choice. Integration tests verify text and structured results
with MCP TypeScript SDK 1.31.0, including structured success over the shipped
stdio bundle with a mocked Dropbox provider. Rendering in Claude Desktop,
Cursor, Codex, and other hosts has not been verified here: some hosts only expose
text to the agent. Keep text mode unless your host consumes `structuredContent`;
if structured results appear empty, switch back to text. Tulona never sends the
same successful payload in both fields.

This release changes default query/report shapes: use full query detail for old
raw-record consumers; reports now use `tracked_minutes`/`idle_minutes` and
`activities[].minutes`, with exact activity milliseconds available in full mode.
The former report `observed_through` is consolidated into `source.observedThrough`.

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
