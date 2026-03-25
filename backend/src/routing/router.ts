import type { BackendAdapter } from '../backends/adapter.js';
import { ClaudeCliBackend } from '../backends/claude-stub.js';
import { CodexCliBackend } from '../backends/codex-stub.js';
import { InternalPlannerBackend } from '../backends/internal-planner.js';
import type { BackendType } from '../domain/index.js';
import { getLogger } from '../utils/logger.js';

const backends: BackendAdapter[] = [
  new InternalPlannerBackend(),
  new CodexCliBackend(),
  new ClaudeCliBackend(),
];

export function selectBackend(preferred?: BackendType): BackendAdapter {
  const logger = getLogger();

  if (preferred) {
    const match = backends.find((b) => b.type === preferred);
    if (match?.isAvailable()) {
      logger.info(`Selected backend: ${match.name}`);
      return match;
    }
    logger.warn(`Preferred backend "${preferred}" not available, falling back`);
  }

  const available = backends.find((b) => b.isAvailable());
  if (!available) {
    throw new Error(
      'No available backend. This should not happen — internal-planner is always available.',
    );
  }
  logger.info(`Selected backend: ${available.name}`);
  return available;
}

export function listBackends(): { name: string; type: BackendType; available: boolean }[] {
  return backends.map((b) => ({
    name: b.name,
    type: b.type,
    available: b.isAvailable(),
  }));
}
