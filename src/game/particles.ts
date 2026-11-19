import { paletteConfig } from './config/paletteConfig';
import { physicsConfig } from './config/physicsConfig';
import type { Vec2 } from './config/rigConfig';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  life: number;
  maxLife: number;
  gravityScale: number;
}

export class ParticleSystem {
  particles: Particle[] = [];

  spawnBlood(origin: Vec2, arrowDir: Vec2, count: number = 16): void {
    const baseAngle = Math.atan2(arrowDir.y, arrowDir.x);
    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * 1.6;
      const angle = baseAngle + spread;
      const speed = 1.5 + Math.random() * 5.5;
      const maxLife = 0.4 + Math.random() * 0.7;
      this.particles.push({
        x: origin.x,
        y: origin.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + 1.0,
        radius: 0.025 + Math.random() * 0.035,
        color: paletteConfig.world.blood,
        life: maxLife,
        maxLife,
        gravityScale: 0.85,
      });
    }
  }

  spawnDust(origin: Vec2, normal: Vec2, count: number = 12): void {
    const baseAngle = Math.atan2(normal.y, normal.x);
    for (let i = 0; i < count; i++) {
      const angle = baseAngle + (Math.random() - 0.5) * 1.8;
      const speed = 0.8 + Math.random() * 3.0;
      const maxLife = 0.4 + Math.random() * 0.6;
      this.particles.push({
        x: origin.x,
        y: origin.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 0.03 + Math.random() * 0.045,
        color: paletteConfig.world.dust,
        life: maxLife,
        maxLife,
        gravityScale: 0.25,
      });
    }
  }

  update(dt: number): void {
    const g = physicsConfig.gravity;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy -= g * p.gravityScale * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  clear(): void {
    this.particles = [];
  }
}
