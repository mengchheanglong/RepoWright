export type PathScope = 'production' | 'test' | 'generated' | 'vendor' | 'build' | 'docs';

function normalizeFilePath(fp: string): string {
  return fp.replace(/\\/g, '/').toLowerCase();
}

export function classifyPathScope(fp: string): PathScope {
  const p = normalizeFilePath(fp);

  if (/(^|\/)(docs?|examples?)\//.test(p) || /\.(md|rst|adoc)$/.test(p)) return 'docs';
  if (/(^|\/)node_modules\//.test(p) || /(^|\/)vendor\//.test(p) || /(^|\/)third_party\//.test(p) || /(^|\/)third-party\//.test(p) || /(^|\/)3rdparty\//.test(p) || /(^|\/)extern\//.test(p) || /(^|\/)external\//.test(p) || /(^|\/)deps\//.test(p)) return 'vendor';
  if (/(^|\/)dist\//.test(p) || /(^|\/)build\//.test(p) || /(^|\/)coverage\//.test(p) || /(^|\/)\.next\//.test(p) || /(^|\/)target\//.test(p)) return 'build';
  if (/(^|\/)(generated|gen|__generated__)\//.test(p) || /\.(min|bundle)\.(js|css)$/.test(p)) return 'generated';
  if (/(^|\/)(test|tests|__tests__|spec|specs|fixtures?|mocks?|samples?)\//.test(p) || /(\.test\.|\.spec\.)/.test(p)) return 'test';

  return 'production';
}

export function isActionableCodePath(fp: string): boolean {
  return classifyPathScope(fp) === 'production';
}

export function summarizePathScopes(filePaths: string[]): Record<PathScope, number> {
  const summary: Record<PathScope, number> = {
    production: 0,
    test: 0,
    generated: 0,
    vendor: 0,
    build: 0,
    docs: 0,
  };
  for (const fp of filePaths) {
    summary[classifyPathScope(fp)]++;
  }
  return summary;
}

export function isLikelyPlaceholderSecret(_keyName: string, value: string, fp: string): boolean {
  const val = value.toLowerCase();
  const p = normalizeFilePath(fp);

  if (/(example|sample|dummy|test|mock|placeholder|changeme|your[_-]|insert[_-]|xxx|fake|todo|fixme|replace[_-]?me|fill[_-]?in)/.test(val)) return true;
  if (/(example|sample|template|fixture|mock|test|docstring)/.test(p)) return true;
  if (/[x*]{4,}/.test(value)) return true;
  // Matches like "sk-xxx", "jina_xxx", "your-api-key", "CHANGE_ME", "..."
  if (/^[a-z]{2,5}[-_][x*]{2,}$/i.test(value)) return true;
  if (/\.{3,}/.test(value)) return true;
  return false;
}
