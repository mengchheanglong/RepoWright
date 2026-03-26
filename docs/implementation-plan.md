# Implementation Plan - RepoWright v1

## Architecture Overview

```text
CLI Layer (commander)
  |
  v
Service Layer (intake, analysis, planning, routing, execution, review)
  |
  v
Domain Layer (types, schemas, state machine)
  |
  v
Storage Layer (SQLite via better-sqlite3, file artifacts)
```

**Data flow for `repowright ingest <source>`:**

```text
source input -> intake.ingest() -> storage.saveSource()
            -> analysis.analyze() -> storage.saveAnalysis()
            -> planning.generateTasks() -> storage.saveTasks()
            -> [user selects task]
            -> routing.selectBackend() -> executor.run()
            -> review.generate() -> storage.saveReview()
```

## Scope - What v1 Delivers

1. **Ingest** local directories, git URLs, and plain text briefs
2. **Analyze** sources and produce summary, classification, and scoring
3. **Generate 3 tasks** with structured metadata
4. **Execute one task** via `internal-planner` in an isolated workspace
5. **Persist everything** to SQLite plus disk artifacts
6. **Review** completed runs with a structured report
7. **Expose CLI commands** for ingest, analyze, tasks, run, review, list, and show

## Scope - What v1 Does Not Deliver

- Full autonomous `codex-cli` or `claude-cli` execution flows
- Semantic search over the knowledge store
- Branch or pull request automation
- PDF ingestion
- Automated test generation for produced changes
- Repo-specific rule configuration

## Milestones

| # | Milestone | Contents |
|---|-----------|----------|
| 1 | Foundation | Project scaffold, domain types, config, SQLite schema, logger |
| 2 | Intake | Source ingestion for directory, git URL, and text brief |
| 3 | Analysis | Summary generation, classification, scoring |
| 4 | Planning | Task generation from analysis results |
| 5 | Execution | Isolated workspace, `internal-planner`, artifact saving |
| 6 | Review | Post-run review report generation |
| 7 | CLI | Commands wired end to end |
| 8 | Tests and Docs | Core logic tests, README, architecture doc |

## Key Tradeoffs

| Decision | Rationale |
|----------|-----------|
| `better-sqlite3` over async DB | Simpler code for a local CLI-first workload |
| Drizzle ORM | Typed repository code without heavy migration infrastructure |
| Heuristic analysis over LLM dependency | Keeps the core pipeline offline and deterministic |
| Single-process execution | Enough for current scale and operating model |
| `nanoid` for IDs | Short, URL-safe identifiers with no UUID dependency |
| Biome for lint and format | One fast tool instead of separate lint and formatting stacks |

## Risks

| Risk | Mitigation |
|------|------------|
| Git clone failures | Graceful error handling and clear messages |
| Large repos overwhelming analysis | File count and file size limits |
| Analysis scope creep | Keep the core pipeline deterministic |
| Schema changes over time | Maintain a simple versioned schema strategy |

## Test Strategy

- **Unit tests:** domain validation, analysis heuristics, task generation, and state transitions
- **Integration tests:** ingest -> analyze -> plan -> execute -> review pipeline with temp directories
- **No E2E CLI tests in v1:** focus on the service layer rather than commander wiring

## Storage Schema

- **sources:** ingested source records
- **analyses:** analysis results linked to sources
- **tasks:** candidate tasks linked to analyses
- **runs:** execution run records linked to tasks
- **artifacts:** run artifact metadata
- **memory:** reusable knowledge entries

## File Artifact Layout

```text
runs/<run-id>/
  summary.md
  analysis.json
  tasks.json
  run.json
  review.md
  logs.jsonl
  workspace/
```
