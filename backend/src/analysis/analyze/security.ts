import { isActionableCodePath, isLikelyPlaceholderSecret } from './scoping.js';
import { detectDynamicExecutionSignals } from './dangerous-execution.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SecurityFinding {
  type: 'secret' | 'vulnerability' | 'misconfiguration';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  filePath: string;
  line: number;
  pattern: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface SecurityReport {
  score: number; // 0-100
  findings: SecurityFinding[];
  summary: { critical: number; high: number; medium: number; low: number; info: number };
  hasSecurityPolicy: boolean;
  hasLockFile: boolean;
  secretsDetected: number;
  vulnerabilityPatterns: number;
}

// ---------------------------------------------------------------------------
// Secret-detection patterns
// ---------------------------------------------------------------------------

interface SecretPattern {
  name: string;
  regex: RegExp;
  severity: SecurityFinding['severity'];
  confidence: SecurityFinding['confidence'];
}

const SECRET_PATTERNS: SecretPattern[] = [
  // AWS keys
  { name: 'AWS Access Key', regex: /\b(A3T[A-Z0-9]|AKIA|ASIA|AROA)[A-Z0-9]{16}\b/, severity: 'critical', confidence: 'high' },
  // Private keys
  { name: 'Private Key', regex: /-----BEGIN\s+(?:RSA|EC|DSA|OPENSSH)\s+PRIVATE\s+KEY-----/, severity: 'critical', confidence: 'high' },
  // GitHub tokens
  { name: 'GitHub Token', regex: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}\b/, severity: 'critical', confidence: 'high' },
  // GitLab tokens
  { name: 'GitLab Token', regex: /\bglpat-[A-Za-z0-9\-_]{20,}\b/, severity: 'critical', confidence: 'high' },
  // Slack tokens
  { name: 'Slack Token', regex: /\bxox[bpors]-[A-Za-z0-9\-]{10,}\b/, severity: 'critical', confidence: 'high' },
  // Discord tokens
  { name: 'Discord Token', regex: /\b[MN][A-Za-z0-9]{23,}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}\b/, severity: 'critical', confidence: 'medium' },
  // JWT tokens
  { name: 'JWT Token', regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, severity: 'high', confidence: 'medium' },
  // Database connection strings
  { name: 'MongoDB Connection String', regex: /mongodb(?:\+srv)?:\/\/[^\s'"]{10,}/, severity: 'critical', confidence: 'high' },
  { name: 'PostgreSQL Connection String', regex: /postgres(?:ql)?:\/\/[^\s'"]{10,}/, severity: 'critical', confidence: 'high' },
  { name: 'MySQL Connection String', regex: /mysql:\/\/[^\s'"]{10,}/, severity: 'critical', confidence: 'high' },
  // Generic API key assignments
  {
    name: 'Generic API Key',
    regex: /\b(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?key|auth[_-]?token|client[_-]?secret)\b\s*[:=]\s*['"]([^'"]{12,})['"]/i,
    severity: 'high',
    confidence: 'medium',
  },
  // Hardcoded passwords
  {
    name: 'Hardcoded Password',
    regex: /\b(?:password|passwd|pwd)\b\s*[:=]\s*['"]([^'"]{8,})['"]/i,
    severity: 'high',
    confidence: 'medium',
  },
];

// ---------------------------------------------------------------------------
// Vulnerability-detection patterns
// ---------------------------------------------------------------------------

interface VulnPattern {
  name: string;
  regex: RegExp;
  severity: SecurityFinding['severity'];
  confidence: SecurityFinding['confidence'];
  description: string;
}

const VULN_PATTERNS: VulnPattern[] = [
  // SQL string concatenation
  {
    name: 'SQL Injection',
    regex: /(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+.*(?:\+\s*\w|\$\{)/i,
    severity: 'critical',
    confidence: 'medium',
    description: 'SQL query built with string concatenation or template literals is vulnerable to injection.',
  },
  // Path traversal
  {
    name: 'Path Traversal',
    regex: /(?:readFile|readFileSync|createReadStream|open)\s*\([^)]*(?:req\.|params\.|query\.|body\.)/,
    severity: 'high',
    confidence: 'medium',
    description: 'File operation uses user-supplied input without sanitisation, risking path traversal.',
  },
  // Insecure HTTP (non-localhost, non-internal, non-example)
  {
    name: 'Insecure HTTP',
    regex: /['"]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|::1|10\.\d|172\.\d|192\.168\.|host\.docker\.internal|example\.com|schema\.org|www\.w3\.org)[^'"]+['"]/,
    severity: 'medium',
    confidence: 'low',
    description: 'HTTP used instead of HTTPS for a non-localhost URL.',
  },
  // Disabled SSL verification
  {
    name: 'SSL Verification Disabled',
    regex: /(?:rejectUnauthorized\s*:\s*false|verify\s*=\s*False|CURLOPT_SSL_VERIFYPEER\s*,\s*(?:false|0)|InsecureSkipVerify\s*:\s*true|NODE_TLS_REJECT_UNAUTHORIZED.*['"]0['"])/,
    severity: 'high',
    confidence: 'high',
    description: 'SSL/TLS certificate verification is disabled, enabling man-in-the-middle attacks.',
  },
  // Weak crypto
  {
    name: 'Weak Cryptographic Hash',
    regex: /(?:createHash\s*\(\s*['"](?:md5|sha1)['"]|hashlib\.(?:md5|sha1)\s*\(|MessageDigest\.getInstance\s*\(\s*['"](?:MD5|SHA-1)['"])/,
    severity: 'low',
    confidence: 'medium',
    description: 'MD5 or SHA1 detected. Not suitable for security-sensitive operations (use SHA-256+), but acceptable for content fingerprinting or checksums.',
  },
  // Unsafe deserialization
  {
    name: 'Unsafe Deserialization (pickle)',
    regex: /pickle\.loads?\s*\(/,
    severity: 'high',
    confidence: 'high',
    description: 'pickle.load(s) can execute arbitrary code during deserialization.',
  },
  {
    name: 'Unsafe YAML Load',
    regex: /yaml\.load\s*\([^)]*(?!\bLoader\s*=\s*(?:Safe|CSafe)Loader\b)[^)]*\)/,
    severity: 'high',
    confidence: 'medium',
    description: 'yaml.load without SafeLoader can execute arbitrary code.',
  },
  // innerHTML / dangerouslySetInnerHTML with dynamic content
  // Exclude clearing (innerHTML = "" or '') and static HTML assignments
  {
    name: 'Unsafe innerHTML',
    regex: /\.innerHTML\s*=\s*(?!['"](?:<|['"])\s*[;,\n]|['"]{2})/,
    severity: 'medium',
    confidence: 'medium',
    description: 'Setting innerHTML with dynamic content risks cross-site scripting (XSS).',
  },
  {
    name: 'dangerouslySetInnerHTML',
    regex: /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:/,
    severity: 'medium',
    confidence: 'medium',
    description: 'dangerouslySetInnerHTML with dynamic content risks XSS.',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LOCK_FILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'Pipfile.lock',
  'poetry.lock',
  'uv.lock',
  'Cargo.lock',
  'Gemfile.lock',
  'go.sum',
  'composer.lock',
]);

function getLineNumber(content: string, matchIndex: number): number {
  let line = 1;
  for (let i = 0; i < matchIndex && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

function looksLikeEnvFile(fp: string): boolean {
  const lower = fp.toLowerCase();
  return lower.includes('.env') || lower.endsWith('.env.local') || lower.endsWith('.env.example');
}

function isBuildScript(fp: string): boolean {
  const lower = fp.toLowerCase();
  return lower.endsWith('setup.py') || lower.endsWith('setup.cfg') ||
    lower.includes('makefile') || lower.endsWith('build.py') ||
    lower.endsWith('configure.py') || lower.includes('build_support/');
}

function isLikelyPatternDefinitionContext(content: string, matchIndex: number): boolean {
  const start = Math.max(0, matchIndex - 100);
  const end = Math.min(content.length, matchIndex + 40);
  const window = content.slice(start, end);
  const lineStart = content.lastIndexOf('\n', matchIndex) + 1;
  const lineEnd = content.indexOf('\n', matchIndex);
  const line = content.slice(lineStart, lineEnd >= 0 ? lineEnd : content.length);
  return /(?:regex|pattern|title|description)\s*:\s*(?:\/|['"])|new\s+RegExp\s*\(|=\s*\/.+\/[dgimsuy]*\.exec\s*\(|\.match(All)?\s*\(\s*\/|const\s+\w+\s*=\s*\/.+\/[dgimsuy]*/i.test(window) ||
    /const\s+\w+\s*=\s*\/.+\/[dgimsuy]*/i.test(line);
}

/**
 * Check if a match index falls inside a Python docstring (triple-quoted block)
 * or a comment line. This avoids false positives on documented examples.
 */
function isInsideDocstringOrComment(content: string, matchIndex: number, fp: string): boolean {
  const ext = fp.split('.').pop()?.toLowerCase() ?? '';

  // For Python files, check if match is within triple-quoted strings
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
      } else {
        if (content.slice(i, i + 3) === tripleChar) {
          inTriple = false;
          i += 3;
          continue;
        }
      }
      i++;
    }
    if (inTriple) return true;
  }

  // Check if the match is on a comment line
  const lineStart = content.lastIndexOf('\n', matchIndex) + 1;
  const lineContent = content.slice(lineStart, matchIndex).trim();
  if (ext === 'py' && lineContent.startsWith('#')) return true;
  if (['js', 'ts', 'jsx', 'tsx', 'go', 'rs', 'java'].includes(ext) && lineContent.startsWith('//')) return true;
  // Inside a block comment line (starts with *)
  if (lineContent.startsWith('*') || lineContent.startsWith('/*')) return true;
  // Lines starting with ">>>" are Python doctest examples
  if (lineContent.startsWith('>>>') || lineContent.startsWith('...')) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Core scanning functions
// ---------------------------------------------------------------------------

function scanSecrets(files: Map<string, string>): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  for (const [fp, content] of files) {
    if (!isActionableCodePath(fp)) continue;
    if (looksLikeEnvFile(fp)) continue;

    for (const pat of SECRET_PATTERNS) {
      const global = new RegExp(pat.regex.source, pat.regex.flags + (pat.regex.flags.includes('g') ? '' : 'g'));
      let match: RegExpExecArray | null;
      while ((match = global.exec(content)) !== null) {
        // For patterns that capture a value, filter placeholders
        const capturedValue = match[1] ?? match[0];
        const keyGuess = pat.name.toLowerCase().replace(/\s+/g, '_');
        if (isLikelyPlaceholderSecret(keyGuess, capturedValue, fp)) continue;
        // Skip matches inside docstrings, comments, or doctest examples
        if (isInsideDocstringOrComment(content, match.index, fp)) continue;

        findings.push({
          type: 'secret',
          severity: pat.severity,
          title: pat.name,
          description: `Potential ${pat.name.toLowerCase()} detected in source code.`,
          filePath: fp,
          line: getLineNumber(content, match.index),
          pattern: pat.regex.source.slice(0, 60),
          confidence: pat.confidence,
        });
      }
    }
  }

  return findings;
}

function scanVulnerabilities(files: Map<string, string>): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  for (const [fp, content] of files) {
    if (!isActionableCodePath(fp)) continue;

    for (const signal of detectDynamicExecutionSignals(fp, content)) {
      findings.push({
        type: 'vulnerability',
        severity: signal.severity,
        title: signal.title,
        description: signal.description,
        filePath: fp,
        line: signal.line,
        pattern: signal.title,
        confidence: signal.confidence,
      });
    }

    for (const pat of VULN_PATTERNS) {
      // Skip command injection checks in build scripts (setup.py, Makefile, etc.)
      if (pat.name.includes('Command Injection') && isBuildScript(fp)) continue;

      const global = new RegExp(pat.regex.source, pat.regex.flags + (pat.regex.flags.includes('g') ? '' : 'g'));
      let match: RegExpExecArray | null;
      while ((match = global.exec(content)) !== null) {
        // Skip matches inside docstrings or comments
        if (isInsideDocstringOrComment(content, match.index, fp)) continue;
        // Skip matches that appear in detector pattern definitions
        if (isLikelyPatternDefinitionContext(content, match.index)) continue;

        findings.push({
          type: 'vulnerability',
          severity: pat.severity,
          title: pat.name,
          description: pat.description,
          filePath: fp,
          line: getLineNumber(content, match.index),
          pattern: pat.regex.source.slice(0, 60),
          confidence: pat.confidence,
        });
      }
    }
  }

  return findings;
}

function scanMisconfigurations(files: Map<string, string>, fileList: string[]): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  // Check for HTTPS enforcement in production configs
  for (const [fp, content] of files) {
    if (!isActionableCodePath(fp)) continue;
    const insecureCookieMatch = /secure\s*:\s*false/i.exec(content);
    if (insecureCookieMatch && /cookie/i.test(content) && !isInsideDocstringOrComment(content, insecureCookieMatch.index, fp) && !isLikelyPatternDefinitionContext(content, insecureCookieMatch.index)) {
      findings.push({
        type: 'misconfiguration',
        severity: 'medium',
        title: 'Insecure Cookie',
        description: 'Cookie secure flag is set to false; cookies may be sent over unencrypted connections.',
        filePath: fp,
        line: getLineNumber(content, insecureCookieMatch.index),
        pattern: 'secure: false',
        confidence: 'medium',
      });
    }

    // CORS wildcard detection for JS/TS and Python/FastAPI.
    const corsRegex = /setHeader\s*\(\s*['"]Access-Control-Allow-Origin['"]\s*,\s*['"]\*['"]\s*\)|Access-Control-Allow-Origin['"]?\s*,\s*['"]\*['"]|cors\s*\(\s*\{[\s\S]{0,160}?origin\s*:\s*['"]\*['"]|cors_origins.*\["?\*"?\]|allow_origins.*\["?\*"?\]|CORSMiddleware.*allow_origins.*\*/i;
    const corsMatch = corsRegex.exec(content);
    if (corsMatch && !isInsideDocstringOrComment(content, corsMatch.index, fp) && !isLikelyPatternDefinitionContext(content, corsMatch.index)) {
      findings.push({
        type: 'misconfiguration',
        severity: 'medium',
        title: 'CORS Wildcard Origin',
        description: 'CORS is configured to allow all origins (*). Restrict to specific trusted origins in production.',
        filePath: fp,
        line: getLineNumber(content, corsMatch.index),
        pattern: 'cors_origins: ["*"]',
        confidence: 'medium',
      });
    }

    // Helmet / security headers missing check (Express)
    if (/express\(\)/.test(content) && !/helmet/i.test(content) && /app\.(use|get|post|listen)/.test(content)) {
      findings.push({
        type: 'misconfiguration',
        severity: 'low',
        title: 'Missing Security Headers',
        description: 'Express app detected without helmet middleware for security headers.',
        filePath: fp,
        line: 1,
        pattern: 'express() without helmet',
        confidence: 'low',
      });
    }

    // Debug mode enabled
    const debugMatch = /DEBUG\s*[:=]\s*(?:true|1|['"](?:\*|true)['"])/i.exec(content);
    if (debugMatch && !fp.includes('.env.example') && !isInsideDocstringOrComment(content, debugMatch.index, fp) && !isLikelyPatternDefinitionContext(content, debugMatch.index)) {
      findings.push({
        type: 'misconfiguration',
        severity: 'low',
        title: 'Debug Mode Enabled',
        description: 'Debug mode appears to be enabled in a production-scoped file.',
        filePath: fp,
        line: getLineNumber(content, debugMatch.index),
        pattern: 'DEBUG = true',
        confidence: 'low',
      });
    }
  }

  // Check for .env files committed (present in file list)
  for (const fp of fileList) {
    const base = fp.split(/[\\/]/).pop() ?? '';
    if (/^\.env(?:\.(?:production|staging|local))?$/.test(base) && !base.includes('example')) {
      findings.push({
        type: 'misconfiguration',
        severity: 'high',
        title: 'Environment File in Repository',
        description: 'A .env file is tracked in the repository. Secrets in this file may be exposed.',
        filePath: fp,
        line: 1,
        pattern: '.env file',
        confidence: 'high',
      });
    }
  }

  return findings;
}

function normalizeFindingTitle(title: string): string {
  if (title === 'Command Injection (exec/spawn)' || title === 'Dynamic exec()') return 'Command Injection';
  return title;
}

function applyContextSuppressions(findings: SecurityFinding[], fileList: string[]): SecurityFinding[] {
  const actionableFileCount = fileList.filter((fp) => isActionableCodePath(fp)).length;
  const hasExplicitProdSignal = fileList.some((fp) =>
    /dockerfile|docker-compose|compose\.ya?ml|k8s|helm|terraform|\.github[\\/]workflows/i.test(fp.toLowerCase()),
  );

  return findings.filter((finding) => {
    if (finding.title === 'Missing Security Headers' && actionableFileCount <= 12 && !hasExplicitProdSignal) return false;
    return true;
  });
}

function normalizeAndDedupeFindings(findings: SecurityFinding[]): SecurityFinding[] {
  const merged = new Map<string, SecurityFinding>();
  for (const finding of findings) {
    const normalized: SecurityFinding = { ...finding, title: normalizeFindingTitle(finding.title) };
    const key = `${normalized.type}|${normalized.title}|${normalized.filePath}|${normalized.line}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, normalized);
      continue;
    }
    const severityRank: Record<SecurityFinding['severity'], number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
    if (severityRank[normalized.severity] > severityRank[existing.severity]) {
      merged.set(key, normalized);
    }
  }
  return Array.from(merged.values());
}

// ---------------------------------------------------------------------------
// Score computation
// ---------------------------------------------------------------------------

const SEVERITY_WEIGHTS: Record<SecurityFinding['severity'], number> = {
  critical: 15,
  high: 8,
  medium: 4,
  low: 1,
  info: 0,
};

function computeScore(
  findings: SecurityFinding[],
  hasSecurityPolicy: boolean,
  hasLockFile: boolean,
): number {
  let score = 100;

  // Penalty per finding (weighted by severity)
  for (const f of findings) {
    if (f.type === 'secret') {
      // Secrets carry extra penalty
      score -= SEVERITY_WEIGHTS[f.severity] * 1.5;
    } else {
      score -= SEVERITY_WEIGHTS[f.severity];
    }
  }

  // Bonus / penalty for project-level signals
  if (!hasSecurityPolicy) score -= 5;
  if (!hasLockFile) score -= 5;
  if (hasSecurityPolicy) score += 2;
  if (hasLockFile) score += 2;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function scanSecurity(files: Map<string, string>, fileList: string[], allFileList?: string[]): SecurityReport {
  const secretFindings = scanSecrets(files);
  const vulnFindings = scanVulnerabilities(files);
  const miscFindings = scanMisconfigurations(files, fileList);
  const rawFindings = [...secretFindings, ...vulnFindings, ...miscFindings];
  const findings = normalizeAndDedupeFindings(applyContextSuppressions(rawFindings, fileList));

  // Use allFileList for project-level checks (SECURITY.md, lock files) since these
  // can exist in any scope (docs, root, .github/) — not just production code
  const policyCheckList = allFileList ?? fileList;
  const lowerList = policyCheckList.map((f) => f.toLowerCase());
  const hasSecurityPolicy = lowerList.some(
    (f) => f === 'security.md' || f.endsWith('/security.md') || f.endsWith('\\security.md') || f === '.github/security.md' || f === '.github\\security.md',
  );
  const hasLockFile = policyCheckList.some((f) => {
    const base = f.split(/[\\/]/).pop() ?? '';
    return LOCK_FILES.has(base);
  });

  const summary = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) {
    summary[f.severity]++;
  }

  return {
    score: computeScore(findings, hasSecurityPolicy, hasLockFile),
    findings,
    summary,
    hasSecurityPolicy,
    hasLockFile,
    secretsDetected: secretFindings.length,
    vulnerabilityPatterns: vulnFindings.length,
  };
}
