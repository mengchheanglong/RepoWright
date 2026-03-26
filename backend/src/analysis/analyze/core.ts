import path from 'node:path';
import type { WorkClassification } from '../../domain/index.js';

export const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript',
  '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
  '.py': 'Python', '.go': 'Go', '.rs': 'Rust', '.java': 'Java', '.rb': 'Ruby',
  '.c': 'C', '.cpp': 'C++', '.cc': 'C++', '.cxx': 'C++', '.hpp': 'C++', '.h': 'C/C++', '.cs': 'C#', '.php': 'PHP',
  '.swift': 'Swift', '.kt': 'Kotlin', '.dart': 'Dart', '.lua': 'Lua',
  '.md': 'Markdown', '.json': 'JSON', '.yaml': 'YAML', '.yml': 'YAML',
  '.toml': 'TOML', '.sh': 'Shell', '.bash': 'Shell', '.sql': 'SQL',
  '.html': 'HTML', '.css': 'CSS', '.scss': 'SCSS', '.less': 'Less',
  '.graphql': 'GraphQL', '.gql': 'GraphQL', '.proto': 'Protocol Buffers',
  '.dockerfile': 'Dockerfile', '.tf': 'Terraform', '.hcl': 'HCL',
};

export const CODE_EXTENSIONS = new Set(
  Object.entries(LANGUAGE_MAP)
    .filter(([, lang]) => !['Markdown', 'JSON', 'YAML', 'TOML'].includes(lang))
    .map(([ext]) => ext),
);

const FRAMEWORK_PATTERNS: Record<string, { files: string[]; deps: string[] }> = {
  React: { files: [], deps: ['react', 'react-dom'] },
  'Next.js': { files: ['next.config.js', 'next.config.mjs', 'next.config.ts'], deps: ['next'] },
  Vue: { files: [], deps: ['vue'] },
  Nuxt: { files: ['nuxt.config.ts', 'nuxt.config.js'], deps: ['nuxt'] },
  Angular: { files: ['angular.json'], deps: ['@angular/core'] },
  Svelte: { files: [], deps: ['svelte'] },
  SvelteKit: { files: ['svelte.config.js'], deps: ['@sveltejs/kit'] },
  Express: { files: [], deps: ['express'] },
  Fastify: { files: [], deps: ['fastify'] },
  Hono: { files: [], deps: ['hono'] },
  NestJS: { files: [], deps: ['@nestjs/core'] },
  Django: { files: ['manage.py'], deps: ['django'] },
  Flask: { files: [], deps: ['flask'] },
  FastAPI: { files: [], deps: ['fastapi'] },
  'Spring Boot': { files: [], deps: ['spring-boot-starter'] },
  Rails: { files: ['Gemfile'], deps: ['rails'] },
  Gin: { files: [], deps: ['github.com/gin-gonic/gin'] },
  Actix: { files: [], deps: ['actix-web'] },
  Vite: { files: ['vite.config.ts', 'vite.config.js', 'vite.config.mjs'], deps: ['vite'] },
  Webpack: { files: ['webpack.config.js', 'webpack.config.ts'], deps: ['webpack'] },
  Drizzle: { files: [], deps: ['drizzle-orm'] },
  Prisma: { files: ['prisma/schema.prisma'], deps: ['@prisma/client'] },
  TypeORM: { files: [], deps: ['typeorm'] },
  Sequelize: { files: [], deps: ['sequelize'] },
  Tailwind: { files: ['tailwind.config.js', 'tailwind.config.ts'], deps: ['tailwindcss'] },
  Docker: { files: ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'], deps: [] },
  Electron: { files: [], deps: ['electron'] },
  'React Native': { files: [], deps: ['react-native'] },
  Storybook: { files: ['.storybook/main.js', '.storybook/main.ts'], deps: ['@storybook/react'] },
  Celery: { files: [], deps: ['celery'] },
  SQLAlchemy: { files: [], deps: ['sqlalchemy'] },
  Pydantic: { files: [], deps: ['pydantic'] },
  Pytest: { files: ['pytest.ini', 'conftest.py'], deps: ['pytest'] },
  Typer: { files: [], deps: ['typer'] },
  Click: { files: [], deps: ['click'] },
  Gradio: { files: [], deps: ['gradio'] },
  LiteLLM: { files: [], deps: ['litellm'] },
  Loguru: { files: [], deps: ['loguru'] },
  Alembic: { files: ['alembic.ini'], deps: ['alembic'] },
  Streamlit: { files: [], deps: ['streamlit'] },
  Echo: { files: [], deps: ['github.com/labstack/echo'] },
  Fiber: { files: [], deps: ['github.com/gofiber/fiber'] },
  GORM: { files: [], deps: ['gorm.io/gorm'] },
  'Chi Router': { files: [], deps: ['github.com/go-chi/chi'] },
  Axum: { files: [], deps: ['axum'] },
  Rocket: { files: [], deps: ['rocket'] },
  Tokio: { files: [], deps: ['tokio'] },
  Diesel: { files: [], deps: ['diesel'] },
  Serde: { files: [], deps: ['serde'] },
  Maven: { files: ['pom.xml'], deps: [] },
  Gradle: { files: ['build.gradle', 'build.gradle.kts'], deps: [] },
  Vitest: { files: ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mts'], deps: ['vitest'] },
  Jest: { files: ['jest.config.js', 'jest.config.ts', 'jest.config.mjs'], deps: ['jest'] },
  GraphQL: { files: [], deps: ['graphql', 'juniper', 'async-graphql', 'graphene'] },
  gRPC: { files: [], deps: ['grpc', '@grpc/grpc-js', 'tonic', 'google.golang.org/grpc'] },
  Jinja2: { files: [], deps: ['jinja2', 'Jinja2'] },
  APScheduler: { files: [], deps: ['apscheduler', 'APScheduler'] },
  httpx: { files: [], deps: ['httpx'] },
  Clap: { files: [], deps: ['clap'] },
  Reqwest: { files: [], deps: ['reqwest'] },
  Ratatui: { files: [], deps: ['ratatui'] },
  Helm: { files: ['Chart.yaml'], deps: [] },
  CMake: { files: ['CMakeLists.txt'], deps: [] },
};

function hasThreshold(contents: Map<string, string>, tester: (c: string) => boolean, minHits = 3, minRatio = 0.05): boolean {
  if (contents.size === 0) return false;
  let hits = 0;
  for (const c of contents.values()) {
    if (tester(c)) hits++;
  }
  if (contents.size <= 5) return hits >= 1;
  return hits >= minHits || (hits / contents.size) >= minRatio;
}

const PATTERN_INDICATORS: Record<string, (files: string[], contents: Map<string, string>) => boolean> = {
  'MVC Pattern': (files) =>
    files.filter((f) => f.includes('controller')).length >= 2 &&
    files.filter((f) => f.includes('model')).length >= 2 &&
    files.filter((f) => f.includes('view')).length >= 2,
  'Repository Pattern': (_files, contents) => hasThreshold(contents, (c) => /class\s+\w*Repository/i.test(c)),
  'Service Layer': (files) => files.filter((f) => /[\\/]services?[\\/]/i.test(f)).length >= Math.min(files.length * 0.05, 3),
  'Middleware Chain': (_files, contents) => hasThreshold(contents, (c) => /app\.use\(/i.test(c)),
  'Event-Driven': (_files, contents) => hasThreshold(contents, (c) => /\.on\(|\.emit\(|EventEmitter|addEventListener/i.test(c)),
  'CLI Architecture': (files) => files.some((f) => /[\\/]cli[\\/]|[\\/]commands?[\\/]/i.test(f)),
  'REST API': (_files, contents) => hasThreshold(contents, (c) => /app\.(get|post|put|delete|patch)\s*\(/i.test(c) || /@app\.(get|post|put|delete|patch)\s*\(/i.test(c) || /APIRouter|FastAPI\(\)/i.test(c)),
  GraphQL: (_files, contents) => hasThreshold(contents, (c) => /typeDefs|resolvers|gql`|graphql/i.test(c)),
  'State Management': (_files, contents) => hasThreshold(contents, (c) => /useReducer|createStore|createSlice|zustand|recoil|jotai/i.test(c), 1, 0.01),
  Monorepo: (files) => files.some((f) => f === 'pnpm-workspace.yaml' || f === 'lerna.json' || f === 'turbo.json'),
  'Plugin/Adapter Pattern': (_files, contents) => hasThreshold(contents, (c) => /interface\s+\w*Adapter|implements\s+\w*(Plugin|Adapter)/i.test(c)),
  'Domain-Driven Design': (files) => files.filter((f) => f.includes('domain')).length >= 3 && files.filter((f) => f.includes('entity') || f.includes('schemas')).length >= 3,
  CQRS: (files) => files.filter((f) => f.includes('command')).length >= 2 && files.filter((f) => f.includes('query')).length >= 2,
  'Pub/Sub': (_files, contents) => hasThreshold(contents, (c) => /publish|subscribe|channel|topic/i.test(c)),
  'Decorator Pattern': (_files, contents) => hasThreshold(contents, (c) => /@\w+\s*(?:\(|$)/m.test(c) && (c.includes('.py') || c.includes('class '))),
  'Actor Model': (_files, contents) => hasThreshold(contents, (c) => /(?:Actor|spawn|send_message|Mailbox|GenServer)/i.test(c)),
  'Builder Pattern': (_files, contents) => hasThreshold(contents, (c) => /\.build\(\)|Builder\b|\.with_\w+\(/i.test(c)),
  'Async/Concurrent': (_files, contents) => hasThreshold(contents, (c) => /tokio::spawn|goroutine|go\s+func|asyncio\.gather|Promise\.all|async\s+fn/i.test(c)),
};

export function detectLanguages(extensions: string[]): string[] {
  const langSet = new Set<string>();
  for (const ext of extensions) {
    const lang = LANGUAGE_MAP[ext];
    if (lang) langSet.add(lang);
  }
  return Array.from(langSet).sort();
}

export function getAllDependencies(packageJson: Record<string, unknown> | null): Set<string> {
  if (!packageJson) return new Set();
  const deps = new Set<string>();
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const section = packageJson[key] as Record<string, string> | undefined;
    if (section) {
      for (const name of Object.keys(section)) deps.add(name);
    }
  }
  return deps;
}

export function detectFrameworks(
  filePaths: string[],
  packageJson: Record<string, unknown> | null,
  nestedPkgs: Record<string, unknown>[],
  pyprojectToml: string | null,
  goMod: string | null,
  cargoToml: string | null,
  gemfile: string | null,
  requirementsTxt: string | null,
  setupPy: string | null,
): string[] {
  const detected = new Set<string>();
  const allDeps = getAllDependencies(packageJson);
  for (const nested of nestedPkgs) {
    for (const d of getAllDependencies(nested)) allDeps.add(d);
  }
  const configText = [pyprojectToml, goMod, cargoToml, gemfile, requirementsTxt, setupPy].filter(Boolean).join('\n');

  for (const [fw, { files, deps }] of Object.entries(FRAMEWORK_PATTERNS)) {
    if (files.some((f) => filePaths.some((fp) => fp.endsWith(f) || fp === f))) {
      detected.add(fw);
      continue;
    }
    if (deps.some((d) => allDeps.has(d))) {
      detected.add(fw);
      continue;
    }
    if (deps.some((d) => configText.includes(d))) detected.add(fw);
  }

  // Directory-pattern-based frameworks
  if (filePaths.some((f) => /\.github[\\/]workflows[\\/]/i.test(f))) detected.add('GitHub Actions');

  return Array.from(detected).sort();
}

export function detectPatterns(filePaths: string[], fileContents: Map<string, string>): string[] {
  const detected: string[] = [];
  for (const [pattern, checker] of Object.entries(PATTERN_INDICATORS)) {
    if (checker(filePaths, fileContents)) detected.push(pattern);
  }
  return detected;
}

export function buildTechStack(
  languages: string[],
  frameworks: string[],
  packageJson: Record<string, unknown> | null,
  filePaths: string[],
): string[] {
  const stack = new Set<string>();
  for (const l of languages) stack.add(l);
  for (const fw of frameworks) stack.add(fw);

  if (packageJson) stack.add('Node.js');

  if (filePaths.some((f) => f.includes('vitest'))) stack.add('Vitest');
  if (filePaths.some((f) => f.includes('jest'))) stack.add('Jest');
  if (filePaths.some((f) => f.includes('biome'))) stack.add('Biome');
  if (filePaths.some((f) => f.includes('.eslintrc') || f.includes('eslint.config'))) stack.add('ESLint');
  if (filePaths.some((f) => f.includes('.prettierrc'))) stack.add('Prettier');
  if (filePaths.some((f) => /(?:^|[\\/])Dockerfile(?:\.\w+)?$/.test(f) || /(?:^|[\\/])(?:docker-)?compose\.ya?ml$/.test(f))) stack.add('Docker');
  if (filePaths.some((f) => f.includes('.github/workflows'))) stack.add('GitHub Actions');
  if (filePaths.some((f) => f.includes('.gitlab-ci'))) stack.add('GitLab CI');

  if (packageJson) {
    const deps = getAllDependencies(packageJson);
    if (deps.has('zod')) stack.add('Zod');
    if (deps.has('joi')) stack.add('Joi');
    if (deps.has('better-sqlite3')) stack.add('SQLite');
    if (deps.has('pg') || deps.has('postgres')) stack.add('PostgreSQL');
    if (deps.has('mysql2')) stack.add('MySQL');
    if (deps.has('redis') || deps.has('ioredis')) stack.add('Redis');
    if (deps.has('socket.io')) stack.add('Socket.IO');
    if (deps.has('ws')) stack.add('WebSocket');
  }

  return Array.from(stack).sort();
}

export function computeComplexity(
  fileCount: number,
  langCount: number,
  totalSize: number,
  funcCount: number,
  maxNesting: number,
  circularDeps: number,
): number {
  let score = 0;
  score += Math.min(fileCount / 50, 3);
  score += Math.min(langCount / 2, 1.5);
  score += Math.min(totalSize / (500 * 1024), 1.5);
  score += Math.min(funcCount / 100, 2);
  score += Math.min(maxNesting / 5, 1);
  score += Math.min(circularDeps * 0.5, 1);
  return Math.min(Math.round(score * 10) / 10, 10);
}

export function classifyText(text: string): WorkClassification {
  const lower = text.toLowerCase();
  if (lower.includes('bug') || lower.includes('fix') || lower.includes('error')) return 'bugfix';
  if (lower.includes('prototype') || lower.includes('build') || lower.includes('create')) return 'prototype';
  if (lower.includes('refactor') || lower.includes('architecture') || lower.includes('redesign')) return 'improve-architecture';
  if (lower.includes('learn') || lower.includes('study') || lower.includes('understand')) return 'learn';
  if (lower.includes('extract') || lower.includes('pattern') || lower.includes('reuse')) return 'extract-skill';
  return 'learn';
}

export function classifyProject(
  files: { path: string; extension: string }[],
  languages: string[],
  hasTests: boolean,
): WorkClassification {
  if (languages.length === 0) return 'learn';
  if (files.length > 150) return 'extract-skill';
  if (files.length < 5) return 'prototype';
  if (hasTests && files.length > 20) return 'improve-architecture';
  if (files.length > 50) return 'extract-skill';
  return 'learn';
}

export function extractTextInsights(text: string): string[] {
  const insights: string[] = [];
  const sentences = text.split(/[.!?\n]+/).filter((s) => s.trim().length > 0);
  insights.push(`Contains ${sentences.length} statement(s)`);
  if (text.length > 500) insights.push('Detailed brief — may need scoping');
  if (text.length < 50) insights.push('Very brief input — may need clarification');
  return insights;
}

export function inferFunctionDescription(name: string, filePath: string): string {
  const mod = path.basename(filePath, path.extname(filePath));
  if (name.startsWith('use')) return `React hook: ${name}`;
  if (name.startsWith('get') || name.startsWith('fetch')) return `Data retrieval from ${mod}`;
  if (name.startsWith('create') || name.startsWith('build') || name.startsWith('make')) return `Factory/builder from ${mod}`;
  if (name.startsWith('format') || name.startsWith('parse') || name.startsWith('transform')) return `Data transformation from ${mod}`;
  if (name.startsWith('validate') || name.startsWith('is') || name.startsWith('check')) return `Validation from ${mod}`;
  if (name.startsWith('handle') || name.startsWith('on')) return `Event handler from ${mod}`;
  return `Utility from ${mod}`;
}

export function inferComponentDescription(name: string, filePath: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('repository') || lower.includes('repo')) return 'Data access layer for persistent storage';
  if (lower.includes('service') || lower.includes('svc')) return 'Business logic service';
  if (lower.includes('controller') || lower.includes('ctrl')) return 'Request handler / controller';
  if (lower.includes('middleware') || lower.includes('mw')) return 'Middleware processor';
  if (lower.includes('adapter') || lower.includes('backend')) return 'Pluggable adapter/backend implementation';
  if (lower.includes('router') || lower.includes('route')) return 'Routing logic for request/task dispatch';
  if (lower.includes('executor') || lower.includes('worker') || lower.includes('runner')) return 'Task/command executor';
  if (lower.includes('store') || lower.includes('cache')) return 'State/data store';
  if (lower.includes('logger') || lower.includes('log')) return 'Logging utility';
  if (lower.includes('config') || lower.includes('settings') || lower.includes('options')) return 'Configuration manager';
  if (lower.includes('provider') || lower.includes('context')) return 'Context/dependency provider';
  if (lower.includes('factory') || lower.includes('builder')) return 'Object factory/builder';
  if (lower.includes('handler')) return 'Event/request handler';
  if (lower.includes('guard') || lower.includes('auth') || lower.includes('permission')) return 'Auth/validation guard';
  if (lower.includes('model') || lower.includes('entity') || lower.includes('schema')) return 'Data model/entity definition';
  if (lower.includes('client') || lower.includes('connector')) return 'External service client';
  if (lower.includes('serializer') || lower.includes('parser') || lower.includes('codec')) return 'Data serialization/parsing';
  if (lower.includes('validator') || lower.includes('checker')) return 'Input validation logic';
  if (lower.includes('migration') || lower.includes('seed')) return 'Database migration/seeding';
  if (lower.includes('trait') || lower.includes('interface') || lower.includes('protocol')) return 'Abstraction/contract definition';
  if (lower.includes('error') || lower.includes('exception')) return 'Error type definitions';
  if (lower.includes('test') || lower.includes('spec')) return 'Test suite';
  return `${name} (${path.basename(filePath)})`;
}

export function isUtilityOrHook(name: string, filePath: string): boolean {
  if (filePath.includes('utils') || filePath.includes('helpers') || filePath.includes('lib') || filePath.includes('shared') || filePath.includes('common') || filePath.includes('pkg')) return true;
  if (/^(use[A-Z]|get[A-Z]|set[A-Z]|create[A-Z]|build[A-Z]|format|parse|validate|ensure|is[A-Z]|to[A-Z]|from[A-Z]|make[A-Z]|new[A-Z]|with[A-Z]|load[A-Z]|save[A-Z]|init[A-Z])/.test(name)) return true;
  return false;
}
