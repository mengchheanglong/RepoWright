# RepoWright

RepoWright is a local-first source code analysis workbench. It ingests a repo, directory, file, or text brief, produces structural analysis, generates candidate tasks, runs selected work in isolated copies, and stores the resulting artifacts locally.

## Highlights

- Deep static analysis for languages, frameworks, dependency structure, code quality, configuration, and architecture signals
- Git history behavioral analysis: change hotspots, temporal coupling, bus factor
- Cognitive complexity scoring (SonarSource-inspired) beyond simple nesting depth
- Dependency vulnerability scanning via ecosystem-native tools (npm audit, pip-audit, cargo audit)
- Tech debt quantification with remediation time estimates and debt ratio grading
- Hotspot-based task prioritization: tasks targeting frequently-changed code are boosted
- Multi-signal trust decomposition: static analysis, execution, review, and evidence signals
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

## API Highlights

- `GET /api/next-task/:sourceId`: recommended next task with priority score breakdown
- `GET /api/portfolio-triage`: multi-source ranking by health, quality, and execution reliability
- `GET /api/proof-of-value/:sourceId`: completion rate, quality metrics, and health score delta
- `GET /api/trust-envelope/:runId`: per-run trust level with confidence and risk signals
- `POST /api/run` supports `idempotencyKey` to safely retry without duplicating runs

### Compare Workflow

Use RepoWright to compare two analyzed codebases or two saved versions you ingested as separate sources:

1. Analyze the baseline repo, branch checkout, or directory copy.
2. Analyze the second repo, updated branch checkout, or improved directory copy.
3. Open either source and use **Comparison** to compare it against the other analyzed source.
4. Review health, security, tech debt, and code-quality deltas to confirm what changed.

This works well for refactors, debt cleanup, error-handling passes, and architecture changes where you want a measurable side-by-side result without mutating the original stored analysis.

### Proof of Value

The Proof of Value panel summarizes the measurable impact of completed tasks on a source:

- **Completion** — percentage of task runs that finished successfully out of all runs attempted.
- **Avg Quality** — average task-completion quality score drawn from post-run reviews.
- **Health** — the source's current health score (0-100) from deep analysis. If multiple analyses exist for the same saved source, the delta shows change since the earliest saved analysis.

### Analysis Dimensions

Each analysis produces metrics across multiple dimensions:

- **Code Quality** — function count, nesting depth, cognitive complexity, comment ratio, `any` types, empty catches, TODOs, large files, boolean complexity, duplicate code blocks, max argument count
- **Git History** — commit frequency per file (hotspots), temporal coupling between files, contributor distribution (bus factor), recent activity level
- **Dependency Graph** — circular dependencies, orphan/dead-code files, central modules, internal vs external import counts
- **Security** — hardcoded secrets, vulnerability patterns, CORS issues, command injection signals, dependency vulnerabilities
- **Health Score** — weighted 6-dimension score (code quality, documentation, security, maintainability, test coverage, dependencies) with letter grade and maturity level
- **Tech Debt** — total estimated remediation time, debt ratio (remediation time / estimated development time), debt grade (A-F inspired by SonarQube SQALE)
- **Dependency Audit** — known vulnerabilities in project dependencies via npm audit, pip-audit, or cargo audit

### Trust Envelope

Each task run produces a trust envelope with four independent signals:

- **Static Analysis** — how thorough and confident the analysis was
- **Execution** — whether the run succeeded and produced quality output
- **Review** — post-run quality assessment from the review engine
- **Evidence** — amount of supporting artifacts and findings

These combine into an overall trust level (high/moderate/low) with specific risk signals explaining any concerns.

### Hotspot-Based Task Prioritization

Task priority scoring incorporates git history hotspots. Tasks targeting frequently-changed files receive a boost, based on CodeScene research showing that fixing hotspots delivers 3-6x more value per hour than statically prioritized tasks.

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
- Git history analysis runs automatically for git repositories (up to 500 commits).
- Dependency vulnerability scanning requires ecosystem-native tools (npm, pip-audit, cargo-audit) to be installed.
- Generated runtime data, editor metadata, and nested package lockfiles are excluded from git.

## License

MIT
