import chalk from 'chalk';
import { analyzeSource } from '../../analysis/index.js';
import { ingestSource } from '../../intake/index.js';
import { getContext } from '../context.js';

export async function handleAnalyze(sourceOrId: string): Promise<void> {
  const { config, repo } = getContext();

  // Check if it's an existing source ID
  let src = repo.getSource(sourceOrId);
  if (src) {
    const existing = repo.getAnalysisBySource(src.id);
    if (existing) {
      printAnalysis(existing);
      return;
    }
  } else {
    // Treat as new source input
    src = ingestSource(sourceOrId, config);
    repo.saveSource(src);
    console.log(chalk.green(`Source ingested: ${src.id}`));
  }

  const analysis = analyzeSource(src, config);
  repo.saveAnalysis(analysis);
  printAnalysis(analysis);
}

function printAnalysis(analysis: {
  id: string;
  summary: string;
  classification: string;
  complexity: number;
  risk: number;
  confidence: number;
  languages?: string[];
  insights: string[];
}): void {
  console.log(chalk.bold('\nAnalysis Report'));
  console.log(`  ID:             ${analysis.id}`);
  console.log(`  Classification: ${chalk.yellow(analysis.classification)}`);
  console.log(`  Complexity:     ${analysis.complexity}/10`);
  console.log(`  Risk:           ${analysis.risk.toFixed(1)}/10`);
  console.log(`  Confidence:     ${(analysis.confidence * 100).toFixed(0)}%`);
  if (analysis.languages?.length) {
    console.log(`  Languages:      ${analysis.languages.join(', ')}`);
  }
  console.log(`\n  Summary: ${analysis.summary}`);
  if (analysis.insights.length > 0) {
    console.log('\n  Insights:');
    for (const i of analysis.insights) {
      console.log(`    - ${i}`);
    }
  }
}
