import { describe, expect, it } from 'vitest';
import { selectBackend } from '../../src/routing/router.js';

describe('routing/router', () => {
  it('returns the preferred backend when available', () => {
    const backend = selectBackend('internal-planner');
    expect(backend.type).toBe('internal-planner');
  });

  it('falls back to an available backend when no preference given', () => {
    const backend = selectBackend();
    expect(backend.type).toBe('internal-planner');
    expect(backend.isAvailable()).toBe(true);
  });
});
