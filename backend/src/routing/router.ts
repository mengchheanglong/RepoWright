import type { BackendAdapter } from '../backends/adapter.js';
import { InternalPlannerBackend } from '../backends/internal-planner.js';
import type { BackendType } from '../domain/index.js';
import { getLogger } from '../utils/logger.js';

const backendRegistry: Record<BackendType, BackendAdapter> = {
  'internal-planner': new InternalPlannerBackend(),
};

export function selectBackend(preferred?: BackendType): BackendAdapter {
  const logger = getLogger();
  const requested = preferred ? backendRegistry[preferred] : undefined;

  if (requested?.isAvailable()) {
    logger.info(`Selected engine: ${requested.name}`);
    return requested;
  }

  const available = Object.values(backendRegistry).find((backend) => backend.isAvailable());
  if (!available) {
    throw new Error('No execution backend is currently available.');
  }

  logger.info(`Selected engine: ${available.name}`);
  return available;
}

export function backendDisplayName(type: BackendType): string {
  switch (type) {
    case 'internal-planner':
      return 'Local Planner';
  }
}

