import path from 'node:path';
import type { CodeQuality, FileMetrics } from '../../domain/index.js';
import { isActionableCodePath } from './scoping.js';

export function computeAllFileMetrics(fileContents: Map<string, string>): FileMetrics[] {
  const results: FileMetrics[] = [];
  for (const [fp, content] of fileContents) {
    results.push(computeFileMetrics(fp, content));
  }
  return results;
}

export function computeFileMetrics(filePath: string, content: string): FileMetrics {
  const rawLines = content.split('\n');
  const ext = path.extname(filePath).toLowerCase();
  let codeLines = 0;
  let commentLines = 0;
  let blankLines = 0;
  let maxNesting = 0;
  let currentNesting = 0;
  let inBlockComment = false;

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      blankLines++;
      continue;
    }

    if (inBlockComment) {
      commentLines++;
      if (trimmed.includes('*/') || (ext === '.py' && trimmed.includes('"""'))) inBlockComment = false;
      continue;
    }
    if (/^\/\*|^"""|^'''/.test(trimmed)) {
      commentLines++;
      if (!trimmed.includes('*/') && !(trimmed.indexOf('"""', 3) >= 0)) inBlockComment = true;
      continue;
    }

    if (/^\/\//.test(trimmed) ||
      (ext === '.py' && /^#/.test(trimmed)) ||
      (ext === '.rb' && /^#/.test(trimmed)) ||
      (ext === '.sh' && /^#/.test(trimmed)) ||
      (ext === '.lua' && /^--/.test(trimmed)) ||
      /^\*/.test(trimmed)) {
      commentLines++;
    } else {
      codeLines++;
    }

    if (ext === '.py') {
      const indent = line.search(/\S/);
      const indentLevel = Math.floor(indent / 4);
      if (indentLevel > maxNesting) maxNesting = indentLevel;
    } else {
      for (const ch of trimmed) {
        if (ch === '{' || ch === '(') currentNesting++;
        if (ch === '}' || ch === ')') currentNesting = Math.max(0, currentNesting - 1);
      }
      if (currentNesting > maxNesting) maxNesting = currentNesting;
    }
  }

  let funcCount = 0;
  if (ext === '.py') {
    funcCount = (content.match(/^\s*(?:async\s+)?def\s+\w+/gm) ?? []).length;
  } else if (ext === '.go') {
    funcCount = (content.match(/^func\s+/gm) ?? []).length;
  } else if (ext === '.rs') {
    funcCount = (content.match(/(?:pub\s+)?(?:async\s+)?fn\s+\w+/g) ?? []).length;
  } else if (ext === '.java' || ext === '.kt') {
    funcCount = (content.match(/(?:public|private|protected|static|\s)*\s+\w+\s*\([^)]*\)\s*(?:throws\s+\w+\s*)?\{/g) ?? []).length;
  } else if (ext === '.rb') {
    funcCount = (content.match(/^\s*def\s+\w+/gm) ?? []).length;
  } else {
    funcCount =
      (content.match(/\bfunction\s+\w+/g) ?? []).length +
      (content.match(/(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_]\w*)\s*=>/g) ?? []).length +
      (content.match(/(?:async\s+)?\w+\s*\([^)]*\)\s*\{/g) ?? []).length;
    funcCount = Math.round(funcCount * 0.65);
  }
  const functions = Math.max(funcCount, 1);

  let imports = 0;
  let exports = 0;
  if (ext === '.py') {
    imports = (content.match(/^\s*(?:import|from)\s+/gm) ?? []).length;
  } else if (ext === '.go') {
    imports = (content.match(/^\s*import\s+/gm) ?? []).length + (content.match(/"[^"]+"/g) ?? []).length;
  } else if (ext === '.rs') {
    imports = (content.match(/^\s*use\s+/gm) ?? []).length;
    exports = (content.match(/^\s*pub\s+/gm) ?? []).length;
  } else if (ext === '.java' || ext === '.kt') {
    imports = (content.match(/^\s*import\s+/gm) ?? []).length;
  } else if (ext === '.rb') {
    imports = (content.match(/^\s*require/gm) ?? []).length;
  } else {
    imports = (content.match(/^import\s+|^from\s+|require\(/gm) ?? []).length;
    exports = (content.match(/^export\s+/gm) ?? []).length;
  }

  return {
    path: filePath,
    lines: rawLines.length,
    codeLines,
    commentLines,
    blankLines,
    functions,
    maxNesting,
    imports,
    exports,
  };
}

export function aggregateCodeQuality(metrics: FileMetrics[], fileContents: Map<string, string>): CodeQuality {
  let totalCode = 0;
  let totalComments = 0;
  let totalFunctions = 0;
  let maxFileLines = 0;
  let maxFilePath = '';
  let maxNesting = 0;
  let maxNestingFile = '';
  let todoCount = 0;
  const largeFiles: { path: string; lines: number }[] = [];
  const topFiles: { path: string; lines: number }[] = [];
  let anyCount = 0;
  const anyFiles: string[] = [];
  let emptyCatchCount = 0;
  const emptyCatchFiles: string[] = [];

  for (const m of metrics) {
    const actionable = isActionableCodePath(m.path);
    if (!actionable) continue;

    totalCode += m.codeLines;
    totalComments += m.commentLines;
    totalFunctions += m.functions;
    topFiles.push({ path: m.path, lines: m.lines });

    if (m.lines > maxFileLines) {
      maxFileLines = m.lines;
      maxFilePath = m.path;
    }
    if (m.maxNesting > maxNesting) {
      maxNesting = m.maxNesting;
      maxNestingFile = m.path;
    }
    if (m.lines > 350) largeFiles.push({ path: m.path, lines: m.lines });
  }

  for (const [fp, content] of fileContents) {
    const ext = path.extname(fp).toLowerCase();
    if (!isActionableCodePath(fp)) continue;

    if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
      const fileAny = (content.match(/:\s*any\b/g) ?? []).length;
      if (fileAny > 0) {
        anyCount += fileAny;
        anyFiles.push(`${fp} (${fileAny})`);
      }
    }

    if (ext === '.py') {
      // Only count truly bare except clauses (no specific exception type)
      // These catch everything including KeyboardInterrupt and SystemExit
      const pyBareExcept = (content.match(/except\s*:\s*(?:pass|\.\.\.)\s*$/gm) ?? []).length;
      // Also count except with type but only pass — still suppresses errors
      const pyTypedPass = (content.match(/except\s+\w+(?:\.\w+)*\s*:\s*(?:pass|\.\.\.)\s*$/gm) ?? []).length;
      const pyEmptyCatch = pyBareExcept + pyTypedPass;
      if (pyEmptyCatch > 0) {
        emptyCatchCount += pyEmptyCatch;
        emptyCatchFiles.push(`${fp} (${pyEmptyCatch})`);
      }
    } else {
      const fileEmptyCatch = (content.match(/catch\s*(?:\(\w*\))?\s*\{[\s]*\}/g) ?? []).length;
      if (fileEmptyCatch > 0) {
        emptyCatchCount += fileEmptyCatch;
        emptyCatchFiles.push(`${fp} (${fileEmptyCatch})`);
      }
    }

    todoCount += (content.match(/(?:\/\/|#|--|\/\*)\s*(?:TODO|FIXME|HACK|XXX)/gi) ?? []).length;
  }

  topFiles.sort((a, b) => b.lines - a.lines);
  largeFiles.sort((a, b) => b.lines - a.lines);

  return {
    totalCodeLines: totalCode,
    totalCommentLines: totalComments,
    commentRatio: totalCode > 0 ? totalComments / (totalCode + totalComments) : 0,
    totalFunctions,
    avgFunctionLength: totalFunctions > 0 ? Math.round(totalCode / totalFunctions) : 0,
    maxFileLines,
    maxFilePath,
    maxNestingDepth: maxNesting,
    maxNestingFile,
    anyTypeCount: anyCount,
    anyTypeFiles: anyFiles.slice(0, 10),
    emptyCatchCount,
    emptyCatchFiles: emptyCatchFiles.slice(0, 10),
    todoCount,
    largeFiles: largeFiles.slice(0, 15),
    topFilesBySize: topFiles.slice(0, 10),
  };
}
