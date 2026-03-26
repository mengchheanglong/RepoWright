import type { ConfigAnalysis } from '../../domain/index.js';

export function analyzeConfigs(
  tsconfigJson: Record<string, unknown> | null,
  packageJson: Record<string, unknown> | null,
  pyprojectToml: string | null,
  goMod: string | null,
  cargoToml: string | null,
  gemfile: string | null,
  requirementsTxt: string | null,
): ConfigAnalysis {
  const result: ConfigAnalysis = {};

  if (tsconfigJson) {
    const co = (tsconfigJson.compilerOptions ?? {}) as Record<string, unknown>;
    const issues: string[] = [];
    const strict = co.strict === true;
    if (!strict) issues.push('strict mode is disabled — enables many implicit-any and null-safety checks');
    if (!co.noUncheckedIndexedAccess) issues.push('noUncheckedIndexedAccess is off — array/object access can return undefined silently');
    if (co.skipLibCheck === true) issues.push('skipLibCheck is true — type errors in dependencies are hidden');
    if (!co.forceConsistentCasingInFileNames) issues.push('forceConsistentCasingInFileNames is off — can cause cross-platform build failures');

    result.typescript = {
      strict,
      target: String(co.target ?? 'unknown'),
      module: String(co.module ?? co.moduleResolution ?? 'unknown'),
      issues,
    };
  }

  if (packageJson) {
    const deps = Object.keys((packageJson.dependencies as Record<string, string>) ?? {});
    const devDeps = Object.keys((packageJson.devDependencies as Record<string, string>) ?? {});
    result.depCount = { production: deps.length, dev: devDeps.length };

    const pm = packageJson.packageManager as string | undefined;
    if (pm) result.packageManager = pm;
    else if (packageJson.engines && typeof (packageJson.engines as Record<string, string>).node === 'string') {
      result.nodeVersion = (packageJson.engines as Record<string, string>).node;
    }

    const scripts = packageJson.scripts as Record<string, string> | undefined;
    if (scripts) {
      result.scripts = Object.entries(scripts)
        .filter(([name]) => ['start', 'dev', 'build', 'test', 'lint', 'format', 'deploy'].includes(name))
        .map(([name, command]) => ({ name, command }));
    }
  }

  if (pyprojectToml || requirementsTxt) {
    const issues: string[] = [];
    const packages: string[] = [];
    let version: string | undefined;
    let buildSystem: string | undefined;

    if (pyprojectToml) {
      const vMatch = pyprojectToml.match(/requires-python\s*=\s*"([^"]+)"/);
      if (vMatch?.[1]) version = vMatch[1];

      const bsMatch = pyprojectToml.match(/\[build-system\][\s\S]*?requires\s*=\s*\[([\s\S]*?)\]/);
      if (bsMatch?.[1]) {
        const bs = bsMatch[1];
        if (bs.includes('setuptools')) buildSystem = 'setuptools';
        else if (bs.includes('poetry')) buildSystem = 'poetry';
        else if (bs.includes('hatchling')) buildSystem = 'hatch';
        else if (bs.includes('flit')) buildSystem = 'flit';
        else if (bs.includes('maturin')) buildSystem = 'maturin';
      }

      // Match dependencies as a TOML table: [project.dependencies] or [dependencies]
      const depTableMatch = pyprojectToml.match(/\[(?:project\.)?dependencies\]\s*\n([\s\S]*?)(?:\n\[|\n\n|$)/);
      if (depTableMatch?.[1]) {
        for (const line of depTableMatch[1].split('\n')) {
          const pkg = line.match(/^\s*["']?([\w-]+)/);
          if (pkg?.[1]) packages.push(pkg[1]);
        }
      }
      // Also match dependencies as an inline array: dependencies = ["pkg>=1.0", ...]
      const depArrayMatch = pyprojectToml.match(/^dependencies\s*=\s*\[([\s\S]*?)\]/m);
      if (depArrayMatch?.[1]) {
        for (const m of depArrayMatch[1].matchAll(/["']([\w][\w-]*)/g)) {
          if (m[1]) packages.push(m[1]);
        }
      }
      // Also check optional-dependencies sections
      for (const m of pyprojectToml.matchAll(/\[project\.optional-dependencies\.\w+\]\s*\n([\s\S]*?)(?:\n\[|\n\n|$)/g)) {
        if (m[1]) {
          for (const line of m[1].split('\n')) {
            const pkg = line.match(/^\s*["']?([\w-]+)/);
            if (pkg?.[1] && !packages.includes(pkg[1])) packages.push(pkg[1]);
          }
        }
      }

      if (!version) issues.push('No requires-python specified — users may run incompatible Python versions');
      if (!buildSystem) issues.push('No build system declared in pyproject.toml');
    }

    if (requirementsTxt) {
      for (const line of requirementsTxt.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('-')) {
          const pkg = trimmed.match(/^([\w-]+)/);
          if (pkg?.[1]) packages.push(pkg[1]);
        }
      }
    }

    result.python = { version, buildSystem, packages: packages.slice(0, 30), issues };
  }

  if (goMod) {
    const issues: string[] = [];
    const vMatch = goMod.match(/^go\s+(\S+)/m);
    const version = vMatch?.[1];
    const modMatch = goMod.match(/^module\s+(\S+)/m);
    const modulePath = modMatch?.[1];
    const reqMatches = goMod.match(/^\s+\S+\s+v[\d.]+/gm);
    const dependencies = reqMatches?.length ?? 0;

    if (version) {
      const minor = Number.parseInt(version.split('.')[1] ?? '0', 10);
      if (minor < 21) issues.push(`Go ${version} is outdated — consider upgrading to 1.22+ for range-over-func and improved tooling`);
    }

    result.go = { version, modulePath, dependencies, issues };
  }

  if (cargoToml) {
    const issues: string[] = [];
    const edMatch = cargoToml.match(/edition\s*=\s*"(\d+)"/);
    const edition = edMatch?.[1];
    const nameMatch = cargoToml.match(/name\s*=\s*"([^"]+)"/);
    const name = nameMatch?.[1];

    // Count dependencies from [dependencies], [dev-dependencies], and [build-dependencies]
    let depLines = 0;
    for (const section of ['dependencies', 'dev-dependencies', 'build-dependencies']) {
      const depSection = cargoToml.match(new RegExp(`\\[${section}\\]([\\s\\S]*?)(?:\\n\\[|$)`));
      depLines += depSection?.[1]?.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('=')).length ?? 0;
    }
    // Also count inline table dependencies like `pkg = { version = "..." }`
    // and simple `pkg = "version"` entries
    // For workspace Cargo.toml, check [workspace.dependencies] too
    const workspaceDepSection = cargoToml.match(/\[workspace\.dependencies\]([\s\S]*?)(?:\n\[|$)/);
    depLines += workspaceDepSection?.[1]?.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('=')).length ?? 0;

    if (edition && Number.parseInt(edition, 10) < 2021) {
      issues.push(`Rust edition ${edition} — consider upgrading to 2021 or 2024 for latest features`);
    }

    result.rust = { edition, name, dependencies: depLines, issues };
  }

  if (gemfile) {
    const gems: string[] = [];
    let version: string | undefined;
    const vMatch = gemfile.match(/ruby\s+['"]([^'"]+)['"]/);
    if (vMatch?.[1]) version = vMatch[1];

    for (const m of gemfile.matchAll(/^\s*gem\s+['"]([^'"]+)['"]/gm)) {
      if (m[1]) gems.push(m[1]);
    }

    result.ruby = { version, gems: gems.slice(0, 30) };
  }

  return result;
}
