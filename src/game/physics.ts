import { physicsConfig } from './config/physicsConfig';
import type { Vec2 } from './config/rigConfig';
import type { HitboxShape } from './rig';
import type { Terrain } from './terrain';

export interface RaycastHit {
  t: number;
  point: Vec2;
}

export interface ProjectileState {
  tip: Vec2;
  vel: Vec2;
  angle: number;
  active: boolean;
}

export interface TargetHitResult {
  kind: 'player';
  t: number;
  point: Vec2;
  hitbox: HitboxShape;
}

export interface TerrainHitResult {
  kind: 'terrain';
  t: number;
  point: Vec2;
  normal: Vec2;
}

export interface OutOfBoundsResult {
  kind: 'out_of_bounds';
}

export type StepCollisionResult = TargetHitResult | TerrainHitResult | OutOfBoundsResult | null;

export function launchSpeedFromPower(power: number): number {
  const clamped = Math.max(0, Math.min(1, power));
  return physicsConfig.minArrowSpeed + (physicsConfig.maxArrowSpeed - physicsConfig.minArrowSpeed) * clamped;
}

export function createProjectile(tip: Vec2, angle: number, speed: number): ProjectileState {
  return {
    tip: { ...tip },
    vel: {
      x: Math.cos(angle) * speed,
      y: Math.sin(angle) * speed,
    },
    angle,
    active: true,
  };
}

export function intersectSegmentCircle(
  p0: Vec2,
  p1: Vec2,
  center: Vec2,
  radius: number
): RaycastHit | null {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const fx = p0.x - center.x;
  const fy = p0.y - center.y;

  const r2 = radius * radius;
  const c = fx * fx + fy * fy - r2;
  if (c <= 0) {
    return { t: 0, point: { ...p0 } };
  }

  const a = dx * dx + dy * dy;
  if (a < 1e-12) {
    return null;
  }

  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) {
    return null;
  }

  const sqrtD = Math.sqrt(disc);
  const t = (-b - sqrtD) / (2 * a);
  if (t >= 0 && t <= 1) {
    return {
      t,
      point: {
        x: p0.x + dx * t,
        y: p0.y + dy * t,
      },
    };
  }
  return null;
}

export function intersectSegmentCapsule(
  p0: Vec2,
  p1: Vec2,
  capA: Vec2,
  capB: Vec2,
  radius: number
): RaycastHit | null {
  const abX = capB.x - capA.x;
  const abY = capB.y - capA.y;
  const len = Math.hypot(abX, abY);

  if (len < 1e-8) {
    return intersectSegmentCircle(p0, p1, capA, radius);
  }

  const ux = abX / len;
  const uy = abY / len;
  const nx = -uy;
  const ny = ux;

  const r0x = p0.x - capA.x;
  const r0y = p0.y - capA.y;
  const r1x = p1.x - capA.x;
  const r1y = p1.y - capA.y;

  const s0 = r0x * ux + r0y * uy;
  const w0 = r0x * nx + r0y * ny;
  const s1 = r1x * ux + r1y * uy;
  const w1 = r1x * nx + r1y * ny;

  // Start point already inside rectangular shaft
  if (s0 >= 0 && s0 <= len && Math.abs(w0) <= radius) {
    return { t: 0, point: { ...p0 } };
  }

  let bestT = Infinity;

  // Test two end-cap circles
  const hitA = intersectSegmentCircle(p0, p1, capA, radius);
  if (hitA && hitA.t < bestT) bestT = hitA.t;

  const hitB = intersectSegmentCircle(p0, p1, capB, radius);
  if (hitB && hitB.t < bestT) bestT = hitB.t;

  // Test two shaft side planes w = +radius and w = -radius
  const dw = w1 - w0;
  if (Math.abs(dw) > 1e-12) {
    for (const targetW of [radius, -radius]) {
      const t = (targetW - w0) / dw;
      if (t >= 0 && t <= 1 && t < bestT) {
        const sAtT = s0 + (s1 - s0) * t;
        if (sAtT >= 0 && sAtT <= len) {
          bestT = t;
        }
      }
    }
  }

  if (bestT <= 1) {
    return {
      t: bestT,
      point: {
        x: p0.x + (p1.x - p0.x) * bestT,
        y: p0.y + (p1.y - p0.y) * bestT,
      },
    };
  }
  return null;
}

export function intersectSegmentHitboxes(
  p0: Vec2,
  p1: Vec2,
  hitboxes: HitboxShape[]
): { t: number; point: Vec2; hitbox: HitboxShape } | null {
  let best: { t: number; point: Vec2; hitbox: HitboxShape } | null = null;
  for (const hb of hitboxes) {
    const hit =
      hb.kind === 'circle'
        ? intersectSegmentCircle(p0, p1, hb.a, hb.radius)
        : intersectSegmentCapsule(p0, p1, hb.a, hb.b, hb.radius);
    if (hit && (!best || hit.t < best.t)) {
      best = { t: hit.t, point: hit.point, hitbox: hb };
    }
  }
  return best;
}

export function stepProjectile(
  proj: ProjectileState,
  dt: number,
  terrain: Terrain,
  hitboxes: HitboxShape[],
  wind: number = physicsConfig.wind
): StepCollisionResult {
  if (!proj.active) return null;

  const prevTip: Vec2 = { x: proj.tip.x, y: proj.tip.y };

  // Semi-implicit Euler integration
  proj.vel.x += wind * dt;
  proj.vel.y -= physicsConfig.gravity * dt;

  const nextTip: Vec2 = {
    x: prevTip.x + proj.vel.x * dt,
    y: prevTip.y + proj.vel.y * dt,
  };

  proj.angle = Math.atan2(proj.vel.y, proj.vel.x);

  // Continuous collision against hitboxes
  const bodyHit = intersectSegmentHitboxes(prevTip, nextTip, hitboxes);
  // Continuous collision against terrain
  const terrainHit = terrain.intersectSegment(prevTip, nextTip);

  let earliestT = Infinity;
  let result: StepCollisionResult = null;

  if (bodyHit && bodyHit.t < earliestT) {
    earliestT = bodyHit.t;
    result = {
      kind: 'player',
      t: bodyHit.t,
      point: bodyHit.point,
      hitbox: bodyHit.hitbox,
    };
  }

  if (terrainHit && terrainHit.t < earliestT) {
    earliestT = terrainHit.t;
    result = {
      kind: 'terrain',
      t: terrainHit.t,
      point: terrainHit.point,
      normal: terrainHit.normal,
    };
  }

  if (result) {
    proj.tip = { ...result.point };
    proj.active = false;
    return result;
  }

  proj.tip = nextTip;

  // Out of world bounds check
  const minWorldY = terrain.heightAt(Math.max(0, Math.min(terrain.width, nextTip.x))) - physicsConfig.worldBottomMargin;
  if (nextTip.x < 0 || nextTip.x > terrain.width || nextTip.y < minWorldY) {
    proj.active = false;
    return { kind: 'out_of_bounds' };
  }

  return null;
}
