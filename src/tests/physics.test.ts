import { describe, expect, it } from 'vitest';
import {
  createProjectile,
  intersectSegmentCapsule,
  intersectSegmentCircle,
  stepProjectile,
} from '../game/physics';
import { physicsConfig } from '../game/config/physicsConfig';
import type { HitboxShape } from '../game/rig';
import type { Terrain } from '../game/terrain';

function makeFlatTerrain(width: number = 150, y: number = 0): Terrain {
  const step = 0.5;
  const samples = new Float64Array(Math.floor(width / step) + 1).fill(y);
  return {
    seed: 1,
    width,
    sampleStep: step,
    samples,
    leftArcherX: 25,
    rightArcherX: width - 25,
    distance: width - 50,
    heightAt: () => y,
    normalAt: () => ({ x: 0, y: 1 }),
    intersectSegment: (a, b) => {
      if (a.y >= y && b.y <= y && a.y !== b.y) {
        const t = (a.y - y) / (a.y - b.y);
        return {
          t,
          point: { x: a.x + (b.x - a.x) * t, y },
          normal: { x: 0, y: 1 },
        };
      }
      return null;
    },
  };
}

describe('Balística e Colisão Contínua', () => {
  it('alcança ≈ 80 m com 45° e v = 31 m/s em g = 12 (tolerância de 2%)', () => {
    const terrain = makeFlatTerrain(150, 0);
    const proj = createProjectile({ x: 10, y: 0.001 }, Math.PI / 4, 31);
    const dt = physicsConfig.fixedDt;

    let hitX: number | null = null;
    for (let i = 0; i < 1000; i++) {
      const res = stepProjectile(proj, dt, terrain, []);
      if (res && res.kind === 'terrain') {
        hitX = res.point.x;
        break;
      }
    }

    expect(hitX).not.toBeNull();
    const range = hitX! - 10;
    const expected = (31 * 31) / physicsConfig.gravity; // ~80.083 m
    expect(Math.abs(range - expected) / expected).toBeLessThan(0.02);
  });

  it('detecta interseção segmento × círculo corretamente', () => {
    const hit = intersectSegmentCircle({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0.05 }, 0.13);
    expect(hit).not.toBeNull();
    expect(hit!.t).toBeGreaterThan(0.45);
    expect(hit!.t).toBeLessThan(0.55);

    const miss = intersectSegmentCircle({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0.25 }, 0.13);
    expect(miss).toBeNull();
  });

  it('detecta interseção segmento × cápsula corretamente', () => {
    const hit = intersectSegmentCapsule(
      { x: 0, y: 1 },
      { x: 10, y: 1 },
      { x: 5, y: 0 },
      { x: 5, y: 2 },
      0.06
    );
    expect(hit).not.toBeNull();
    expect(hit!.point.x).toBeCloseTo(4.94, 3);
    expect(hit!.point.y).toBeCloseTo(1, 3);
  });

  it('flecha a 40 m/s não atravessa cápsula fina de 0,06 m (anti-tunneling)', () => {
    const terrain = makeFlatTerrain(150, 0);
    const capsule: HitboxShape = {
      boneId: 'forearmFront',
      zone: 'arm',
      kind: 'capsule',
      a: { x: 30, y: 0.8 },
      b: { x: 30, y: 1.4 },
      radius: 0.06,
    };

    // Even with larger dt (1/60s -> 0.667 m step > 0.12 m diameter!), continuous collision catches it
    const proj = createProjectile({ x: 29.7, y: 1.1 }, 0, 40);
    const res = stepProjectile(proj, 1 / 60, terrain, [capsule], 0);
    expect(res).not.toBeNull();
    expect(res!.kind).toBe('player');
    if (res && res.kind === 'player') {
      expect(res.point.x).toBeCloseTo(29.94, 2);
    }
  });
});
