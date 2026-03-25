import type {
  AnalysisReport,
  DeepAnalysis,
  ImprovementItem,
  OptimizationSuggestion,
} from '../domain/index.js';

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

/** Escape a value for RFC 4180 CSV: wrap in quotes if it contains comma, quote, or newline. */
function csvEscape(value: string | number): string {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(cells: (string | number)[]): string {
  return cells.map(csvEscape).join(',');
}

function csvTable(headers: string[], rows: (string | number)[][]): string {
  const lines = [csvRow(headers)];
  for (const row of rows) lines.push(csvRow(row));
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Markdown helpers
// ---------------------------------------------------------------------------

function mdTable(headers: string[], rows: string[][]): string {
  const sep = headers.map(() => '---');
  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
  ];
  for (const row of rows) {
    lines.push(`| ${row.join(' | ')} |`);
  }
  return lines.join('\n');
}

function letterGrade(score: number): string {
  if (score >= 9) return 'A+';
  if (score >= 8) return 'A';
  if (score >= 7) return 'B';
  if (score >= 6) return 'C';
  if (score >= 5) return 'D';
  return 'F';
}

function healthScore(report: AnalysisReport, deep?: DeepAnalysis): number {
  // Derive a 0-10 health score from available metrics.
  let score = 10;

  // Deduct for complexity and risk
  score -= report.complexity * 0.25;
  score -= report.risk * 0.25;

  if (deep) {
    const cq = deep.codeQuality;
    if (cq) {
      // Penalise low comment ratio
      if (cq.commentRatio < 0.05) score -= 0.5;
      // Penalise deep nesting
      if (cq.maxNestingDepth > 6) score -= 0.5;
      // Penalise 'any' usage
      if (cq.anyTypeCount > 5) score -= 0.5;
      // Penalise empty catches
      if (cq.emptyCatchCount > 0) score -= 0.3;
    }

    const dg = deep.dependencyGraph;
    if (dg) {
      if (dg.circularDeps.length > 0) score -= Math.min(dg.circularDeps.length * 0.3, 1.5);
      if (dg.orphanFiles.length > 10) score -= 0.5;
    }

    const highImprovements = deep.improvements.filter((i) => i.priority === 'high').length;
    score -= Math.min(highImprovements * 0.2, 1.5);
  }

  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

function priorityEmoji(priority: 'high' | 'medium' | 'low'): string {
  switch (priority) {
    case 'high': return '[HIGH]';
    case 'medium': return '[MEDIUM]';
    case 'low': return '[LOW]';
  }
}

// ---------------------------------------------------------------------------
// Language breakdown
// ---------------------------------------------------------------------------

function buildLanguageBreakdown(report: AnalysisReport, _deep?: DeepAnalysis): { language: string; percentage: string }[] {
  const languages = report.languages ?? [];
  if (languages.length === 0) return [];

  // If we have file metrics, compute lines per language from tech stack.
  // Otherwise, distribute evenly as a rough approximation.
  const total = languages.length;
  return languages.map((lang) => ({
    language: lang,
    percentage: `${(100 / total).toFixed(1)}%`,
  }));
}

// ---------------------------------------------------------------------------
// Security findings extraction
// ---------------------------------------------------------------------------

interface SecurityFinding {
  area: string;
  issue: string;
  suggestion: string;
  priority: 'high' | 'medium' | 'low';
  files: string[];
}

function extractSecurityFindings(deep?: DeepAnalysis): SecurityFinding[] {
  if (!deep) return [];
  const securityKeywords = ['security', 'vulnerability', 'auth', 'xss', 'csrf', 'injection', 'secret', 'credential', 'password', 'token', 'cors', 'sanitiz', 'encrypt'];
  return deep.improvements
    .filter((item) => {
      const lower = `${item.area} ${item.issue} ${item.suggestion}`.toLowerCase();
      return securityKeywords.some((kw) => lower.includes(kw));
    })
    .map((item) => ({
      area: item.area,
      issue: item.issue,
      suggestion: item.suggestion,
      priority: item.priority,
      files: item.files ?? [],
    }));
}

// ---------------------------------------------------------------------------
// Export to Markdown
// ---------------------------------------------------------------------------

export function exportToMarkdown(report: AnalysisReport, deep?: DeepAnalysis): string {
  const lines: string[] = [];
  const d = deep ?? report.deepAnalysis;

  // --- Project header ---
  lines.push(`# Analysis Report`);
  lines.push('');
  lines.push(`| Property | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| **Source ID** | \`${report.sourceId}\` |`);
  lines.push(`| **Classification** | ${report.classification} |`);
  lines.push(`| **Complexity** | ${report.complexity} / 10 |`);
  lines.push(`| **Risk** | ${report.risk.toFixed(1)} / 10 |`);
  lines.push(`| **Confidence** | ${(report.confidence * 100).toFixed(0)}% |`);
  if (report.fileCount !== undefined) {
    lines.push(`| **Files** | ${report.fileCount} |`);
  }
  lines.push('');
  lines.push(`> ${report.summary}`);
  lines.push('');

  // --- Health score ---
  const hs = healthScore(report, d);
  const grade = letterGrade(hs);
  lines.push(`## Health Score`);
  lines.push('');
  lines.push(`**${hs.toFixed(1)} / 10** (Grade: **${grade}**)`);
  lines.push('');

  if (d) {
    const dimensions: [string, string][] = [];
    dimensions.push(['Complexity', `${report.complexity} / 10`]);
    dimensions.push(['Risk', `${report.risk.toFixed(1)} / 10`]);
    if (d.codeQuality) {
      dimensions.push(['Comment coverage', `${(d.codeQuality.commentRatio * 100).toFixed(1)}%`]);
      dimensions.push(['Max nesting depth', `${d.codeQuality.maxNestingDepth}`]);
      dimensions.push(['`any` type usage', `${d.codeQuality.anyTypeCount}`]);
      dimensions.push(['Empty catch blocks', `${d.codeQuality.emptyCatchCount}`]);
    }
    if (d.dependencyGraph) {
      dimensions.push(['Circular dependencies', `${d.dependencyGraph.circularDeps.length}`]);
      dimensions.push(['Orphan files', `${d.dependencyGraph.orphanFiles.length}`]);
    }
    lines.push(mdTable(['Dimension', 'Value'], dimensions));
    lines.push('');
  }

  // --- Language breakdown ---
  const langs = report.languages ?? [];
  if (langs.length > 0) {
    lines.push(`## Languages`);
    lines.push('');
    const langRows = buildLanguageBreakdown(report, d);
    lines.push(mdTable(['Language', 'Share'], langRows.map((l) => [l.language, l.percentage])));
    lines.push('');
  }

  // --- Frameworks & tech stack ---
  if (d?.coreSystem) {
    if (d.coreSystem.frameworks.length > 0) {
      lines.push(`## Frameworks`);
      lines.push('');
      for (const fw of d.coreSystem.frameworks) lines.push(`- ${fw}`);
      lines.push('');
    }

    if (d.coreSystem.techStack.length > 0) {
      lines.push(`## Tech Stack`);
      lines.push('');
      for (const t of d.coreSystem.techStack) lines.push(`- ${t}`);
      lines.push('');
    }
  }

  // --- Code quality metrics ---
  if (d?.codeQuality) {
    const cq = d.codeQuality;
    lines.push(`## Code Quality`);
    lines.push('');
    lines.push(mdTable(
      ['Metric', 'Value'],
      [
        ['Total code lines', `${cq.totalCodeLines}`],
        ['Total comment lines', `${cq.totalCommentLines}`],
        ['Comment ratio', `${(cq.commentRatio * 100).toFixed(1)}%`],
        ['Total functions', `${cq.totalFunctions}`],
        ['Avg function length', `${cq.avgFunctionLength.toFixed(1)} lines`],
        ['Largest file', `${cq.maxFilePath} (${cq.maxFileLines} lines)`],
        ['Deepest nesting', `${cq.maxNestingFile} (depth ${cq.maxNestingDepth})`],
        ['`any` type count', `${cq.anyTypeCount}`],
        ['Empty catch blocks', `${cq.emptyCatchCount}`],
        ['TODO/FIXME count', `${cq.todoCount}`],
      ],
    ));
    lines.push('');

    if (cq.largeFiles.length > 0) {
      lines.push(`### Large Files`);
      lines.push('');
      lines.push(mdTable(
        ['File', 'Lines'],
        cq.largeFiles.map((f) => [f.path, `${f.lines}`]),
      ));
      lines.push('');
    }
  }

  // --- Security findings ---
  const findings = extractSecurityFindings(d);
  if (findings.length > 0) {
    lines.push(`## Security Findings`);
    lines.push('');

    const bySeverity: Record<string, SecurityFinding[]> = { high: [], medium: [], low: [] };
    for (const f of findings) (bySeverity[f.priority] ??= []).push(f);

    for (const severity of ['high', 'medium', 'low'] as const) {
      const group = bySeverity[severity] ?? [];
      if (group.length === 0) continue;
      lines.push(`### ${severity.charAt(0).toUpperCase() + severity.slice(1)} Severity`);
      lines.push('');
      for (const f of group) {
        lines.push(`- **${f.area}**: ${f.issue}`);
        lines.push(`  - Suggestion: ${f.suggestion}`);
        if (f.files.length > 0) lines.push(`  - Files: ${f.files.map((p) => `\`${p}\``).join(', ')}`);
      }
      lines.push('');
    }
  }

  // --- Dependency graph summary ---
  if (d?.dependencyGraph) {
    const dg = d.dependencyGraph;
    lines.push(`## Dependency Graph`);
    lines.push('');
    lines.push(`- **Internal imports**: ${dg.internalImportCount}`);
    lines.push(`- **External dependencies**: ${dg.externalDepCount}`);
    lines.push(`- **Total modules**: ${dg.nodes.length}`);
    lines.push('');

    if (dg.centralModules.length > 0) {
      lines.push(`### Central Modules`);
      lines.push('');
      lines.push(mdTable(
        ['Module', 'Imported By'],
        dg.centralModules.map((m) => [m.file, `${m.importedByCount}`]),
      ));
      lines.push('');
    }

    if (dg.circularDeps.length > 0) {
      lines.push(`### Circular Dependencies`);
      lines.push('');
      for (const cycle of dg.circularDeps) {
        lines.push(`- ${cycle.join(' -> ')} -> ${cycle[0]}`);
      }
      lines.push('');
    }

    if (dg.orphanFiles.length > 0) {
      lines.push(`### Orphan Files`);
      lines.push('');
      lines.push('Files not imported by any other module:');
      lines.push('');
      for (const f of dg.orphanFiles) lines.push(`- \`${f}\``);
      lines.push('');
    }
  }

  // --- Improvement suggestions ---
  if (d && d.improvements.length > 0) {
    lines.push(`## Improvement Suggestions`);
    lines.push('');

    const byPriority: Record<string, ImprovementItem[]> = { high: [], medium: [], low: [] };
    for (const item of d.improvements) (byPriority[item.priority] ??= []).push(item);

    for (const priority of ['high', 'medium', 'low'] as const) {
      const group = byPriority[priority] ?? [];
      if (group.length === 0) continue;
      lines.push(`### ${priorityEmoji(priority)} ${priority.charAt(0).toUpperCase() + priority.slice(1)} Priority`);
      lines.push('');
      for (const item of group) {
        lines.push(`- **${item.area}**: ${item.issue}`);
        lines.push(`  - ${item.suggestion}`);
        if (item.files && item.files.length > 0) {
          lines.push(`  - Affects: ${item.files.map((f) => `\`${f}\``).join(', ')}`);
        }
      }
      lines.push('');
    }
  }

  // --- Useful components ---
  if (d && d.usefulComponents.length > 0) {
    lines.push(`## Useful Components`);
    lines.push('');
    lines.push(mdTable(
      ['Name', 'Location', 'Reusability', 'Description'],
      d.usefulComponents.map((c) => [c.name, `\`${c.location}\``, c.reusability, c.description]),
    ));
    lines.push('');
  }

  // --- Optimization recommendations ---
  if (d?.optimizations) {
    const allOpts: { category: string; items: OptimizationSuggestion[] }[] = [
      { category: 'Simplification', items: d.optimizations.simplification },
      { category: 'Alternative Stack', items: d.optimizations.alternativeStack },
      { category: 'Performance', items: d.optimizations.performance },
    ];

    const hasAny = allOpts.some((o) => o.items.length > 0);
    if (hasAny) {
      lines.push(`## Optimization Recommendations`);
      lines.push('');

      for (const { category, items } of allOpts) {
        if (items.length === 0) continue;
        lines.push(`### ${category}`);
        lines.push('');
        for (const opt of items) {
          lines.push(`- **${opt.strategy}** (impact: ${opt.impact}, effort: ${opt.effort})`);
          lines.push(`  - ${opt.description}`);
        }
        lines.push('');
      }
    }
  }

  // --- Insights ---
  if (report.insights.length > 0) {
    lines.push(`## Insights`);
    lines.push('');
    for (const insight of report.insights) lines.push(`- ${insight}`);
    lines.push('');
  }

  lines.push('---');
  lines.push(`*Generated at ${report.createdAt}*`);
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Export to JSON
// ---------------------------------------------------------------------------

export function exportToJson(report: AnalysisReport, deep?: DeepAnalysis): string {
  const d = deep ?? report.deepAnalysis;
  const hs = healthScore(report, d);

  const output = {
    meta: {
      generatedAt: report.createdAt,
      reportId: report.id,
      sourceId: report.sourceId,
    },
    summary: report.summary,
    classification: report.classification,
    complexity: report.complexity,
    risk: report.risk,
    confidence: report.confidence,
    healthScore: hs,
    healthGrade: letterGrade(hs),
    fileCount: report.fileCount ?? null,
    languages: report.languages ?? [],
    insights: report.insights,
    deepAnalysis: d
      ? {
          coreSystem: d.coreSystem,
          codeQuality: d.codeQuality ?? null,
          dependencyGraph: d.dependencyGraph ?? null,
          configAnalysis: d.configAnalysis ?? null,
          usefulComponents: d.usefulComponents,
          improvements: d.improvements,
          uniqueness: d.uniqueness,
          optimizations: d.optimizations,
        }
      : null,
    securityFindings: extractSecurityFindings(d),
  };

  return JSON.stringify(output, null, 2);
}

// ---------------------------------------------------------------------------
// Export to CSV
// ---------------------------------------------------------------------------

export function exportToCsv(
  report: AnalysisReport,
  deep?: DeepAnalysis,
): { metrics: string; findings: string; improvements: string } {
  const d = deep ?? report.deepAnalysis;

  // --- File metrics CSV ---
  const metricsHeaders = ['path', 'lines', 'functions', 'max_nesting', 'comment_lines'];
  const metricsRows: (string | number)[][] = [];

  if (d?.codeQuality) {
    const cq = d.codeQuality;
    // Top files by size give us per-file info; the full per-file metrics are not
    // stored on the report, but we can output what is available.
    for (const f of cq.topFilesBySize) {
      metricsRows.push([f.path, f.lines, '', '', '']);
    }

    // If dependency graph nodes exist, enrich the rows
    if (d.dependencyGraph) {
      for (const node of d.dependencyGraph.nodes) {
        const existing = metricsRows.find((r) => r[0] === node.file);
        if (!existing) {
          metricsRows.push([node.file, '', '', '', '']);
        }
      }
    }
  }

  // Always include an aggregate row
  if (d?.codeQuality) {
    const cq = d.codeQuality;
    metricsRows.push([
      '[TOTAL]',
      cq.totalCodeLines + cq.totalCommentLines + (cq.totalCodeLines > 0 ? Math.round(cq.totalCodeLines * 0.1) : 0),
      cq.totalFunctions,
      cq.maxNestingDepth,
      cq.totalCommentLines,
    ]);
  }

  const metrics = csvTable(metricsHeaders, metricsRows);

  // --- Security findings CSV ---
  const findingsHeaders = ['area', 'severity', 'issue', 'suggestion', 'files'];
  const securityFindings = extractSecurityFindings(d);
  const findingsRows: (string | number)[][] = securityFindings.map((f) => [
    f.area,
    f.priority,
    f.issue,
    f.suggestion,
    f.files.join('; '),
  ]);

  // Also include all improvements that look like code-quality findings
  if (d) {
    for (const item of d.improvements) {
      const lower = `${item.area} ${item.issue}`.toLowerCase();
      const isSecurityAlready = securityFindings.some(
        (sf) => sf.area === item.area && sf.issue === item.issue,
      );
      if (isSecurityAlready) continue;

      // Include code quality findings (empty catches, any types, etc.)
      const codeQualityKeywords = ['empty catch', 'any type', 'todo', 'fixme', 'nesting', 'lint', 'error handling'];
      if (codeQualityKeywords.some((kw) => lower.includes(kw))) {
        findingsRows.push([
          item.area,
          item.priority,
          item.issue,
          item.suggestion,
          (item.files ?? []).join('; '),
        ]);
      }
    }
  }

  const findingsOutput = csvTable(findingsHeaders, findingsRows);

  // --- Improvements CSV ---
  const improvementsHeaders = ['area', 'issue', 'priority', 'suggestion', 'files'];
  const improvementsRows: (string | number)[][] = (d?.improvements ?? []).map((item) => [
    item.area,
    item.issue,
    item.priority,
    item.suggestion,
    (item.files ?? []).join('; '),
  ]);

  const improvementsOutput = csvTable(improvementsHeaders, improvementsRows);

  return {
    metrics,
    findings: findingsOutput,
    improvements: improvementsOutput,
  };
}
