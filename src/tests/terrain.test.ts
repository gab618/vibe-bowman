import { describe, expect, it } from 'vitest';
import { physicsConfig } from '../game/config/physicsConfig';
import { generateTerrain } from '../game/terrain';

describe('Terreno procedural', () => {
  it('respeita distância, variação de ±6 m, plataformas planas e pico entre arqueiros para várias seeds', () => {
    const cfg = physicsConfig.terrain;
    const seeds = [1, 42, 123, 999, 2026, 77777, 987654321];

    for (const seed of seeds) {
      const t = generateTerrain(seed);

      expect(t.distance).toBeGreaterThanOrEqual(cfg.minDistance);
      expect(t.distance).toBeLessThanOrEqual(cfg.maxDistance);

      // Height limits ±6 m
      for (let i = 0; i < t.samples.length; i++) {
        expect(t.samples[i]).toBeGreaterThanOrEqual(-cfg.maxAmplitude - 1e-6);
        expect(t.samples[i]).toBeLessThanOrEqual(cfg.maxAmplitude + 1e-6);
      }

      // Flat platforms under both archers (3 m wide)
      const leftY = t.heightAt(t.leftArcherX);
      const rightY = t.heightAt(t.rightArcherX);
      for (const dx of [-1.0, -0.5, 0, 0.5, 1.0]) {
        expect(t.heightAt(t.leftArcherX + dx)).toBeCloseTo(leftY, 5);
        expect(t.heightAt(t.rightArcherX + dx)).toBeCloseTo(rightY, 5);
      }

      // Peak between archers <= lowestArcher + 8 m
      const lowest = Math.min(leftY, rightY);
      for (let x = t.leftArcherX; x <= t.rightArcherX; x += 0.5) {
        expect(t.heightAt(x)).toBeLessThanOrEqual(lowest + cfg.maxPeakAboveLowestArcher + 1e-6);
      }
    }
  });
});
