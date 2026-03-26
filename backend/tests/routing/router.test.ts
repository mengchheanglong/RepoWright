import { describe, expect, it } from 'vitest';
import { listBackendCapabilities, selectBackend } from '../../src/routing/router.js';

describe('routing/router', () => {
  it('returns the preferred backend when available', () => {
    const backend = selectBackend('internal-planner');
    expect(backend.type).toBe('internal-planner');
  });

  it('lists backend capabilities', () => {
    const capabilities = listBackendCapabilities();
    expect(capabilities.length).toBeGreaterThan(0);
    expect(capabilities[0]?.type).toBe('internal-planner');
    expect(capabilities[0]?.available).toBe(true);
  });
});
