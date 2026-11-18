import { physicsConfig } from './config/physicsConfig';
import type { Vec2 } from './config/rigConfig';

export interface TerrainHit {
  t: number;
  point: Vec2;
  normal: Vec2;
}

export interface Terrain {
  readonly seed: number;
  readonly width: number;
  readonly sampleStep: number;
  readonly samples: Float64Array;
  readonly leftArcherX: number;
  readonly rightArcherX: number;
  readonly distance: number;
  heightAt(x: number): number;
  normalAt(x: number): Vec2;
  intersectSegment(a: Vec2, b: Vec2): TerrainHit | null;
}

/** Simple deterministic PRNG (Mulberry32) */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function segmentIntersectionT(p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2): number | null {
  const rX = p2.x - p1.x;
  const rY = p2.y - p1.y;
  const sX = q2.x - q1.x;
  const sY = q2.y - q1.y;

  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) < 1e-10) {
    return null;
  }

  const qpX = q1.x - p1.x;
  const qpY = q1.y - p1.y;

  const t = (qpX * sY - qpY * sX) / denom;
  const u = (qpX * rY - qpY * rX) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return t;
  }
  return null;
}

export function generateTerrain(seed: number = Math.floor(Math.random() * 1_000_000_000)): Terrain {
  const cfg = physicsConfig.terrain;
  const rng = createRng(seed);

  const distance = cfg.minDistance + rng() * (cfg.maxDistance - cfg.minDistance);
  const width = distance + cfg.sideMargin * 2;
  const leftArcherX = cfg.sideMargin;
  const rightArcherX = cfg.sideMargin + distance;
  const sampleStep = cfg.sampleStep;
  const count = Math.floor(width / sampleStep) + 1;

  // Try up to 16 wave sets to naturally satisfy the peak-between-archers limit; clamp as safety net.
  let samples = new Float64Array(count);

  for (let attempt = 0; attempt < 16; attempt++) {
    const waves = [
      { freq: 0.04 + rng() * 0.05, phase: rng() * Math.PI * 2, amp: 2.2 + rng() * 1.4 },
      { freq: 0.09 + rng() * 0.08, phase: rng() * Math.PI * 2, amp: 1.0 + rng() * 1.0 },
      { freq: 0.18 + rng() * 0.14, phase: rng() * Math.PI * 2, amp: 0.4 + rng() * 0.5 },
    ];

    const raw = new Float64Array(count);
    let maxAbs = 0;
    for (let i = 0; i < count; i++) {
      const x = i * sampleStep;
      let h = 0;
      for (const w of waves) {
        h += Math.sin(x * w.freq + w.phase) * w.amp;
      }
      raw[i] = h;
      if (Math.abs(h) > maxAbs) maxAbs = Math.abs(h);
    }

    // Normalize to stay within ±maxAmplitude
    const ampScale = maxAbs > cfg.maxAmplitude ? cfg.maxAmplitude / maxAbs : 1;
    for (let i = 0; i < count; i++) {
      raw[i] *= ampScale;
    }

    // Smooth pass (box blur 3-tap twice)
    const smoothed = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      const prev = raw[Math.max(0, i - 1)];
      const curr = raw[i];
      const next = raw[Math.min(count - 1, i + 1)];
      smoothed[i] = (prev + 2 * curr + next) * 0.25;
    }

    // Flatten platforms under left and right archers
    const leftPlatY = smoothed[Math.round(leftArcherX / sampleStep)];
    const rightPlatY = smoothed[Math.round(rightArcherX / sampleStep)];
    const halfPlat = cfg.platformWidth * 0.5;
    const blendOuter = halfPlat + cfg.platformBlendWidth;

    samples = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      const x = i * sampleStep;
      let h = smoothed[i];

      const dLeft = Math.abs(x - leftArcherX);
      if (dLeft < blendOuter) {
        const w = smoothstep(halfPlat, blendOuter, dLeft);
        h = leftPlatY * (1 - w) + h * w;
      }

      const dRight = Math.abs(x - rightArcherX);
      if (dRight < blendOuter) {
        const w = smoothstep(halfPlat, blendOuter, dRight);
        h = rightPlatY * (1 - w) + h * w;
      }

      // Clamp to ±maxAmplitude just in case
      samples[i] = Math.max(-cfg.maxAmplitude, Math.min(cfg.maxAmplitude, h));
    }

    const lowestArcherY = Math.min(
      samples[Math.round(leftArcherX / sampleStep)],
      samples[Math.round(rightArcherX / sampleStep)]
    );
    const maxAllowedPeak = lowestArcherY + cfg.maxPeakAboveLowestArcher;

    let valid = true;
    const iStart = Math.floor(leftArcherX / sampleStep);
    const iEnd = Math.ceil(rightArcherX / sampleStep);
    for (let i = iStart; i <= iEnd; i++) {
      if (samples[i] > maxAllowedPeak) {
        valid = false;
        break;
      }
    }

    if (valid || attempt === 15) {
      if (!valid) {
        // Clamp any excess peak gently
        for (let i = iStart; i <= iEnd; i++) {
          if (samples[i] > maxAllowedPeak) {
            samples[i] = maxAllowedPeak;
          }
        }
      }
      break;
    }
  }

  function heightAt(x: number): number {
    if (x <= 0) return samples[0];
    if (x >= width) return samples[count - 1];
    const fIdx = x / sampleStep;
    const i0 = Math.floor(fIdx);
    const i1 = Math.min(count - 1, i0 + 1);
    const frac = fIdx - i0;
    return samples[i0] * (1 - frac) + samples[i1] * frac;
  }

  function normalAt(x: number): Vec2 {
    const eps = sampleStep * 0.5;
    const hL = heightAt(x - eps);
    const hR = heightAt(x + eps);
    const slope = (hR - hL) / (2 * eps);
    const len = Math.hypot(-slope, 1);
    return { x: -slope / len, y: 1 / len };
  }

  function intersectSegment(a: Vec2, b: Vec2): TerrainHit | null {
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    if (maxX < 0 || minX > width) {
      return null;
    }

    // If start point is already inside terrain within world bounds
    if (a.x >= 0 && a.x <= width && a.y <= heightAt(a.x)) {
      return {
        t: 0,
        point: { x: a.x, y: a.y },
        normal: normalAt(a.x),
      };
    }

    const iMin = Math.max(0, Math.floor(minX / sampleStep) - 1);
    const iMax = Math.min(count - 2, Math.ceil(maxX / sampleStep) + 1);

    let bestT = Infinity;
    let bestNormal: Vec2 = { x: 0, y: 1 };

    for (let i = iMin; i <= iMax; i++) {
      const q1: Vec2 = { x: i * sampleStep, y: samples[i] };
      const q2: Vec2 = { x: (i + 1) * sampleStep, y: samples[i + 1] };
      const t = segmentIntersectionT(a, b, q1, q2);
      if (t !== null && t < bestT) {
        bestT = t;
        const dx = q2.x - q1.x;
        const dy = q2.y - q1.y;
        const len = Math.hypot(-dy, dx);
        bestNormal = { x: -dy / len, y: dx / len };
      }
    }

    if (bestT <= 1) {
      return {
        t: bestT,
        point: {
          x: a.x + (b.x - a.x) * bestT,
          y: a.y + (b.y - a.y) * bestT,
        },
        normal: bestNormal,
      };
    }

    return null;
  }

  return {
    seed,
    width,
    sampleStep,
    samples,
    leftArcherX,
    rightArcherX,
    distance,
    heightAt,
    normalAt,
    intersectSegment,
  };
}
