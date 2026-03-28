import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { DepAuditReport, DepVulnerability } from '../../domain/index.js';
import { getLogger } from '../../utils/logger.js';

/**
 * Run dependency vulnerability scanning using ecosystem-native tools.
 * Detects the package ecosystem and invokes the appropriate audit command.
 * Falls back gracefully if tools are not available.
 */
export function auditDependencies(repoPath: string): DepAuditReport | null {
  const logger = getLogger();

  // Try npm audit
  if (fs.existsSync(path.join(repoPath, 'package-lock.json')) ||
      fs.existsSync(path.join(repoPath, 'yarn.lock')) ||
      fs.existsSync(path.join(repoPath, 'pnpm-lock.yaml'))) {
    const result = tryNpmAudit(repoPath);
    if (result) {
      logger.info(`Dependency audit found ${result.totalVulnerabilities} vulnerability(ies)`);
      return result;
    }
  }

  // Try pip-audit for Python
  if (fs.existsSync(path.join(repoPath, 'requirements.txt')) ||
      fs.existsSync(path.join(repoPath, 'Pipfile.lock')) ||
      fs.existsSync(path.join(repoPath, 'poetry.lock'))) {
    const result = tryPipAudit(repoPath);
    if (result) {
      logger.info(`Dependency audit found ${result.totalVulnerabilities} vulnerability(ies)`);
      return result;
    }
  }

  // Try cargo audit for Rust
  if (fs.existsSync(path.join(repoPath, 'Cargo.lock'))) {
    const result = tryCargoAudit(repoPath);
    if (result) {
      logger.info(`Dependency audit found ${result.totalVulnerabilities} vulnerability(ies)`);
      return result;
    }
  }

  return null;
}

function tryNpmAudit(repoPath: string): DepAuditReport | null {
  try {
    // npm audit returns non-zero when vulnerabilities exist, so we handle that
    const raw = execSync('npm audit --json', {
      cwd: repoPath,
      stdio: 'pipe',
      timeout: 30000,
      maxBuffer: 5 * 1024 * 1024,
    }).toString();
    return parseNpmAuditOutput(raw);
  } catch (err: unknown) {
    // npm audit exits with non-zero when vulns are found — still has valid JSON
    if (err && typeof err === 'object' && 'stdout' in err) {
      const stdout = (err as { stdout: Buffer }).stdout?.toString();
      if (stdout) return parseNpmAuditOutput(stdout);
    }
    return null;
  }
}

function parseNpmAuditOutput(raw: string): DepAuditReport | null {
  try {
    const data = JSON.parse(raw);
    const vulns: DepVulnerability[] = [];
    let critical = 0;
    let high = 0;
    let moderate = 0;

    // npm audit v2 format
    if (data.vulnerabilities && typeof data.vulnerabilities === 'object') {
      for (const [pkg, info] of Object.entries(data.vulnerabilities)) {
        const v = info as Record<string, unknown>;
        const severity = normalizeSeverity(v.severity as string);
        if (severity === 'critical') critical++;
        else if (severity === 'high') high++;
        else if (severity === 'moderate') moderate++;
        vulns.push({
          package: pkg,
          severity,
          title: (v.title as string) ?? `Vulnerability in ${pkg}`,
          url: (v.url as string) ?? undefined,
          fixAvailable: Boolean(v.fixAvailable),
        });
      }
    }

    // npm audit v1 format (advisories)
    if (data.advisories && typeof data.advisories === 'object') {
      for (const [, info] of Object.entries(data.advisories)) {
        const a = info as Record<string, unknown>;
        const severity = normalizeSeverity(a.severity as string);
        if (severity === 'critical') critical++;
        else if (severity === 'high') high++;
        else if (severity === 'moderate') moderate++;
        vulns.push({
          package: (a.module_name as string) ?? 'unknown',
          severity,
          title: (a.title as string) ?? 'Unknown vulnerability',
          url: (a.url as string) ?? undefined,
          fixAvailable: Boolean(a.patched_versions && a.patched_versions !== '<0.0.0'),
        });
      }
    }

    return {
      vulnerabilities: vulns.slice(0, 50),
      totalVulnerabilities: vulns.length,
      criticalCount: critical,
      highCount: high,
      moderateCount: moderate,
      auditSource: 'npm audit',
    };
  } catch {
    return null;
  }
}

function tryPipAudit(repoPath: string): DepAuditReport | null {
  try {
    const raw = execSync('pip-audit --format json', {
      cwd: repoPath,
      stdio: 'pipe',
      timeout: 60000,
      maxBuffer: 5 * 1024 * 1024,
    }).toString();
    return parsePipAuditOutput(raw);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'stdout' in err) {
      const stdout = (err as { stdout: Buffer }).stdout?.toString();
      if (stdout) return parsePipAuditOutput(stdout);
    }
    return null;
  }
}

function parsePipAuditOutput(raw: string): DepAuditReport | null {
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data.dependencies)) return null;

    const vulns: DepVulnerability[] = [];
    let critical = 0;
    let high = 0;
    let moderate = 0;

    for (const dep of data.dependencies) {
      if (!dep.vulns || dep.vulns.length === 0) continue;
      for (const vuln of dep.vulns) {
        const severity = normalizeSeverity(vuln.fix_versions?.length > 0 ? 'high' : 'moderate');
        if (severity === 'critical') critical++;
        else if (severity === 'high') high++;
        else if (severity === 'moderate') moderate++;
        vulns.push({
          package: dep.name ?? 'unknown',
          severity,
          title: vuln.id ?? 'Unknown vulnerability',
          url: vuln.description ?? undefined,
          fixAvailable: Array.isArray(vuln.fix_versions) && vuln.fix_versions.length > 0,
        });
      }
    }

    return {
      vulnerabilities: vulns.slice(0, 50),
      totalVulnerabilities: vulns.length,
      criticalCount: critical,
      highCount: high,
      moderateCount: moderate,
      auditSource: 'pip-audit',
    };
  } catch {
    return null;
  }
}

function tryCargoAudit(repoPath: string): DepAuditReport | null {
  try {
    const raw = execSync('cargo audit --json', {
      cwd: repoPath,
      stdio: 'pipe',
      timeout: 30000,
      maxBuffer: 5 * 1024 * 1024,
    }).toString();
    return parseCargoAuditOutput(raw);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'stdout' in err) {
      const stdout = (err as { stdout: Buffer }).stdout?.toString();
      if (stdout) return parseCargoAuditOutput(stdout);
    }
    return null;
  }
}

function parseCargoAuditOutput(raw: string): DepAuditReport | null {
  try {
    const data = JSON.parse(raw);
    const vulns: DepVulnerability[] = [];
    let critical = 0;
    let high = 0;
    let moderate = 0;

    if (data.vulnerabilities?.list) {
      for (const v of data.vulnerabilities.list) {
        const advisory = v.advisory ?? {};
        const severity = normalizeSeverity(advisory.cvss ?? 'moderate');
        if (severity === 'critical') critical++;
        else if (severity === 'high') high++;
        else if (severity === 'moderate') moderate++;
        vulns.push({
          package: (v.package?.name as string) ?? 'unknown',
          severity,
          title: (advisory.title as string) ?? 'Unknown vulnerability',
          url: (advisory.url as string) ?? undefined,
          fixAvailable: Boolean(v.versions?.patched?.length > 0),
        });
      }
    }

    return {
      vulnerabilities: vulns.slice(0, 50),
      totalVulnerabilities: vulns.length,
      criticalCount: critical,
      highCount: high,
      moderateCount: moderate,
      auditSource: 'cargo audit',
    };
  } catch {
    return null;
  }
}

function normalizeSeverity(
  raw: string,
): 'critical' | 'high' | 'moderate' | 'low' | 'info' {
  const lower = (raw ?? '').toLowerCase();
  if (lower === 'critical') return 'critical';
  if (lower === 'high') return 'high';
  if (lower === 'moderate' || lower === 'medium') return 'moderate';
  if (lower === 'low') return 'low';
  return 'info';
}
