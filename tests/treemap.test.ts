import { describe, expect, it } from 'vitest';
import { treemap } from '../src/lib/treemap';

describe('treemap', () => {
  it('fills the box with areas in proportion to the weights', () => {
    const weights = [40, 25, 15, 10, 5, 3, 2];
    const rects = treemap(weights, 300, 200);
    expect(rects).toHaveLength(weights.length);
    rects.forEach((r, i) => {
      expect(r.w * r.h).toBeCloseTo((weights[i] / 100) * 300 * 200, 6);
      expect(r.x).toBeGreaterThanOrEqual(-1e-9);
      expect(r.y).toBeGreaterThanOrEqual(-1e-9);
      expect(r.x + r.w).toBeLessThanOrEqual(300 + 1e-9);
      expect(r.y + r.h).toBeLessThanOrEqual(200 + 1e-9);
    });
  });

  it('lays equal weights out as a grid of near squares', () => {
    const rects = treemap(Array(16).fill(1), 400, 400);
    for (const r of rects) expect(Math.max(r.w / r.h, r.h / r.w)).toBeLessThan(1.6);
  });
});
