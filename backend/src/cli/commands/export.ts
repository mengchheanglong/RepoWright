import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { exportToMarkdown, exportToJson, exportToCsv } from '../../analysis/export.js';
import { getContext } from '../context.js';

export async function handleExport(
  sourceId: string,
  opts: { format?: string; output?: string },
): Promise<void> {
  const { repo } = getContext();
  const format = opts.format ?? 'markdown';
  const analysis = repo.getAnalysisBySource(sourceId);
  if (!analysis) {
    console.error(chalk.red(`No analysis found for source ${sourceId}`));
    return;
  }

  const deep = analysis.deepAnalysis;
  const outDir = opts.output ?? '.';

  if (format === 'json') {
    const json = exportToJson(analysis, deep);
    const outPath = path.join(outDir, `analysis-${sourceId}.json`);
    fs.writeFileSync(outPath, json, 'utf-8');
    console.log(chalk.green(`JSON report written to ${outPath}`));
  } else if (format === 'csv') {
    const csv = exportToCsv(analysis, deep);
    const base = `analysis-${sourceId}`;
    const metricsPath = path.join(outDir, `${base}-metrics.csv`);
    const findingsPath = path.join(outDir, `${base}-findings.csv`);
    const improvementsPath = path.join(outDir, `${base}-improvements.csv`);
    fs.writeFileSync(metricsPath, csv.metrics, 'utf-8');
    fs.writeFileSync(findingsPath, csv.findings, 'utf-8');
    fs.writeFileSync(improvementsPath, csv.improvements, 'utf-8');
    console.log(chalk.green(`CSV reports written to ${metricsPath}, ${findingsPath}, ${improvementsPath}`));
  } else {
    const md = exportToMarkdown(analysis, deep);
    const outPath = path.join(outDir, `analysis-${sourceId}.md`);
    fs.writeFileSync(outPath, md, 'utf-8');
    console.log(chalk.green(`Markdown report written to ${outPath}`));
  }
}
