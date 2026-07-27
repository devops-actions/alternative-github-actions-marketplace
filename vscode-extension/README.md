# Alternative GitHub Actions Marketplace - VS Code extension

Gives you, and the AI agents in your editor, the **real** latest version and
commit SHA of any GitHub Action - offline, from a locally cached copy of the
[alternative marketplace](https://marketplace.devopsjournal.io/) dataset.

The problem it solves: when Copilot (or any other agent) writes a workflow, it
picks an action version from memory. Memory is stale by definition, so you get
`actions/checkout@v3` long after `v7` shipped, or a plausible-looking commit SHA
that belongs to nothing. This extension exposes the marketplace dataset as
language model tools, so the agent can look the answer up instead of recalling it.

## What you get

- **An activity bar entry** ("Actions Marketplace") with a dashboard view
  showing the same key metrics as the website's
  [State of Actions](https://alternative-github-actions-marketplace.devopsjournal.io/state)
  page, plus quick links into the explorer, search, and refresh - see
  [Activity bar dashboard](#activity-bar-dashboard).
- **Language model tools** that GitHub Copilot's agent mode (and any other tool-
  calling client in VS Code) can invoke - see [AI agent tools](#ai-agent-tools).
- **A marketplace explorer** with the dataset's stats and a search that matches
  the website's behaviour, plus one-click copy of a SHA-pinned `uses:` value.
- **A quick-pick search** for grabbing a pinned reference without leaving the
  keyboard, with insert-at-cursor.
- **A local dataset** of every action in the marketplace, refreshed at most once
  a day, that keeps working offline.

## Activity bar dashboard

The Actions Marketplace icon in the activity bar opens a "Dashboard" view with
the dataset's key metrics (total actions, verified, archived, actions with an
OpenSSF score, and the Node/Docker/Composite distribution) refreshed live as
the dataset changes, plus buttons to open the full explorer, run a quick
search, force a refresh, or open the public State of Actions website. Per the
[data exposure policy](#what-the-tools-do-not-report), it does not show
vulnerability counts or other security posture signals even though the public
page does.

## Commands

| Command | What it does |
|---|---|
| `Actions Marketplace: Open Marketplace Explorer` | Stats and search in a panel |
| `Actions Marketplace: Search Actions` | Quick-pick search; copy or insert a pinned ref |
| `Actions Marketplace: Refresh Dataset Now` | Force a refresh, ignoring the daily interval |
| `Actions Marketplace: Show Dataset Info` | Print dataset counts and freshness to the output channel |
| `Actions Marketplace: Open State of Actions Website` | Opens the public State of Actions page in a browser |

The status bar shows the action count and, on hover, exactly how old the data is.

## AI agent tools

Four tools are contributed via `languageModelTools`. Copilot agent mode picks
them up automatically; you can also reference them explicitly in a chat prompt
with the names below.

| Tool | Reference | Use it for |
|---|---|---|
| Resolve GitHub Action versions | `#actionVersions` | The latest version + SHA of one or many actions, and whether a pin is current |
| Search GitHub Actions | `#actionSearch` | Finding an action by what it does |
| Get GitHub Action details | `#actionDetails` | Full version history, tag-to-SHA map, and maintenance signals for one action |
| GitHub Actions dataset stats | `#actionStats` | Aggregate numbers, and how fresh the data is |

Example prompts:

```text
Update the action versions in .github/workflows/ci.yml to the latest, SHA-pinned. #actionVersions
Which actions in this workflow are archived or behind? #actionVersions
Find me a well-maintained action for linting Terraform. #actionSearch
Is actions/checkout@v3 still safe to use? #actionDetails
```

### How the tools avoid making things up

The dataset does not have a commit SHA for every action - roughly half of the
records store version tags as plain strings with no SHA attached upstream. When
the SHA is unknown, the tools say so in those words and instruct the model not to
substitute one. The same applies to "is this pin current": if the dataset cannot
tell (an unrecognised SHA, an action with no releases), the answer is `unknown`,
never a guess in either direction.

Every tool response also states when the dataset was generated and how old that
is, so the model can qualify its answer rather than presenting day-old data as
live.

### What the tools do not report

Per the data exposure policy in
[`Decision Records/requirements.md`](../Decision%20Records/requirements.md),
vulnerability counts, Dependabot status, and secret scanning status are **not**
included in tool output, even though the API returns them. A tool result read
back by an agent is a user-facing surface. OpenSSF scorecard scores are included,
because the website already exposes and filters on them.

## How the dataset stays fresh

The extension does not query the API per action. It downloads one compact
snapshot of the whole marketplace from the versions feed and searches it locally.

```text
first run          GET /api/actions/versions                     -> 200, ~1.6 MB gzipped
daily thereafter   GET /api/actions/versions  If-None-Match: "…" -> 304, no body
server rebuild     GET /api/actions/versions  If-None-Match: "…" -> 200, new snapshot
```

Note this is `/actions/versions`, **not** `/actions/snapshot`. The latter serves
the website's overview grid and deliberately carries no commit SHAs, so it cannot
answer the question this extension exists to answer.

- The snapshot is written to the extension's `globalStorage` directory; the sync
  bookkeeping (ETag, timestamps, last error) goes in `globalState`.
- The server rebuilds the feed once a day, so refreshing more often cannot
  return anything new. `actionsMarketplace.refreshIntervalHours` is therefore
  clamped to a minimum of 24 hours. Manual refreshes ignore the interval.
- The ETag is derived from the feed's content, not the blob, so a server-side
  rebuild that changed nothing still results in a `304`.
- A failed refresh keeps the previously cached dataset and backs off for an hour
  rather than retrying on every window reload.
- Refresh happens in the background and never blocks activation. A tool call on a
  cold cache does wait for the download - answering "I don't know" when the data
  is one request away is what pushes a model into guessing.

The endpoint is documented in [the backend README](../src/backend/README.md#versions-feed-endpoint).

### Known limitation: composite action names

The ingest pipeline encodes composite action paths with underscores, so
`github/codeql-action/analyze` is stored as `codeql-action_analyze`. That is
ambiguous on the way back - a repository genuinely named `my_action` looks
identical.

The tools handle this correctly when **you** supply the reference: the sub-path
you wrote is what gets echoed back in the suggested `uses:` value. Search results
have no such input, so they display and copy the stored spelling with the
underscore. If you copy a ref from search results for a composite action, replace
the underscore with a slash.

## Settings

| Setting | Default | Notes |
|---|---|---|
| `actionsMarketplace.apiBaseUrl` | the hosted API | Point at your own deployment if you host the backend |
| `actionsMarketplace.autoRefresh` | `true` | When `false`, nothing is ever downloaded automatically - including the first load |
| `actionsMarketplace.refreshIntervalHours` | `24` | Minimum hours between automatic refreshes; values below 24 are clamped |
| `actionsMarketplace.requestTimeoutMs` | `120000` | Snapshot download timeout |
| `actionsMarketplace.showStatusBarItem` | `true` | Dataset freshness in the status bar |

## Relationship to the MCP server

[`src/mcp-server`](../src/mcp-server/README.md) answers the same "what is the
latest version" question over MCP, for clients outside VS Code (Claude Desktop,
Cursor) and for hosted use. The trade-off:

| | This extension | MCP server |
|---|---|---|
| Data | Full snapshot cached locally | Per-action API call, LRU cached server-side |
| Latency | In-memory, no network per call | One network round trip per uncached action |
| Offline | Works | Does not work |
| Batch size | 50 references | 20 references |
| Search / stats | Yes | Version lookup only |

Use whichever fits the client. They read the same underlying dataset.

## Development

```bash
cd vscode-extension
npm install
npm run build
```

Then press <kbd>F5</kbd> from the repository root to launch an extension
development host (see `.vscode/launch.json`).

```bash
npm run check-types   # tsc --noEmit
npm run lint          # eslint
npm test              # vitest, unit tests for the pure modules
npm run package       # produce a .vsix
```

The modules under `src/data` and `src/tools/format.ts` deliberately have no
`vscode` imports, so all the behaviour agents depend on - reference parsing,
version and SHA resolution, search, and the exact wording of tool output - is
unit tested without an extension host.

## License

CC0-1.0, same as the rest of the repository.
