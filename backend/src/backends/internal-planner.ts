import fs from 'node:fs';
import path from 'node:path';
import type { AnalysisReport, CandidateTask, DeepAnalysis, Source } from '../domain/index.js';
import { getLogger } from '../utils/logger.js';
import type { BackendAdapter, ExecutionResult } from './adapter.js';

/**
 * Internal planner engine. Produces structured deep analysis artifacts
 * without calling external AI services. Deterministic and offline-capable.
 */
export class InternalPlannerBackend implements BackendAdapter {
  readonly name = 'Internal Planner';
  readonly type = 'internal-planner' as const;

  isAvailable(): boolean {
    return true;
  }

  async execute(
    task: CandidateTask,
    source: Source,
    analysis: AnalysisReport,
    workspacePath: string,
  ): Promise<ExecutionResult> {
    const logger = getLogger();
    logger.info(`[internal-planner] Executing: ${task.title}`);

    const artifacts: ExecutionResult['artifacts'] = [];

    // Generate the main deep analysis report
    if (analysis.deepAnalysis) {
      const report = this.generateDeepReport(source, analysis, analysis.deepAnalysis);
      artifacts.push({ type: 'deep-analysis', filename: 'deep-analysis.md', content: report });
    }

    // Generate task execution plan
    const plan = this.generatePlan(task, source, analysis);
    artifacts.push({ type: 'plan', filename: 'execution-plan.md', content: plan });

    // Generate summary document
    const summary = this.generateSummary(task, source, analysis);
    artifacts.push({ type: 'summary', filename: 'summary.md', content: summary });

    // If source is a directory, generate a file inventory
    if (
      (source.type === 'directory' || source.type === 'git-url') &&
      fs.existsSync(source.location)
    ) {
      const inventory = this.generateInventory(source);
      artifacts.push({ type: 'inventory', filename: 'file-inventory.md', content: inventory });
    }

    // Write artifacts to workspace
    for (const artifact of artifacts) {
      const filePath = path.join(workspacePath, artifact.filename);
      fs.writeFileSync(filePath, artifact.content);
    }

    logger.info(`[internal-planner] Produced ${artifacts.length} artifacts`);

    return {
      success: true,
      output: `Completed "${task.title}" — generated ${artifacts.length} artifacts in workspace.`,
      artifacts,
    };
  }

  private generateDeepReport(source: Source, _analysis: AnalysisReport, deep: DeepAnalysis): string {
    const lines: string[] = [];

    lines.push(`# Deep Analysis Report: ${source.name}`);
    lines.push('');
    lines.push(`> Generated at ${new Date().toISOString()}`);
    lines.push('');

    // Section 1: Core System
    lines.push('---');
    lines.push('## 1. Core System');
    lines.push('');
    lines.push(`**Summary:** ${deep.coreSystem.summary}`);
    lines.push('');
    lines.push(`**Architecture:** ${deep.coreSystem.architecture}`);
    lines.push('');
    lines.push(`**Data Flow:** ${deep.coreSystem.dataFlow}`);
    lines.push('');
    if (deep.coreSystem.techStack.length > 0) {
      lines.push('**Tech Stack:**');
      for (const tech of deep.coreSystem.techStack) {
        lines.push(`- ${tech}`);
      }
      lines.push('');
    }
    if (deep.coreSystem.frameworks.length > 0) {
      lines.push('**Frameworks:**');
      for (const fw of deep.coreSystem.frameworks) {
        lines.push(`- ${fw}`);
      }
      lines.push('');
    }
    if (deep.coreSystem.patterns.length > 0) {
      lines.push('**Detected Patterns:**');
      for (const p of deep.coreSystem.patterns) {
        lines.push(`- ${p}`);
      }
      lines.push('');
    }
    if (deep.coreSystem.entryPoints.length > 0) {
      lines.push('**Entry Points:**');
      for (const ep of deep.coreSystem.entryPoints) {
        lines.push(`- ${ep}`);
      }
      lines.push('');
    }

    // Section 2: Useful Components
    lines.push('---');
    lines.push('## 2. Useful Components');
    lines.push('');
    if (deep.usefulComponents.length > 0) {
      for (const comp of deep.usefulComponents) {
        const badge = comp.reusability === 'high' ? '[HIGH]' : comp.reusability === 'medium' ? '[MED]' : '[LOW]';
        lines.push(`### ${comp.name} ${badge}`);
        lines.push(`- **Description:** ${comp.description}`);
        lines.push(`- **Location:** \`${comp.location}\``);
        lines.push(`- **Reusability:** ${comp.reusability}`);
        lines.push('');
      }
    } else {
      lines.push('No standalone reusable components detected.');
      lines.push('');
    }

    // Section 3: Improvements
    lines.push('---');
    lines.push('## 3. Improvements');
    lines.push('');
    if (deep.improvements.length > 0) {
      const byPriority = { high: [] as typeof deep.improvements, medium: [] as typeof deep.improvements, low: [] as typeof deep.improvements };
      for (const imp of deep.improvements) {
        byPriority[imp.priority].push(imp);
      }
      for (const [priority, items] of Object.entries(byPriority)) {
        if (items.length === 0) continue;
        lines.push(`### ${priority.toUpperCase()} Priority`);
        for (const item of items) {
          lines.push(`- **${item.area}:** ${item.issue}`);
          lines.push(`  - *Suggestion:* ${item.suggestion}`);
          if (item.files && item.files.length > 0) {
            lines.push(`  - *Files:* ${item.files.join(', ')}`);
          }
        }
        lines.push('');
      }
    } else {
      lines.push('No major improvements identified.');
      lines.push('');
    }

    // Section 4: Uniqueness
    lines.push('---');
    lines.push('## 4. Uniqueness');
    lines.push('');
    lines.push(`**Summary:** ${deep.uniqueness.summary}`);
    lines.push('');
    if (deep.uniqueness.differentiators.length > 0) {
      lines.push('**Differentiators:**');
      for (const d of deep.uniqueness.differentiators) {
        lines.push(`- ${d}`);
      }
      lines.push('');
    }
    if (deep.uniqueness.novelApproaches.length > 0) {
      lines.push('**Novel Approaches:**');
      for (const n of deep.uniqueness.novelApproaches) {
        lines.push(`- ${n}`);
      }
      lines.push('');
    }

    // Section 5: How to Improve
    lines.push('---');
    lines.push('## 5. How to Improve');
    lines.push('');

    if (deep.optimizations.simplification.length > 0) {
      lines.push('### Simplification');
      for (const opt of deep.optimizations.simplification) {
        lines.push(`- **${opt.strategy}** (Impact: ${opt.impact}, Effort: ${opt.effort})`);
        lines.push(`  ${opt.description}`);
      }
      lines.push('');
    }

    if (deep.optimizations.alternativeStack.length > 0) {
      lines.push('### Alternative Frameworks / Languages');
      for (const opt of deep.optimizations.alternativeStack) {
        lines.push(`- **${opt.strategy}** (Impact: ${opt.impact}, Effort: ${opt.effort})`);
        lines.push(`  ${opt.description}`);
      }
      lines.push('');
    }

    if (deep.optimizations.performance.length > 0) {
      lines.push('### Performance');
      for (const opt of deep.optimizations.performance) {
        lines.push(`- **${opt.strategy}** (Impact: ${opt.impact}, Effort: ${opt.effort})`);
        lines.push(`  ${opt.description}`);
      }
      lines.push('');
    }

    // Section 6: Code Quality Metrics (NEW)
    if (deep.codeQuality) {
      lines.push('---');
      lines.push('## 6. Code Quality Metrics');
      lines.push('');
      const cq = deep.codeQuality;
      lines.push('| Metric | Value | Status |');
      lines.push('|--------|-------|--------|');
      lines.push(`| Code Lines | ${fmtNum(cq.totalCodeLines)} | — |`);
      lines.push(`| Comment Lines | ${fmtNum(cq.totalCommentLines)} | — |`);
      lines.push(`| Comment Ratio | ${(cq.commentRatio * 100).toFixed(1)}% | ${cq.commentRatio < 0.05 ? '⚠ Below 5%' : '✓'} |`);
      lines.push(`| Functions | ${fmtNum(cq.totalFunctions)} | — |`);
      lines.push(`| Avg Function Length | ${cq.avgFunctionLength} lines | ${cq.avgFunctionLength > 30 ? '⚠ Above 30' : '✓'} |`);
      lines.push(`| Max File Size | ${fmtNum(cq.maxFileLines)} lines (${cq.maxFilePath}) | ${cq.maxFileLines > 350 ? '⚠ Oversized' : '✓'} |`);
      lines.push(`| Max Nesting Depth | ${cq.maxNestingDepth} (${cq.maxNestingFile}) | ${cq.maxNestingDepth > 6 ? '⚠ Deep' : '✓'} |`);
      lines.push(`| \`any\` Type Usage | ${cq.anyTypeCount} | ${cq.anyTypeCount > 0 ? '⚠' : '✓'} |`);
      lines.push(`| Empty Catches | ${cq.emptyCatchCount} | ${cq.emptyCatchCount > 0 ? '⚠' : '✓'} |`);
      lines.push(`| TODOs/FIXMEs | ${cq.todoCount} | ${cq.todoCount > 0 ? '⚠' : '—'} |`);
      lines.push('');

      if (cq.anyTypeFiles.length > 0) {
        lines.push('**Files with `any` types:**');
        for (const f of cq.anyTypeFiles) {
          lines.push(`- ${f}`);
        }
        lines.push('');
      }

      if (cq.emptyCatchFiles.length > 0) {
        lines.push('**Files with empty catches:**');
        for (const f of cq.emptyCatchFiles) {
          lines.push(`- ${f}`);
        }
        lines.push('');
      }

      if (cq.largeFiles.length > 0) {
        lines.push('### Files Needing Attention');
        for (const f of cq.largeFiles) {
          lines.push(`- \`${f.path}\` (${fmtNum(f.lines)} lines) — oversized`);
        }
        lines.push('');
      }
    }

    // Section 7: Dependency Graph (NEW)
    if (deep.dependencyGraph) {
      lines.push('---');
      lines.push('## 7. Dependency Graph');
      lines.push('');
      const dg = deep.dependencyGraph;
      lines.push(`- **Internal imports:** ${fmtNum(dg.internalImportCount)} | **External deps:** ${fmtNum(dg.externalDepCount)}`);
      lines.push('');

      if (dg.centralModules.length > 0) {
        lines.push('**Central modules (most imported):**');
        for (const m of dg.centralModules.slice(0, 5)) {
          lines.push(`- \`${m.file}\` (${m.importedByCount} dependents)`);
        }
        lines.push('');
      }

      if (dg.circularDeps.length > 0) {
        lines.push('**⚠ Circular Dependencies:**');
        for (const chain of dg.circularDeps) {
          lines.push(`- ${chain.join(' → ')}`);
        }
        lines.push('');
      }

      if (dg.orphanFiles.length > 0) {
        lines.push(`**Orphan files (${dg.orphanFiles.length}):**`);
        for (const f of dg.orphanFiles.slice(0, 10)) {
          lines.push(`- \`${f}\``);
        }
        lines.push('');
      }
    }

    // Section 8: Configuration Health (NEW)
    if (deep.configAnalysis) {
      const cfg = deep.configAnalysis;
      const hasContent = cfg.typescript || cfg.python || cfg.go || cfg.rust || cfg.ruby;

      if (hasContent) {
        lines.push('---');
        lines.push('## 8. Configuration Health');
        lines.push('');

        if (cfg.typescript) {
          const issues = cfg.typescript.issues;
          lines.push(`### TypeScript: ${issues.length > 0 ? `⚠ ${issues.length} issue(s)` : '✓ OK'}`);
          lines.push(`- Strict: ${cfg.typescript.strict ? '✓ Enabled' : '⚠ Disabled'}`);
          lines.push(`- Target: ${cfg.typescript.target}`);
          lines.push(`- Module: ${cfg.typescript.module}`);
          if (issues.length > 0) {
            for (const issue of issues) {
              lines.push(`- ⚠ ${issue}`);
            }
          }
          lines.push('');
        }

        if (cfg.python) {
          const issues = cfg.python.issues;
          lines.push(`### Python: ${issues.length > 0 ? `⚠ ${issues.length} issue(s)` : '✓ OK'}`);
          if (cfg.python.version) lines.push(`- Version: ${cfg.python.version}`);
          if (cfg.python.buildSystem) lines.push(`- Build system: ${cfg.python.buildSystem}`);
          if (cfg.python.packages.length > 0) {
            lines.push(`- Packages: ${cfg.python.packages.length}`);
          }
          if (issues.length > 0) {
            for (const issue of issues) {
              lines.push(`- ⚠ ${issue}`);
            }
          }
          lines.push('');
        }

        if (cfg.go) {
          const issues = cfg.go.issues;
          lines.push(`### Go: ${issues.length > 0 ? `⚠ ${issues.length} issue(s)` : '✓ OK'}`);
          if (cfg.go.version) lines.push(`- Version: ${cfg.go.version}`);
          if (cfg.go.modulePath) lines.push(`- Module: ${cfg.go.modulePath}`);
          lines.push(`- Dependencies: ${cfg.go.dependencies}`);
          if (issues.length > 0) {
            for (const issue of issues) {
              lines.push(`- ⚠ ${issue}`);
            }
          }
          lines.push('');
        }

        if (cfg.rust) {
          const issues = cfg.rust.issues;
          lines.push(`### Rust: ${issues.length > 0 ? `⚠ ${issues.length} issue(s)` : '✓ OK'}`);
          if (cfg.rust.edition) lines.push(`- Edition: ${cfg.rust.edition}`);
          if (cfg.rust.name) lines.push(`- Crate: ${cfg.rust.name}`);
          lines.push(`- Dependencies: ${cfg.rust.dependencies}`);
          if (issues.length > 0) {
            for (const issue of issues) {
              lines.push(`- ⚠ ${issue}`);
            }
          }
          lines.push('');
        }

        if (cfg.ruby) {
          lines.push('### Ruby');
          if (cfg.ruby.version) lines.push(`- Version: ${cfg.ruby.version}`);
          if (cfg.ruby.gems.length > 0) {
            lines.push(`- Gems: ${cfg.ruby.gems.length}`);
          }
          lines.push('');
        }

        if (cfg.packageManager) lines.push(`**Package Manager:** ${cfg.packageManager}`);
        if (cfg.depCount) {
          lines.push(`**Dependencies:** ${cfg.depCount.production} production, ${cfg.depCount.dev} dev`);
        }
        if (cfg.scripts && cfg.scripts.length > 0) {
          lines.push('');
          lines.push('**Available Scripts:**');
          for (const s of cfg.scripts.slice(0, 10)) {
            lines.push(`- \`${s.name}\`: ${s.command}`);
          }
        }
        lines.push('');
      }
    }

    lines.push('---');
    lines.push('*Generated by internal-planner engine*');

    return lines.join('\n');
  }

  private generatePlan(task: CandidateTask, source: Source, analysis: AnalysisReport): string {
    const lines: string[] = [];

    lines.push(`# Execution Plan: ${task.title}`);
    lines.push('');
    lines.push('## Source');
    lines.push(`- **Name:** ${source.name}`);
    lines.push(`- **Type:** ${source.type}`);
    lines.push(`- **Location:** ${source.location}`);
    lines.push('');
    lines.push('## Analysis Summary');
    lines.push(`- **Classification:** ${analysis.classification}`);
    lines.push(`- **Complexity:** ${analysis.complexity}/10`);
    lines.push(`- **Risk:** ${analysis.risk}/10`);
    lines.push(`- **Confidence:** ${(analysis.confidence * 100).toFixed(0)}%`);
    lines.push('');
    lines.push('## Task Details');
    lines.push(`- **Rationale:** ${task.rationale}`);
    lines.push(`- **Expected Value:** ${task.expectedValue}`);
    lines.push(`- **Difficulty:** ${task.difficulty}`);
    lines.push(`- **Definition of Done:** ${task.definitionOfDone}`);
    lines.push(`- **Risk Notes:** ${task.riskNotes}`);
    lines.push('');

    // Generate concrete execution steps from analysis findings
    lines.push('## Execution Steps');
    const steps = this.deriveExecutionSteps(task, analysis);
    for (let i = 0; i < steps.length; i++) {
      lines.push(`${i + 1}. ${steps[i]}`);
    }
    lines.push('');

    lines.push('## Insights from Analysis');
    lines.push(analysis.insights.map((i) => `- ${i}`).join('\n'));
    lines.push('');

    lines.push('## Next Steps');
    lines.push('- Review generated artifacts');
    lines.push('- Validate changes against definition of done');
    lines.push('- Extract reusable patterns for future tasks if applicable');
    lines.push('');
    lines.push('---');
    lines.push('*Generated by internal-planner engine*');

    return lines.join('\n');
  }

  /**
   * Derive concrete execution steps from the task title and analysis findings,
   * instead of generic "Review source material" instructions.
   */
  private deriveExecutionSteps(task: CandidateTask, analysis: AnalysisReport): string[] {
    const steps: string[] = [];
    const deep = analysis.deepAnalysis;
    const titleLower = task.title.toLowerCase();

    if (!deep) {
      // Fallback for analyses without deep data
      steps.push('Review source material and analysis insights');
      steps.push(task.title);
      steps.push('Validate output against definition of done');
      steps.push('Document findings and decisions');
      return steps;
    }

    // Code Health tasks
    if (titleLower.includes('code health')) {
      if (deep.codeQuality) {
        const cq = deep.codeQuality;
        if (cq.anyTypeCount > 0) {
          steps.push(`Replace ${cq.anyTypeCount} \`any\` types with proper types in: ${cq.anyTypeFiles.slice(0, 3).join(', ')}`);
        }
        if (cq.emptyCatchCount > 0) {
          steps.push(`Add error handling to ${cq.emptyCatchCount} empty catch block(s) in: ${cq.emptyCatchFiles.slice(0, 3).join(', ')}`);
        }
        if (cq.maxNestingDepth > 6) {
          steps.push(`Refactor deeply nested code (depth ${cq.maxNestingDepth}) in \`${cq.maxNestingFile}\` — extract helper functions`);
        }
        if (cq.avgFunctionLength > 30) {
          steps.push(`Break up long functions (avg ${cq.avgFunctionLength} lines) into smaller, focused units`);
        }
      }
    }

    // Architecture tasks
    if (titleLower.includes('architecture') || titleLower.includes('structural')) {
      if (deep.dependencyGraph) {
        const dg = deep.dependencyGraph;
        for (const chain of dg.circularDeps) {
          steps.push(`Break circular dependency: ${chain.join(' → ')} — extract shared types into a separate module`);
        }
        if (dg.orphanFiles.length > 5) {
          steps.push(`Review ${dg.orphanFiles.length} orphan files — remove dead code or add barrel exports: ${dg.orphanFiles.slice(0, 3).join(', ')}`);
        }
      }
      if (deep.codeQuality && deep.codeQuality.largeFiles.length > 0) {
        for (const f of deep.codeQuality.largeFiles.slice(0, 3)) {
          steps.push(`Split \`${f.path}\` (${f.lines} lines) into focused sub-modules`);
        }
      }
      if (deep.configAnalysis) {
        const configIssues = this.collectConfigIssues(deep.configAnalysis);
        if (configIssues.length > 0) {
          steps.push(`Fix ${configIssues.length} configuration issue(s): ${configIssues.slice(0, 2).join('; ')}`);
        }
      }
    }

    // Documentation & Maintenance tasks
    if (titleLower.includes('documentation') || titleLower.includes('maintenance')) {
      if (deep.codeQuality) {
        if (deep.codeQuality.todoCount > 0) {
          steps.push(`Resolve ${deep.codeQuality.todoCount} TODO/FIXME comment(s) — either implement or remove with tracked issues`);
        }
        if (deep.codeQuality.commentRatio < 0.05 && deep.codeQuality.totalCodeLines > 100) {
          steps.push(`Add documentation comments to key modules (current ratio: ${(deep.codeQuality.commentRatio * 100).toFixed(1)}%)`);
        }
      }
    }

    // If no specific steps were derived, provide sensible fallback
    if (steps.length === 0) {
      steps.push('Review source material and analysis insights');
      steps.push(task.title);
    }

    // Always add validation step
    steps.push('Run `tsc --noEmit` to confirm no type regressions');
    steps.push('Validate output against definition of done');
    steps.push('Document findings and decisions');

    return steps;
  }

  private collectConfigIssues(cfg: NonNullable<DeepAnalysis['configAnalysis']>): string[] {
    const issues: string[] = [];
    if (cfg.typescript?.issues) issues.push(...cfg.typescript.issues);
    if (cfg.python?.issues) issues.push(...cfg.python.issues);
    if (cfg.go?.issues) issues.push(...cfg.go.issues);
    if (cfg.rust?.issues) issues.push(...cfg.rust.issues);
    return issues;
  }

  private generateSummary(task: CandidateTask, source: Source, analysis: AnalysisReport): string {
    return `# Task Summary: ${task.title}

## What was done
Executed internal planning for task "${task.title}" on source "${source.name}".

## Source Overview
${analysis.summary}

## Classification
**${analysis.classification}** — This source has been classified for ${analysis.classification} work.

## Key Insights
${analysis.insights.map((i) => `- ${i}`).join('\n')}

## Task Output
- Generated deep analysis report
- Generated execution plan
- Created source summary
${source.type !== 'text-brief' ? '- Created file inventory\n' : ''}## Confidence: ${(analysis.confidence * 100).toFixed(0)}%

---
*Generated at ${new Date().toISOString()}*
`;
  }

  private generateInventory(source: Source): string {
    const lines: string[] = ['# File Inventory', '', `Source: ${source.location}`, ''];

    try {
      const entries = fs.readdirSync(source.location, { withFileTypes: true });
      const dirs = entries.filter(
        (e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules',
      );
      const files = entries.filter((e) => e.isFile());

      if (dirs.length > 0) {
        lines.push('## Directories', '');
        for (const d of dirs.slice(0, 50)) {
          lines.push(`- ${d.name}/`);
        }
        lines.push('');
      }

      if (files.length > 0) {
        lines.push('## Top-level Files', '');
        for (const f of files.slice(0, 50)) {
          const stats = fs.statSync(path.join(source.location, f.name));
          lines.push(`- ${f.name} (${(stats.size / 1024).toFixed(1)} KB)`);
        }
      }
    } catch {
      lines.push('*Could not read directory contents*');
    }

    return lines.join('\n');
  }
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}
