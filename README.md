# RepoWright

RepoWright is a local-first source code analysis workbench. It ingests a repo, directory, file, or text brief, produces structural analysis, generates candidate tasks, runs selected work in isolated copies, and stores the resulting artifacts locally.

## Highlights

- Deep static analysis for languages, frameworks, dependency structure, code quality, configuration, and architecture signals
- Deterministic task generation based on analysis findings
- Isolated execution workspaces so the original source is never mutated directly
- React frontend and REST API over the same local workspace

## Requirements

- Node.js 20+
- pnpm

## Setup

```bash
pnpm install
pnpm build
pnpm test
```

## Quick Start

```bash
# Start the API server and frontend together
pnpm dev:all

# Start just the API server
pnpm dev

# Start just the frontend dev server
pnpm ui:dev
```

Open the web UI, enter a local path, git URL, or text brief, and hit **Analyze**. From there you can browse the deep analysis, run generated tasks, compare sources, and export reports.

## Web UI

The frontend provides source ingestion, deep-analysis browsing, task execution, source comparison, exports, and run history. The API server can also be used directly via `curl` or any HTTP client.

## Environment

- `REPOWRIGHT_API_PORT`: backend API port, default `8787`
- `REPOWRIGHT_DATA_DIR`: override the local data directory
- `VITE_API_BASE_URL`: frontend API base URL, default `http://localhost:8787/api`

## Local Data

Fresh workspaces store runtime data in `repowright-data/` at the repo root:

```text
repowright-data/
  repowright.db
  runs/
  clones/
```

If a legacy `operator-data/` directory already exists, RepoWright reuses it automatically. Outside a workspace root, the fallback location is `~/.repowright/`.

## Repo Layout

```text
backend/
  src/
    analysis/    analysis engine and comparison logic
    backends/    execution engine adapters
    cli/         server entrypoint
    execution/   isolated workspace execution
    intake/      source ingestion and normalization
    planning/    task generation
    review/      post-run review generation
    routing/     execution engine selection
    storage/     SQLite repository layer
    web/         Express API
frontend/
  src/           React UI
```

## Development

```bash
pnpm dev          # start the API server
pnpm ui:dev       # start the frontend dev server
pnpm dev:all      # start both
pnpm build
pnpm test
pnpm lint
pnpm format
pnpm clean
```

## Status

- The `internal-planner` engine is the default and fully local.
- `codex-cli` and `claude-cli` adapters are present as external execution engine integrations.
- Generated runtime data, editor metadata, and nested package lockfiles are excluded from git.

## License

MIT
