# Implementation Plan — Personal AI Engineering Operator v1

## Architecture Overview

```
CLI Layer (commander)
  │
  ▼
Service Layer (intake, analysis, planning, routing, execution, review)
  │
  ▼
Domain Layer (types, schemas, state machine)
  │
  ▼
Storage Layer (SQLite via better-sqlite3, file artifacts)
```

**Data flow for `operator ingest <source>`:**
```
source input → intake.ingest() → storage.saveSource()
            → analysis.analyze() → storage.saveAnalysis()
            → planning.generateTasks() → storage.saveTasks()
            → [user selects task]
            → routing.selectBackend() → executor.run()
            → review.generate() → storage.saveReview()
```

## Scope — What v1 Delivers

1. **Ingest** local directories, git URLs, and plain text briefs
2. **Analyze** sources: produce summary, classify work type, score complexity
3. **Generate 3 tasks** with structured metadata
4. **Execute one task** via internal-planner backend in an isolated workspace
5. **Persist everything** to SQLite + disk artifacts (JSON, markdown, JSONL logs)
6. **Review** completed runs with a structured report
7. **CLI commands:** ingest, analyze, tasks, run, review, list, show

## Scope — What v1 Does NOT Deliver

- Real codex-cli or claude-cli execution (stubbed adapters only)
- Semantic search over knowledge store
- Git integration (commit, branch, PR creation)
- PDF ingestion (extension point only)
- Automated test generation for produced changes
- Repo-specific rule configuration

## Milestones

| # | Milestone | Contents |
|---|-----------|----------|
| 1 | Foundation | Project scaffold, domain types, config, SQLite schema, logger |
| 2 | Intake | Source ingestion for directory, git URL, text brief |
| 3 | Analysis | Summary generation, classification, scoring |
| 4 | Planning | Task generation from analysis results |
| 5 | Execution | Isolated workspace, internal-planner backend, artifact saving |
| 6 | Review | Post-run review report generation |
| 7 | CLI | All commands wired up end-to-end |
| 8 | Tests & Docs | Core logic tests, README, architecture doc |

## Key Tradeoffs

| Decision | Rationale |
|----------|-----------|
| better-sqlite3 (sync) over async DB | Simpler code, CLI workload is single-threaded, no concurrency needs |
| Lightweight ORM (Drizzle) | Keeps repository code typed while staying simple and SQLite-focused |
| Internal analysis (heuristic) over LLM-dependent | v1 must work offline without API keys; LLM backends added later |
| Single-process execution | No need for job queues or workers at this scale |
| nanoid for IDs | Short, URL-safe, no UUID dependency |
| Biome over ESLint+Prettier | Single tool for lint+format, faster, fewer config files |

## Risks

| Risk | Mitigation |
|------|------------|
| Git clone failures (network, auth) | Graceful error handling, clear messages, fallback to manual clone |
| Large repos overwhelming analysis | Set file count/size limits on heuristic analysis |
| Scope creep in "analysis" | Keep v1 analysis deterministic/heuristic, no LLM calls |
| SQLite schema migrations | Use a simple version table, manual migrations for now |

## Test Strategy

- **Unit tests:** Domain model validation, analysis heuristics, task generation logic, state transitions
- **Integration tests:** Full ingest→analyze→plan→execute→review pipeline with temp directories
- **No E2E CLI tests in v1** — test the service layer, not arg parsing
- **Test fixtures:** Small sample directories and text briefs in `backend/tests/fixtures/`

## Storage Schema (SQLite)

**sources** — ingested source records
**analyses** — analysis results linked to sources
**tasks** — candidate tasks linked to analyses
**runs** — execution run records linked to tasks
**artifacts** — run artifact metadata
**memory** — reusable knowledge entries

## File Artifact Layout

```
runs/<run-id>/
  summary.md
  analysis.json
  tasks.json
  run.json
  review.md
  logs.jsonl
  workspace/    # isolated copy of source for execution
```
