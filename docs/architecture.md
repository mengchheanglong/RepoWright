# Architecture

## Overview

The Operator is structured as a pipeline with clear module boundaries:

```
Source → Intake → Analysis → Planning → Routing → Execution → Review
                                                       ↓
                                                    Memory
```

All state is persisted in SQLite (structured) and on disk (readable artifacts).

## Module Responsibilities

### Intake (`backend/src/intake/`)
Accepts raw input (path, URL, text) and normalizes it into a `Source` entity. For git URLs, performs a shallow clone. Detection is deterministic: URL pattern → git-url, existing path → directory/file, else → text-brief.

### Analysis (`backend/src/analysis/`)
Produces an `AnalysisReport` from a `Source`. For directories/repos: walks the file tree, detects languages, counts files, scores complexity. For text briefs: keyword classification. No external API calls — fully deterministic and offline.

### Planning (`backend/src/planning/`)
Generates exactly 3 `CandidateTask` entries based on the analysis classification. Uses a template system keyed by classification (learn, bugfix, prototype, etc.). Each task has: title, rationale, expected value, difficulty, definition of done, and risk notes.

### Routing (`backend/src/routing/`)
Selects a `BackendAdapter` for execution. Supports preference-based selection with automatic fallback. Currently only `internal-planner` is fully implemented.

### Execution (`backend/src/execution/`)
Creates an isolated run directory under `runs/<run-id>/`, copies the source to a workspace subdirectory, invokes the selected backend, and records all artifacts. Tracks run status transitions: `created → executing → completed/failed`.

### Backends (`backend/src/backends/`)
Each backend implements the `BackendAdapter` interface:
- `internal-planner` — deterministic, offline, produces markdown artifacts
- `codex-cli` — stub, interface defined, not yet functional
- `claude-cli` — stub, interface defined, not yet functional

### Review (`backend/src/review/`)
Generates a `ReviewReport` from a completed run. Includes: what was attempted, what changed, what succeeded/failed, confidence score, and recommended next action. Writes both to DB and as markdown to the run directory.

### Memory (`backend/src/memory/`)
Simple knowledge store. Saves `MemoryEntry` records to SQLite with category, tags, and optional source linkage. Categories: analysis, lesson, outcome. No semantic search yet — queried by category.

### Storage (`backend/src/storage/`)
All database access is isolated here. Uses Drizzle ORM over better-sqlite3. The `Repository` class provides typed CRUD operations for all domain entities. Table creation is handled via raw SQL at database initialization (no migration tool needed for v1).

## Data Flow

```
1. CLI or API route calls a service function
2. Service creates/retrieves domain entities
3. Repository persists to SQLite
4. File utilities write JSON/markdown/JSONL to disk
5. CLI formats and prints results
```

## State Machine

Execution runs follow:
```
created → executing → completed
                    → failed
                    → aborted (not yet implemented)
```

## Configuration

`OperatorConfig` is loaded once per CLI invocation:
- `dataDir` — root of all operator data (`~/.operator`)
- `runsDir` — where run artifacts go
- `dbPath` — SQLite database file
- `logLevel` — debug/info/warn/error
- `maxFileAnalysisCount` — cap on files analyzed per source
- `maxFileSizeBytes` — skip files larger than this

Override `dataDir` via `OPERATOR_DATA_DIR` env var.

## Extension Points

| Area | Current | Next step |
|------|---------|-----------|
| Backends | internal-planner only | Implement codex-cli and claude-cli adapters |
| Analysis | File-tree heuristics | Add AST-level analysis for key languages |
| Memory | Category-based lookup | Add tag search and simple pattern matching |
| Execution | Single-step | Multi-step with checkpointing |
| Git | Shallow clone only | Diff tracking within workspaces |
