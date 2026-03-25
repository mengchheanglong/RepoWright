# SourceLens

A CLI-first, local-first source code analyzer and engineering knowledge workbench. Ingest any codebase, get deep structural analysis, generate actionable tasks, execute them in isolated workspaces, and build a persistent knowledge base from every operation.

## Why

This is a personal engineering tool — not a SaaS app, not a portfolio project. It exists to:

- **Deeply analyze codebases** — language detection (30+), framework recognition (60+), dependency graphs, code quality metrics, and architectural pattern identification
- **Generate actionable tasks** — every analysis produces 3 concrete, prioritized tasks based on findings
- **Execute safely** — all task execution happens in isolated workspaces, never mutating the original source
- **Accumulate knowledge** — every operation produces inspectable artifacts (JSON, markdown, JSONL) and feeds a persistent memory store

## Install

```bash
# Requires Node.js 20+ and pnpm
pnpm install
```

## Quick Start

```bash
# Ingest and analyze a local directory
pnpm dev ingest ./path/to/repo

# Ingest a git URL (shallow cloned automatically)
pnpm dev ingest https://github.com/user/repo

# Ingest a text brief
pnpm dev ingest "Build a rate limiter middleware for Express"

# Run the web UI + API together
pnpm dev:all
```

## How It Works

```
Source Input → Intake → Analysis → Planning → Execution → Review → Memory
```

1. **Intake** — Accepts directories, git URLs, files, or text briefs. Normalizes into a `Source` entity with fingerprinting.
2. **Analysis** — Scans file tree, detects languages and frameworks, computes code quality metrics, builds dependency graphs, classifies the source (learn, extract-skill, improve-architecture, prototype, bugfix, ignore).
3. **Deep Analysis** — Optional extended analysis covering: core system architecture, reusable components, improvement suggestions, uniqueness assessment, optimization recommendations, dependency graph, and configuration analysis.
4. **Planning** — Generates exactly 3 candidate tasks from analysis findings, each with rationale, difficulty, definition of done, and risk notes.
5. **Execution** — Runs a selected task in an isolated workspace via a pluggable backend adapter. Currently uses the `internal-planner` backend (deterministic, offline).
6. **Review** — Post-execution evaluation with confidence scoring, success/failure breakdown, and next-action recommendations.
7. **Memory** — Persists analysis findings, lessons learned, and execution outcomes for future reference.

## CLI Commands

```bash
pnpm dev ingest <source>      # Full pipeline: ingest → analyze → plan → execute
pnpm dev analyze <source>     # Standalone analysis
pnpm dev tasks <sourceId>     # List candidate tasks for a source
pnpm dev run <taskId>         # Execute a specific task
pnpm dev review <runId>       # View review report for a run
pnpm dev list                 # List all sources and runs
pnpm dev show <id>            # Show details by ID (source/task/run)
pnpm dev memory               # List or search memory entries
pnpm dev backends             # List available execution backends
pnpm dev compare <idA> <idB>  # Compare two analyses
```

## Web Interface

A React + Vite frontend for browsing analyses, tasks, and reviews.

```bash
pnpm api:dev       # Start API server (default port 8787)
pnpm ui:dev        # Start frontend (default port 5173)
pnpm dev:all       # Both together
```

The UI provides:
- Source ingestion form
- Deep analysis viewer with 8 report sections (core system, components, improvements, uniqueness, optimizations, code quality, dependency graph, configuration)
- Task browser and review history

**Environment variables:**
- `OPERATOR_API_PORT` — API port (default: `8787`)
- `VITE_API_BASE_URL` — Frontend API target (default: `http://localhost:8787/api`)

## Project Structure

```
backend/src/
  cli/          → 10 command handlers
  core/         → Config, errors
  domain/       → Zod schemas and types
  intake/       → Source ingestion and normalization
  analysis/     → Analysis engine (metrics, dependencies, frameworks, classification)
  planning/     → Task generation from findings
  routing/      → Backend selection
  execution/    → Isolated workspace creation and task execution
  backends/     → Backend adapters (internal-planner, codex-stub, claude-stub)
  review/       → Post-execution review generation
  memory/       → Knowledge store
  storage/      → SQLite via Drizzle ORM
  web/          → Express.js API (15+ endpoints)
  utils/        → Logger, file helpers, ID generation
frontend/src/   → React UI
docs/           → Architecture and implementation docs
```

## Tech Stack

- **TypeScript** + **Node.js 20+**
- **pnpm** workspaces (monorepo)
- **commander** + **@inquirer/prompts** — CLI
- **Express.js** — API server
- **better-sqlite3** + **drizzle-orm** — storage
- **zod** — validation
- **React** + **Vite** — frontend
- **vitest** — testing
- **biome** — linting and formatting

## What Works Today

- Ingest local directories, git URLs, text briefs, and individual files
- Deep analysis: 30+ languages, 60+ frameworks, code quality metrics, dependency graphs, circular dependency detection
- Classification into 6 work types with complexity/risk scoring
- Findings-driven task generation (3 tasks per analysis)
- Execution via internal-planner backend with full artifact output
- Review generation with confidence scoring and next-action recommendations
- Persistent knowledge store with category-based search
- Full artifact persistence: SQLite + JSON + markdown + JSONL logs
- REST API with 15+ endpoints
- Web UI for analysis browsing and review history

## What's Next

- **AI backend adapters** — `codex-cli` and `claude-cli` adapters (interfaces defined, stubs in place)
- **Semantic search** — embedding-based search over memory entries
- **Multi-step execution** — task execution with checkpointing
- **AST-level analysis** — language-specific parsing beyond file-tree heuristics

## Data Location

Default storage is `operator-data/` in the project root:

```
operator-data/
  operator.db       # SQLite database
  runs/             # Execution artifacts per run
  clones/           # Shallow clones of git URLs
  memory/           # Knowledge store entries
```

Fallback: `~/.operator/` if workspace root cannot be detected.
Override with `OPERATOR_DATA_DIR` environment variable.

## Development

```bash
pnpm dev <command>     # Run CLI command
pnpm api:dev           # API server
pnpm ui:dev            # Frontend dev server
pnpm dev:all           # API + frontend together
pnpm test              # Run tests
pnpm lint              # Check lint
pnpm lint:fix          # Auto-fix lint
pnpm format            # Format code
pnpm build             # Compile TypeScript
```
