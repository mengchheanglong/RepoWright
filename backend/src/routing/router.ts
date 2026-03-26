import type { BackendAdapter } from '../backends/adapter.js';
import { InternalPlannerBackend } from '../backends/internal-planner.js';
import type { BackendType } from '../domain/index.js';
import { getLogger } from '../utils/logger.js';

const backend = new InternalPlannerBackend();

export function selectBackend(_preferred?: BackendType): BackendAdapter {
  const logger = getLogger();
  logger.info(`Selected engine: ${backend.name}`);
  return backend;
}

export function backendDisplayName(type: BackendType): string {
  switch (type) {
    case 'internal-planner':
      return 'Local Planner';
  }
}
