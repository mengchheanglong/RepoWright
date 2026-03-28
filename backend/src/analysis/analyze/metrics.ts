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
  let inBlockComment = false;   // C-style /* */ block comments
  let inPyDocstring = false;    // Python triple-quoted docstrings
  let pyDocstringQuote = '';
  let pyDocstringIsComment = false; // true if this docstring is at def/class/module level
  // Track previous non-blank, non-comment line to detect def/class-level docstrings
  let prevNonBlankLine = '';

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      blankLines++;
      continue;
    }

    // Inside a Python docstring
    if (inPyDocstring) {
      if (pyDocstringIsComment) commentLines++; else codeLines++;
      if (trimmed.includes(pyDocstringQuote)) inPyDocstring = false;
      continue;
    }

    if (inBlockComment) {
      commentLines++;
      if (trimmed.includes('*/')) inBlockComment = false;
      continue;
    }
    if (/^\/\*/.test(trimmed)) {
      commentLines++;
      if (!trimmed.includes('*/')) inBlockComment = true;
      continue;
    }
    // Python triple-quoted strings: classify based on context
    // - After def/class/module-start → documentation (comment)
    // - Inside assignment/expression → code
    if (ext === '.py' && /^(?:"""|''')/.test(trimmed)) {
      const prefixBeforeQuote = line.slice(0, line.search(/"""|'''/)).trim();
      if (!prefixBeforeQuote || /^(r|b|f|rb|br|u)?$/i.test(prefixBeforeQuote)) {
        // Determine if this is a documentation docstring (after def/class/module start)
        const isDocComment = prevNonBlankLine === '' || // module-level (first thing in file)
          /^\s*(?:(?:async\s+)?def|class)\s+/.test(prevNonBlankLine) || // after def/class
          /:\s*$/.test(prevNonBlankLine); // after any colon-ending line (e.g. class body)
        if (isDocComment) commentLines++; else codeLines++;
        const quote = trimmed.slice(0, 3);
        const closingIdx = trimmed.indexOf(quote, 3);
        if (closingIdx < 0) {
          inPyDocstring = true;
          pyDocstringQuote = quote;
          pyDocstringIsComment = isDocComment;
        }
        prevNonBlankLine = trimmed;
        continue;
      }
    }

    if (/^\/\//.test(trimmed) ||
      (ext === '.py' && /^#/.test(trimmed)) ||
      (ext === '.rb' && /^#/.test(trimmed)) ||
      (ext === '.sh' && /^#/.test(trimmed)) ||
      ((ext === '.go' || ext === '.rs' || ext === '.c' || ext === '.cpp' || ext === '.cc' || ext === '.cxx' || ext === '.h' || ext === '.hpp') && /^\/\//.test(trimmed)) ||
      (ext === '.lua' && /^--/.test(trimmed)) ||
      /^\*/.test(trimmed)) {
      commentLines++;
    } else {
      codeLines++;
    }

    if (ext === '.py') {
      const indent = line.search(/\S/);
      // Support both 4-space and 2-space indentation by detecting the common indent unit
      const indentLevel = Math.floor(indent / 4);
      if (indentLevel > maxNesting) maxNesting = indentLevel;
    } else {
      // Only count curly braces for nesting depth — parentheses are function calls/conditions, not nesting
      for (const ch of trimmed) {
        if (ch === '{') currentNesting++;
        if (ch === '}') currentNesting = Math.max(0, currentNesting - 1);
      }
      if (currentNesting > maxNesting) maxNesting = currentNesting;
    }

    // Track previous non-blank line for Python docstring context detection
    if (ext === '.py') prevNonBlankLine = trimmed;
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
  } else if (ext === '.c' || ext === '.cpp' || ext === '.cc' || ext === '.cxx' || ext === '.h' || ext === '.hpp') {
    // C/C++ function definitions: return_type name(params) { or name(params) {
    // Also count method definitions like ClassName::method(params) {
    funcCount =
      (content.match(/^\s*(?:[\w:*&<>,\s]+)\s+(\w+::)?\w+\s*\([^)]*\)\s*(?:const\s*)?(?:noexcept\s*)?(?:override\s*)?\{/gm) ?? []).length;
    // Avoid over-counting: subtract obvious non-functions like if/for/while/switch
    const controlStructures = (content.match(/^\s*(?:if|else\s+if|for|while|switch|catch)\s*\(/gm) ?? []).length;
    funcCount = Math.max(0, funcCount - controlStructures);
  } else {
    // JS/TS: count distinct function forms without overlap
    // 1. Named function declarations: function foo(
    const namedFns = (content.match(/\bfunction\s+\w+/g) ?? []).length;
    // 2. Arrow functions assigned to variables: const foo = (...) => or const foo = async (...) =>
    const arrowFns = (content.match(/(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_]\w*)\s*=>/g) ?? []).length;
    // 3. Class/object methods: identifier( with { but NOT control flow or function keyword
    const methodLike = (content.match(/(?:async\s+)?\w+\s*\([^)]*\)\s*\{/g) ?? []).length;
    // Subtract control flow that matches method pattern
    const controlFlow = (content.match(/\b(?:if|else|for|while|switch|catch|return|throw|new|typeof|await|yield)\s*\(/g) ?? []).length;
    // Subtract function declarations (already counted in namedFns)
    const funcKeyword = (content.match(/\bfunction\s*\w*\s*\(/g) ?? []).length;
    const methods = Math.max(0, methodLike - controlFlow - funcKeyword);
    funcCount = namedFns + arrowFns + methods;
  }
  const functions = funcCount;

  let imports = 0;
  let exports = 0;
  if (ext === '.py') {
    imports = (content.match(/^\s*(?:import|from)\s+/gm) ?? []).length;
  } else if (ext === '.go') {
    // Count individual import paths inside import blocks, plus single-line imports
    const singleImports = (content.match(/^\s*import\s+"[^"]+"/gm) ?? []).length;
    const blockImportPaths = (content.match(/^\s*"[^"]+"/gm) ?? []).length;
    imports = singleImports + blockImportPaths;
  } else if (ext === '.rs') {
    imports = (content.match(/^\s*use\s+/gm) ?? []).length;
    exports = (content.match(/^\s*pub\s+/gm) ?? []).length;
  } else if (ext === '.java' || ext === '.kt') {
    imports = (content.match(/^\s*import\s+/gm) ?? []).length;
  } else if (ext === '.rb') {
    imports = (content.match(/^\s*require/gm) ?? []).length;
  } else if (ext === '.c' || ext === '.cpp' || ext === '.cc' || ext === '.cxx' || ext === '.h' || ext === '.hpp') {
    imports = (content.match(/^\s*#include\s+/gm) ?? []).length;
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

// ---------------------------------------------------------------------------
// Cognitive Complexity (SonarSource-inspired)
// ---------------------------------------------------------------------------
// Increments for each break in linear flow (if, for, while, catch, switch,
// ternary, logical chain). Nested control flow gets an additional nesting
// penalty. This measures how hard code is to *understand*, not just testability.

export function computeCognitiveComplexity(content: string, ext: string): number {
  let complexity = 0;
  let nesting = 0;

  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    // Skip blanks, comments
    if (trimmed.length === 0) continue;
    if (/^\/\/|^#|^--|^\*|^\/\*/.test(trimmed)) continue;

    // Nesting increments: opening braces (or indent-based for Python)
    const controlFlowMatch = ext === '.py'
      ? /^\s*(if|elif|else|for|while|try|except|with)\b/.test(trimmed)
      : /\b(if|else\s+if|else|for|while|switch|catch|case)\b/.test(trimmed);

    if (controlFlowMatch) {
      // +1 for each control flow break, +nesting penalty
      complexity += 1 + nesting;
    }

    // Logical operator sequences: each && or || in a condition adds +1
    const logicalOps = (trimmed.match(/&&|\|\||and\s|or\s/g) ?? []).length;
    complexity += logicalOps;

    // Ternary operator adds +1 + nesting
    const ternaries = (trimmed.match(/\?[^?:]*:/g) ?? []).length;
    complexity += ternaries * (1 + nesting);

    // Track nesting
    if (ext === '.py') {
      // Not perfect but approximates nesting via colon-ending control flow
      if (/:\s*(#.*)?$/.test(trimmed) && controlFlowMatch) nesting++;
      // Dedent detection for Python would need full indent tracking — approximate
    } else {
      for (const ch of trimmed) {
        if (ch === '{') nesting++;
        if (ch === '}') nesting = Math.max(0, nesting - 1);
      }
    }
  }

  return complexity;
}

// ---------------------------------------------------------------------------
// Additional quality checks: argument count, boolean complexity, duplicates
// ---------------------------------------------------------------------------

export function computeMaxArgCount(content: string, ext: string): { count: number; file: string; func: string } {
  let maxArgs = 0;
  let maxFunc = '';

  // Match function signatures and count parameters
  const patterns = ext === '.py'
    ? /def\s+(\w+)\s*\(([^)]*)\)/g
    : ext === '.go'
      ? /func\s+(?:\([^)]*\)\s+)?(\w+)\s*\(([^)]*)\)/g
      : /(?:function\s+(\w+)|(\w+)\s*=\s*(?:async\s+)?(?:function)?\s*)\s*\(([^)]*)\)/g;

  for (const match of content.matchAll(patterns)) {
    const funcName = match[1] ?? match[2] ?? '';
    const params = match[ext === '.py' ? 2 : ext === '.go' ? 2 : 3] ?? '';
    if (params.trim().length === 0) continue;
    // Count params by splitting on commas, excluding type annotations
    const argCount = params.split(',').filter((p) => p.trim().length > 0).length;
    if (argCount > maxArgs) {
      maxArgs = argCount;
      maxFunc = funcName;
    }
  }

  return { count: maxArgs, file: '', func: maxFunc };
}

export function countBooleanComplexity(content: string): number {
  // Count lines with 3+ boolean operators (complex conditions)
  let count = 0;
  for (const line of content.split('\n')) {
    const ops = (line.match(/&&|\|\||\band\b|\bor\b/g) ?? []).length;
    if (ops >= 3) count++;
  }
  return count;
}

export function detectDuplicateBlocks(fileContents: Map<string, string>): number {
  // Hash-based duplicate detection: find blocks of 4+ consecutive non-blank
  // lines that appear in multiple files or locations
  const blockHashes = new Map<string, number>();
  const blockSize = 4;

  for (const [, content] of fileContents) {
    const lines = content.split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !/^[/\*#]/.test(l) && !/^import\b|^export\b|^from\b|^require\b/.test(l));

    for (let i = 0; i <= lines.length - blockSize; i++) {
      const block = lines.slice(i, i + blockSize).join('\n');
      if (block.length < 40) continue; // Skip trivially short blocks
      blockHashes.set(block, (blockHashes.get(block) ?? 0) + 1);
    }
  }

  // Count blocks that appear 2+ times
  let duplicates = 0;
  for (const count of blockHashes.values()) {
    if (count >= 2) duplicates++;
  }

  return duplicates;
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

  // All-scope totals (including vendor/test/docs/generated)
  let allScopeCode = 0;
  let allScopeFunctions = 0;
  for (const m of metrics) {
    allScopeCode += m.codeLines;
    allScopeFunctions += m.functions;
  }

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
      // Count except blocks where the body is ONLY pass/ellipsis/continue on the very next line,
      // AND there is nothing else in that except block (next non-blank line after that is at
      // same or lower indent, or is another except/finally/else).
      const lines = content.split('\n');
      let pyEmptyCatch = 0;
      for (let li = 0; li < lines.length - 1; li++) {
        const rawLine = lines[li]!;
        const exceptLine = rawLine.trim();
        // Match `except:` or `except SomeError:` or `except (A, B) as e:`
        if (!/^except\b/.test(exceptLine)) continue;
        if (!/:\s*$/.test(exceptLine)) continue;

        // Determine indent level of the except line
        const exceptIndent = rawLine.search(/\S/);
        const nextLine = lines[li + 1]?.trim() ?? '';
        if (nextLine !== 'pass' && nextLine !== '...' && nextLine !== 'continue') continue;

        // Check that the line after pass/... is at same or lower indent (i.e., the except body is just one statement)
        const lineAfter = lines[li + 2];
        if (lineAfter !== undefined) {
          const afterTrimmed = lineAfter.trim();
          if (afterTrimmed.length > 0) {
            const afterIndent = lineAfter.search(/\S/);
            // If the line after pass has GREATER indent than except, it means there's more code in the block
            if (afterIndent > exceptIndent + 4) continue;
          }
        }
        pyEmptyCatch++;
      }
      if (pyEmptyCatch > 0) {
        emptyCatchCount += pyEmptyCatch;
        emptyCatchFiles.push(`${fp} (${pyEmptyCatch})`);
      }
    } else {
      // JS/TS/other: count catch blocks with empty or whitespace-only body
      const fileEmptyCatch = (content.match(/catch\s*(?:\([^)]*\))?\s*\{[\s]*\}/g) ?? []).length;
      if (fileEmptyCatch > 0) {
        emptyCatchCount += fileEmptyCatch;
        emptyCatchFiles.push(`${fp} (${fileEmptyCatch})`);
      }
    }

    todoCount += (content.match(/(?:\/\/|#|--|\/\*)\s*(?:TODO|FIXME|HACK|XXX)/gi) ?? []).length;
  }

  topFiles.sort((a, b) => b.lines - a.lines);
  largeFiles.sort((a, b) => b.lines - a.lines);

  // Compute new quality metrics
  let maxCognitiveComplexity = 0;
  let maxCognitiveComplexityFile = '';
  let totalCognitiveComplexity = 0;
  let maxArgCount = 0;
  let maxArgCountFile = '';
  let totalBooleanComplexity = 0;

  for (const [fp, content] of fileContents) {
    if (!isActionableCodePath(fp)) continue;
    const ext = path.extname(fp).toLowerCase();

    const cc = computeCognitiveComplexity(content, ext);
    totalCognitiveComplexity += cc;
    if (cc > maxCognitiveComplexity) {
      maxCognitiveComplexity = cc;
      maxCognitiveComplexityFile = fp;
    }

    const argResult = computeMaxArgCount(content, ext);
    if (argResult.count > maxArgCount) {
      maxArgCount = argResult.count;
      maxArgCountFile = `${fp} (${argResult.func}: ${argResult.count} params)`;
    }

    totalBooleanComplexity += countBooleanComplexity(content);
  }

  const duplicateBlockCount = detectDuplicateBlocks(fileContents);

  return {
    totalCodeLines: totalCode,
    totalCommentLines: totalComments,
    commentRatio: totalCode > 0 ? totalComments / (totalCode + totalComments) : 0,
    totalFunctions,
    avgFunctionLength: totalFunctions > 0 ? Math.round(totalCode / totalFunctions) : 0,
    totalAllScopeCodeLines: allScopeCode,
    totalAllScopeFunctions: allScopeFunctions,
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
    cognitiveComplexity: totalCognitiveComplexity,
    maxCognitiveComplexity,
    maxCognitiveComplexityFile,
    maxArgCount,
    maxArgCountFile,
    booleanComplexityCount: totalBooleanComplexity,
    duplicateBlockCount,
  };
}
