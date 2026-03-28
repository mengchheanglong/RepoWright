import { z } from 'zod';

// --- Enums ---

export const SourceType = z.enum(['directory', 'git-url', 'text-brief', 'file']);
export type SourceType = z.infer<typeof SourceType>;

export const WorkClassification = z.enum([
  'learn',
  'extract-skill',
  'improve-architecture',
  'prototype',
  'bugfix',
  'ignore',
]);
export type WorkClassification = z.infer<typeof WorkClassification>;

export const RunStatus = z.enum([
  'created',
  'analyzed',
  'planned',
  'executing',
  'completed',
  'failed',
  'aborted',
]);
export type RunStatus = z.infer<typeof RunStatus>;

export const BackendType = z.enum(['internal-planner']);
export type BackendType = z.infer<typeof BackendType>;

export const Difficulty = z.enum(['trivial', 'easy', 'moderate', 'hard', 'complex']);
export type Difficulty = z.infer<typeof Difficulty>;

// --- Deep Analysis Report (5-section source breakdown) ---

export const ComponentInfo = z.object({
  name: z.string(),
  description: z.string(),
  location: z.string(),
  reusability: z.enum(['high', 'medium', 'low']),
});
export type ComponentInfo = z.infer<typeof ComponentInfo>;

export const ImprovementItem = z.object({
  area: z.string(),
  issue: z.string(),
  suggestion: z.string(),
  priority: z.enum(['high', 'medium', 'low']),
  files: z.array(z.string()).optional(),
  estimatedMinutes: z.number().optional(),
});
export type ImprovementItem = z.infer<typeof ImprovementItem>;

export const OptimizationSuggestion = z.object({
  strategy: z.string(),
  description: z.string(),
  impact: z.enum(['high', 'medium', 'low']),
  effort: z.enum(['high', 'medium', 'low']),
});
export type OptimizationSuggestion = z.infer<typeof OptimizationSuggestion>;

export const FileMetrics = z.object({
  path: z.string(),
  lines: z.number(),
  codeLines: z.number(),
  commentLines: z.number(),
  blankLines: z.number(),
  functions: z.number(),
  maxNesting: z.number(),
  imports: z.number(),
  exports: z.number(),
});
export type FileMetrics = z.infer<typeof FileMetrics>;

export const CodeQuality = z.object({
  totalCodeLines: z.number(),
  totalCommentLines: z.number(),
  commentRatio: z.number(), // 0-1
  totalFunctions: z.number(),
  avgFunctionLength: z.number(),
  totalAllScopeCodeLines: z.number().optional(),
  totalAllScopeFunctions: z.number().optional(),
  maxFileLines: z.number(),
  maxFilePath: z.string(),
  maxNestingDepth: z.number(),
  maxNestingFile: z.string(),
  anyTypeCount: z.number(),
  anyTypeFiles: z.array(z.string()),
  emptyCatchCount: z.number(),
  emptyCatchFiles: z.array(z.string()),
  todoCount: z.number(),
  largeFiles: z.array(z.object({ path: z.string(), lines: z.number() })),
  topFilesBySize: z.array(z.object({ path: z.string(), lines: z.number() })),
  cognitiveComplexity: z.number().optional(),
  maxCognitiveComplexity: z.number().optional(),
  maxCognitiveComplexityFile: z.string().optional(),
  maxArgCount: z.number().optional(),
  maxArgCountFile: z.string().optional(),
  booleanComplexityCount: z.number().optional(),
  duplicateBlockCount: z.number().optional(),
});
export type CodeQuality = z.infer<typeof CodeQuality>;

export const DependencyNode = z.object({
  file: z.string(),
  imports: z.array(z.string()), // resolved paths this file imports
  importedBy: z.array(z.string()), // files that import this one
});
export type DependencyNode = z.infer<typeof DependencyNode>;

export const DependencyGraph = z.object({
  nodes: z.array(DependencyNode),
  centralModules: z.array(z.object({ file: z.string(), importedByCount: z.number() })),
  circularDeps: z.array(z.array(z.string())),
  orphanFiles: z.array(z.string()), // files not imported by anything
  externalDepCount: z.number(),
  internalImportCount: z.number(),
});
export type DependencyGraph = z.infer<typeof DependencyGraph>;

export const ConfigAnalysis = z.object({
  typescript: z.object({
    strict: z.boolean(),
    target: z.string(),
    module: z.string(),
    issues: z.array(z.string()),
  }).optional(),
  python: z.object({
    version: z.string().optional(),
    buildSystem: z.string().optional(),
    packages: z.array(z.string()),
    issues: z.array(z.string()),
  }).optional(),
  go: z.object({
    version: z.string().optional(),
    modulePath: z.string().optional(),
    dependencies: z.number(),
    issues: z.array(z.string()),
  }).optional(),
  rust: z.object({
    edition: z.string().optional(),
    name: z.string().optional(),
    dependencies: z.number(),
    issues: z.array(z.string()),
  }).optional(),
  ruby: z.object({
    version: z.string().optional(),
    gems: z.array(z.string()),
  }).optional(),
  packageManager: z.string().optional(),
  nodeVersion: z.string().optional(),
  scripts: z.array(z.object({ name: z.string(), command: z.string() })).optional(),
  depCount: z.object({ production: z.number(), dev: z.number() }).optional(),
});
export type ConfigAnalysis = z.infer<typeof ConfigAnalysis>;

export const SecurityFinding = z.object({
  type: z.enum(['secret', 'vulnerability', 'misconfiguration']),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  title: z.string(),
  description: z.string(),
  filePath: z.string(),
  line: z.number(),
  pattern: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
});
export type SecurityFinding = z.infer<typeof SecurityFinding>;

export const SecurityReport = z.object({
  score: z.number().min(0).max(100),
  findings: z.array(SecurityFinding),
  summary: z.object({
    critical: z.number(),
    high: z.number(),
    medium: z.number(),
    low: z.number(),
    info: z.number(),
  }),
  hasSecurityPolicy: z.boolean(),
  hasLockFile: z.boolean(),
  secretsDetected: z.number(),
  vulnerabilityPatterns: z.number(),
});
export type SecurityReport = z.infer<typeof SecurityReport>;

export const HealthDimension = z.object({
  name: z.string(),
  score: z.number().min(0).max(100),
  weight: z.number().min(0).max(1),
  details: z.array(z.string()),
});
export type HealthDimension = z.infer<typeof HealthDimension>;

export const HealthScore = z.object({
  overall: z.number().min(0).max(100),
  grade: z.enum(['A', 'B', 'C', 'D', 'F']),
  maturity: z.enum(['prototype', 'early-development', 'growing', 'stable', 'production-ready']),
  dimensions: z.array(HealthDimension),
});
export type HealthScore = z.infer<typeof HealthScore>;

export const FileHotspot = z.object({
  file: z.string(),
  changeCount: z.number(),
  authorCount: z.number(),
  lastChanged: z.string(),
  coupledFiles: z.array(z.string()),
});
export type FileHotspot = z.infer<typeof FileHotspot>;

export const GitHistory = z.object({
  totalCommits: z.number(),
  activeContributors: z.number(),
  hotspots: z.array(FileHotspot),
  temporalCoupling: z.array(z.object({
    fileA: z.string(),
    fileB: z.string(),
    couplingScore: z.number(),
  })),
  busFactor: z.number(),
  recentActivityWeeks: z.number(),
});
export type GitHistory = z.infer<typeof GitHistory>;

export const TechDebtSummary = z.object({
  totalRemediationMinutes: z.number(),
  debtRatio: z.number(),
  grade: z.enum(['A', 'B', 'C', 'D', 'F']),
  structuralBurden: z.number().optional(),
  gradeRationale: z.array(z.string()).optional(),
});
export type TechDebtSummary = z.infer<typeof TechDebtSummary>;

export const DepVulnerability = z.object({
  package: z.string(),
  severity: z.enum(['critical', 'high', 'moderate', 'low', 'info']),
  title: z.string(),
  url: z.string().optional(),
  fixAvailable: z.boolean(),
});
export type DepVulnerability = z.infer<typeof DepVulnerability>;

export const DepAuditReport = z.object({
  vulnerabilities: z.array(DepVulnerability),
  totalVulnerabilities: z.number(),
  criticalCount: z.number(),
  highCount: z.number(),
  moderateCount: z.number(),
  auditSource: z.string(),
});
export type DepAuditReport = z.infer<typeof DepAuditReport>;

export const DeepAnalysis = z.object({
  coreSystem: z.object({
    summary: z.string(),
    architecture: z.string(),
    entryPoints: z.array(z.string()),
    dataFlow: z.string(),
    techStack: z.array(z.string()),
    frameworks: z.array(z.string()),
    patterns: z.array(z.string()),
  }),
  codeQuality: CodeQuality.optional(),
  dependencyGraph: DependencyGraph.optional(),
  configAnalysis: ConfigAnalysis.optional(),
  usefulComponents: z.array(ComponentInfo),
  improvements: z.array(ImprovementItem),
  uniqueness: z.object({
    summary: z.string(),
    differentiators: z.array(z.string()),
    novelApproaches: z.array(z.string()),
  }),
  optimizations: z.object({
    simplification: z.array(OptimizationSuggestion),
    alternativeStack: z.array(OptimizationSuggestion),
    performance: z.array(OptimizationSuggestion),
  }),
  security: SecurityReport.optional(),
  healthScore: HealthScore.optional(),
  gitHistory: GitHistory.optional(),
  techDebt: TechDebtSummary.optional(),
  depAudit: DepAuditReport.optional(),
});
export type DeepAnalysis = z.infer<typeof DeepAnalysis>;

// --- Domain Models ---

export const Source = z.object({
  id: z.string(),
  type: SourceType,
  location: z.string(),
  name: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  fingerprint: z.string().optional(),
  createdAt: z.string().datetime(),
});
export type Source = z.infer<typeof Source>;

export const AnalysisReport = z.object({
  id: z.string(),
  sourceId: z.string(),
  summary: z.string(),
  classification: WorkClassification,
  complexity: z.number().min(0).max(10),
  risk: z.number().min(0).max(10),
  confidence: z.number().min(0).max(1),
  fileCount: z.number().optional(),
  languages: z.array(z.string()).optional(),
  insights: z.array(z.string()),
  deepAnalysis: DeepAnalysis.optional(),
  createdAt: z.string().datetime(),
});
export type AnalysisReport = z.infer<typeof AnalysisReport>;

export const CandidateTask = z.object({
  id: z.string(),
  analysisId: z.string(),
  sourceId: z.string(),
  title: z.string(),
  rationale: z.string(),
  whyNow: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  expectedValue: z.string(),
  alternatives: z
    .array(
      z.object({
        title: z.string(),
        reasonDeferred: z.string(),
      }),
    )
    .optional(),
  executionContract: z
    .object({
      intent: z.string(),
      scope: z.string(),
      expectedCodeImpact: z.string(),
      verification: z.array(z.string()),
      stopConditions: z.array(z.string()).optional(),
    })
    .optional(),
  difficulty: Difficulty,
  definitionOfDone: z.string(),
  riskNotes: z.string(),
  order: z.number().int().min(1).max(3),
  createdAt: z.string().datetime(),
});
export type CandidateTask = z.infer<typeof CandidateTask>;

export const ExecutionRun = z.object({
  id: z.string(),
  taskId: z.string(),
  sourceId: z.string(),
  idempotencyKey: z.string().optional(),
  status: RunStatus,
  backend: BackendType,
  workspacePath: z.string(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  error: z.string().optional(),
  createdAt: z.string().datetime(),
});
export type ExecutionRun = z.infer<typeof ExecutionRun>;

export const RunArtifact = z.object({
  id: z.string(),
  runId: z.string(),
  type: z.string(),
  path: z.string(),
  description: z.string().optional(),
  createdAt: z.string().datetime(),
});
export type RunArtifact = z.infer<typeof RunArtifact>;

export const ReviewReport = z.object({
  id: z.string(),
  runId: z.string(),
  attempted: z.string(),
  changed: z.string(),
  succeeded: z.string(),
  failed: z.string(),
  confidence: z.number().min(0).max(1),
  nextAction: z.string(),
  doneScore: z.number().min(0).max(1).optional(),
  findings: z.array(z.string()).optional(),
  createdAt: z.string().datetime(),
});
export type ReviewReport = z.infer<typeof ReviewReport>;

// --- Analysis Comparison ---

export const AnalysisDelta = z.object({
  metric: z.string(),
  before: z.union([z.number(), z.string()]),
  after: z.union([z.number(), z.string()]),
  direction: z.enum(['improved', 'regressed', 'unchanged']),
});
export type AnalysisDelta = z.infer<typeof AnalysisDelta>;

export const AnalysisComparison = z.object({
  sourceA: z.object({
    id: z.string(),
    name: z.string(),
    analyzedAt: z.string(),
    analysisId: z.string().optional(),
    sourceId: z.string().optional(),
  }),
  sourceB: z.object({
    id: z.string(),
    name: z.string(),
    analyzedAt: z.string(),
    analysisId: z.string().optional(),
    sourceId: z.string().optional(),
  }),
  deltas: z.array(AnalysisDelta),
  summary: z.string(),
});
export type AnalysisComparison = z.infer<typeof AnalysisComparison>;
