# RepoWright

RepoWright is a local-first source code analysis workbench. It ingests a repo, directory, file, or text brief, produces structural analysis, generates candidate tasks, runs selected work in isolated copies, and stores the resulting artifacts locally.

## Highlights

- Deep static analysis for languages, frameworks, dependency structure, code quality, configuration, and architecture signals
- Deterministic task generation based on analysis findings
- Isolated execution workspaces so the original source is never mutated directly
- Persistent local memory for analysis findings, execution outcomes, and review notes
- CLI-first workflow with a small React UI for browsing analyses and runs

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
# Ingest and analyze a local directory
pnpm dev ingest ./path/to/repo

# Ingest a git URL
pnpm dev ingest https://github.com/user/repo

# Ingest a text brief
pnpm dev ingest "Build a rate limiter middleware for Express"

# Start the API and frontend together
pnpm dev:all
```

## CLI Commands

```bash
pnpm dev ingest <source>      # ingest, analyze, plan, and optionally execute
pnpm dev analyze <source>     # standalone analysis
pnpm dev tasks <source-id>    # list generated tasks
pnpm dev run <task-id>        # execute a task in an isolated workspace
pnpm dev review <run-id>      # inspect a run review
pnpm dev list                 # list stored sources and runs
pnpm dev show <id>            # inspect a source, task, or run
pnpm dev memory               # search stored memory entries
pnpm dev backends             # list available execution backends
pnpm dev compare <id-a> <id-b>
pnpm dev export <source-id>
```

## Web UI

```bash
pnpm api:dev
pnpm ui:dev
pnpm dev:all
```

The frontend talks to the backend API and provides source ingestion, deep-analysis browsing, task review, and run history.

## Environment

- `REPOWRIGHT_API_PORT`: backend API port, default `8787`
- `REPOWRIGHT_DATA_DIR`: override the local data directory
- `VITE_API_BASE_URL`: frontend API base URL, default `http://localhost:8787/api`

Legacy `SOURCELENS_*` and `OPERATOR_*` environment variables are still accepted for compatibility.

## Local Data

Fresh workspaces store runtime data in `repowright-data/` at the repo root:

```text
repowright-data/
  repowright.db
  runs/
  clones/
  memory/
```

If a legacy `sourcelens-data/` or `operator-data/` directory already exists, RepoWright reuses it automatically. Outside a workspace root, the fallback location is `~/.repowright/`.

## Repo Layout

```text
backend/
  src/
    analysis/    analysis engine and comparison logic
    backends/    execution backend adapters
    cli/         CLI entrypoint and commands
    execution/   isolated workspace execution
    intake/      source ingestion and normalization
    memory/      persistent knowledge store
    planning/    task generation
    review/      post-run review generation
    routing/     backend selection
    storage/     SQLite repository layer
    web/         Express API
frontend/
  src/           React UI
```

## Development

```bash
pnpm dev <command>
pnpm api:dev
pnpm ui:dev
pnpm dev:all
pnpm build
pnpm test
pnpm lint
pnpm format
pnpm clean
```

## Status

- The `internal-planner` backend is the default and fully local.
- `codex-cli` and `claude-cli` adapters are present as external CLI integrations.
- Generated runtime data, editor metadata, and nested package lockfiles are excluded from git.

## License

MIT
