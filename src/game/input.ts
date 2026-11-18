import { physicsConfig } from './config/physicsConfig';
import type { PlayerId } from './config/paletteConfig';
import type { AimState, Controller, ControllerFrameResult } from './controller';

export class HumanController implements Controller {
  readonly id: PlayerId;
  private isDragging = false;
  private activePointerId: number | null = null;
  private startX = 0;
  private startY = 0;
  private angle = 0;
  private power = 0;
  private pendingFire = false;

  constructor(id: PlayerId) {
    this.id = id;
    // Default initial facing direction
    this.angle = id === 'blue' ? 0.45 : Math.PI - 0.45;
  }

  onPointerDown(e: PointerEvent, target: HTMLElement): void {
    if (e.button === 2) {
      this.cancelAim();
      return;
    }
    if (this.isDragging) return;
    this.isDragging = true;
    this.activePointerId = e.pointerId;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.power = 0;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture isn't supported in synthetic test env
    }
  }

  onPointerMove(e: PointerEvent): void {
    if (!this.isDragging || e.pointerId !== this.activePointerId) return;
    const dragDx = e.clientX - this.startX;
    const dragDy = e.clientY - this.startY;
    const dist = Math.hypot(dragDx, dragDy);

    this.power = Math.max(0, Math.min(1, dist / physicsConfig.aim.maxDragPixels));
    if (dist > 2) {
      // Opposite vector in world coords (+x right, +y up vs screen +y down)
      const worldDx = -dragDx;
      const worldDy = dragDy;
      this.angle = Math.atan2(worldDy, worldDx);
    }
  }

  onPointerUp(e: PointerEvent, target: HTMLElement): void {
    if (!this.isDragging || e.pointerId !== this.activePointerId) return;
    try {
      if (target.hasPointerCapture(e.pointerId)) {
        target.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }

    if (e.type === 'pointerup' && this.power >= physicsConfig.aim.minPowerThreshold) {
      this.pendingFire = true;
    }

    this.isDragging = false;
    this.activePointerId = null;
  }

  cancelAim(): void {
    this.isDragging = false;
    this.activePointerId = null;
    this.power = 0;
    this.pendingFire = false;
  }

  update(_dt: number, canAim: boolean): ControllerFrameResult {
    if (!canAim) {
      this.cancelAim();
      return {
        aim: { isAiming: false, angle: this.angle, power: 0 },
        fire: false,
      };
    }

    const fire = this.pendingFire;
    this.pendingFire = false;

    const aim: AimState = {
      isAiming: this.isDragging || fire,
      angle: this.angle,
      power: this.power,
    };

    if (fire) {
      // Reset power after capturing aim for fire
      this.power = 0;
    }

    return { aim, fire };
  }
}

export class InputManager {
  private controllers = new Map<PlayerId, HumanController>();
  private activeId: PlayerId = 'blue';
  private canAimProvider: () => boolean;

  constructor(
    canvas: HTMLCanvasElement,
    controllers: Record<PlayerId, HumanController>,
    canAimProvider: () => boolean
  ) {
    this.controllers.set('blue', controllers.blue);
    this.controllers.set('black', controllers.black);
    this.canAimProvider = canAimProvider;

    canvas.addEventListener('pointerdown', (e) => {
      if (!this.canAimProvider()) return;
      this.controllers.get(this.activeId)?.onPointerDown(e, canvas);
    });

    canvas.addEventListener('pointermove', (e) => {
      this.controllers.get(this.activeId)?.onPointerMove(e);
    });

    const handleUp = (e: PointerEvent) => {
      this.controllers.get(this.activeId)?.onPointerUp(e, canvas);
    };
    canvas.addEventListener('pointerup', handleUp);
    canvas.addEventListener('pointercancel', handleUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setActivePlayer(id: PlayerId): void {
    if (this.activeId !== id) {
      this.controllers.get(this.activeId)?.cancelAim();
      this.activeId = id;
    }
  }

  cancelAll(): void {
    for (const c of this.controllers.values()) {
      c.cancelAim();
    }
  }
}
