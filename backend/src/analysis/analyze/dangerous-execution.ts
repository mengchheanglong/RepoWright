import path from 'node:path';

export interface DynamicExecutionSignal {
  title: 'Dynamic eval()' | 'Command Injection';
  description: string;
  severity: 'critical' | 'high';
  confidence: 'high' | 'medium';
  line: number;
}

function getLineNumber(content: string, matchIndex: number): number {
  let line = 1;
  for (let i = 0; i < matchIndex && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

function isInsideDocstringOrComment(content: string, matchIndex: number, filePath: string): boolean {
  const ext = path.extname(filePath).slice(1).toLowerCase();

  if (ext === 'py') {
    let inTriple = false;
    let tripleChar = '';
    let i = 0;
    while (i < content.length && i < matchIndex) {
      if (!inTriple) {
        if (content.slice(i, i + 3) === '"""' || content.slice(i, i + 3) === "'''") {
          inTriple = true;
          tripleChar = content.slice(i, i + 3);
          i += 3;
          continue;
        }
      } else if (content.slice(i, i + 3) === tripleChar) {
        inTriple = false;
        i += 3;
        continue;
      }
      i++;
    }
    if (inTriple) return true;
  }

  const lineStart = content.lastIndexOf('\n', matchIndex) + 1;
  const lineContent = content.slice(lineStart, matchIndex).trim();
  if (ext === 'py' && lineContent.startsWith('#')) return true;
  if (['js', 'ts', 'jsx', 'tsx', 'go', 'rs', 'java'].includes(ext) && lineContent.startsWith('//')) return true;
  if (lineContent.startsWith('*') || lineContent.startsWith('/*')) return true;
  if (lineContent.startsWith('>>>') || lineContent.startsWith('...')) return true;

  return false;
}

function isLikelyPatternDefinitionContext(content: string, matchIndex: number): boolean {
  const lineStart = content.lastIndexOf('\n', matchIndex) + 1;
  const lineEnd = content.indexOf('\n', matchIndex);
  const line = content.slice(lineStart, lineEnd >= 0 ? lineEnd : content.length);
  const windowStart = Math.max(0, matchIndex - 140);
  const windowEnd = Math.min(content.length, matchIndex + 80);
  const window = content.slice(windowStart, windowEnd);

  return /(?:regex|pattern|title|description)\s*:\s*(?:\/|['"])|new\s+RegExp\s*\(|=\s*\/.+\/[dgimsuy]*\.exec\s*\(|\.match(All)?\s*\(\s*\//i.test(window) ||
    /const\s+\w+\s*=\s*\/.+\/[dgimsuy]*/i.test(line);
}

function pushSignal(
  signals: DynamicExecutionSignal[],
  content: string,
  filePath: string,
  title: DynamicExecutionSignal['title'],
  description: string,
  severity: DynamicExecutionSignal['severity'],
  confidence: DynamicExecutionSignal['confidence'],
  regex: RegExp,
): void {
  const global = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  let match = global.exec(content);
  while (match !== null) {
    const currentMatch = match;
    match = global.exec(content);
    if (isInsideDocstringOrComment(content, currentMatch.index, filePath)) continue;
    if (isLikelyPatternDefinitionContext(content, currentMatch.index)) continue;
    signals.push({
      title,
      description,
      severity,
      confidence,
      line: getLineNumber(content, currentMatch.index),
    });
  }
}

function startsWithStaticStringArgument(content: string, openParenIndex: number): boolean {
  let i = openParenIndex + 1;
  while (i < content.length && /\s/.test(content[i] ?? '')) i++;

  const quote = content[i];
  if (!quote || ![`'`, '"', '`'].includes(quote)) return false;

  let escaped = false;
  for (let j = i + 1; j < content.length; j++) {
    const ch = content[j];
    if (!ch) return false;
    if (quote === '`' && ch === '$' && content[j + 1] === '{') return false;
    if (!escaped && ch === quote) {
      let k = j + 1;
      while (k < content.length && /\s/.test(content[k] ?? '')) k++;
      return content[k] === ',' || content[k] === ')';
    }
    escaped = !escaped && ch === '\\';
    if (quote !== '`' && ch === '\n') return false;
  }

  return false;
}

function getImportedChildProcessBindings(content: string): { direct: Set<string>; namespaces: Set<string> } {
  const direct = new Set<string>();
  const namespaces = new Set<string>();

  for (const match of content.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"](?:node:)?child_process['"]/g)) {
    const items = (match[1] ?? '').split(',');
    for (const item of items) {
      const binding = item.trim().split(/\s+as\s+/i).at(-1)?.trim();
      if (binding) direct.add(binding);
    }
  }

  for (const match of content.matchAll(/const\s*\{([^}]+)\}\s*=\s*require\(\s*['"](?:node:)?child_process['"]\s*\)/g)) {
    const items = (match[1] ?? '').split(',');
    for (const item of items) {
      const binding = item.trim().split(':').at(-1)?.trim();
      if (binding) direct.add(binding);
    }
  }

  for (const match of content.matchAll(/import\s+\*\s+as\s+(\w+)\s+from\s+['"](?:node:)?child_process['"]/g)) {
    if (match[1]) namespaces.add(match[1]);
  }
  for (const match of content.matchAll(/const\s+(\w+)\s*=\s*require\(\s*['"](?:node:)?child_process['"]\s*\)/g)) {
    if (match[1]) namespaces.add(match[1]);
  }

  return { direct, namespaces };
}

function pushJsCommandSignals(
  signals: DynamicExecutionSignal[],
  content: string,
  filePath: string,
  regex: RegExp,
): void {
  const global = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  let match = global.exec(content);
  while (match !== null) {
    const currentMatch = match;
    match = global.exec(content);
    if (isInsideDocstringOrComment(content, currentMatch.index, filePath)) continue;
    if (isLikelyPatternDefinitionContext(content, currentMatch.index)) continue;

    const openParenIndex = content.indexOf('(', currentMatch.index);
    if (openParenIndex < 0 || startsWithStaticStringArgument(content, openParenIndex)) continue;

    signals.push({
      title: 'Command Injection',
      description: 'child_process execution with dynamic input may allow command injection.',
      severity: 'critical',
      confidence: 'high',
      line: getLineNumber(content, currentMatch.index),
    });
  }
}

export function detectDynamicExecutionSignals(filePath: string, content: string): DynamicExecutionSignal[] {
  const signals: DynamicExecutionSignal[] = [];
  const ext = path.extname(filePath).toLowerCase();

  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
    pushSignal(
      signals,
      content,
      filePath,
      'Dynamic eval()',
      'eval() with non-literal input enables arbitrary code execution.',
      'critical',
      'high',
      /\beval\s*\(\s*(?!['"`][^'"`\n]*['"`]\s*\))[^)\n]+/g,
    );

    const childProcessBindings = getImportedChildProcessBindings(content);
    for (const binding of ['exec', 'execSync']) {
      if (childProcessBindings.direct.has(binding)) {
        pushJsCommandSignals(signals, content, filePath, new RegExp(`\\b${binding}\\s*\\(`, 'g'));
      }
    }
    for (const namespace of childProcessBindings.namespaces) {
      pushJsCommandSignals(signals, content, filePath, new RegExp(`\\b${namespace}\\.(?:exec|execSync)\\s*\\(`, 'g'));
    }
  }

  if (ext === '.py') {
    pushSignal(
      signals,
      content,
      filePath,
      'Dynamic eval()',
      'eval()/exec() with non-literal input enables arbitrary code execution.',
      'critical',
      'high',
      /\b(?:eval|exec)\s*\(\s*(?!['"][^'"\n]*['"]\s*\))[^)\n]+/g,
    );
    pushSignal(
      signals,
      content,
      filePath,
      'Command Injection',
      'Shell command execution with dynamic input may allow command injection.',
      'high',
      'medium',
      /\b(?:os\.system|subprocess\.(?:run|Popen|call|check_output|check_call))\s*\([^)]*(?:shell\s*=\s*True|f['"][^'"]*\{[^}]+\}|['"][^'"]*['"]\s*\+|format\()/g,
    );
  }

  const deduped = new Map<string, DynamicExecutionSignal>();
  for (const signal of signals) {
    const key = `${signal.title}|${signal.line}`;
    if (!deduped.has(key)) deduped.set(key, signal);
  }
  return Array.from(deduped.values());
}

export function hasDynamicCommandExecutionSignal(filePath: string, content: string): boolean {
  return detectDynamicExecutionSignals(filePath, content).some((signal) => signal.title === 'Command Injection');
}
