import { physicsConfig } from './config/physicsConfig';
import type { Vec2 } from './config/rigConfig';

export class Camera {
  x = 0;
  y = 0;
  zoom: number = physicsConfig.camera.defaultZoom;

  targetX = 0;
  targetY = 0;
  targetZoom: number = physicsConfig.camera.defaultZoom;

  viewportWidth = 1280;
  viewportHeight = 720;

  setViewport(cssWidth: number, cssHeight: number): void {
    this.viewportWidth = Math.max(1, cssWidth);
    this.viewportHeight = Math.max(1, cssHeight);
  }

  snapTo(x: number, y: number, zoom: number = physicsConfig.camera.defaultZoom): void {
    const clampedZoom = clampZoom(zoom);
    this.x = x;
    this.y = y;
    this.zoom = clampedZoom;
    this.targetX = x;
    this.targetY = y;
    this.targetZoom = clampedZoom;
  }

  setTarget(x: number, y: number, zoom: number): void {
    this.targetX = x;
    this.targetY = y;
    this.targetZoom = clampZoom(zoom);
  }

  update(dt: number): void {
    const panAlpha = 1 - Math.exp(-physicsConfig.camera.panLerpRate * dt);
    const zoomAlpha = 1 - Math.exp(-physicsConfig.camera.zoomLerpRate * dt);
    this.x += (this.targetX - this.x) * panAlpha;
    this.y += (this.targetY - this.y) * panAlpha;
    this.zoom += (this.targetZoom - this.zoom) * zoomAlpha;
  }

  /** Pixels per 1 meter at current zoom */
  get scale(): number {
    return physicsConfig.pixelsPerMeter * this.zoom;
  }

  worldToScreen(wx: number, wy: number): Vec2 {
    const s = this.scale;
    return {
      x: this.viewportWidth * 0.5 + (wx - this.x) * s,
      y: this.viewportHeight * 0.5 - (wy - this.y) * s,
    };
  }

  screenToWorld(sx: number, sy: number): Vec2 {
    const s = this.scale;
    return {
      x: this.x + (sx - this.viewportWidth * 0.5) / s,
      y: this.y - (sy - this.viewportHeight * 0.5) / s,
    };
  }
}

export function clampZoom(zoom: number): number {
  return Math.max(physicsConfig.camera.minZoom, Math.min(physicsConfig.camera.maxZoom, zoom));
}
