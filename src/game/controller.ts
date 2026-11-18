import type { PlayerId } from './config/paletteConfig';

export interface AimState {
  isAiming: boolean;
  /** Aim angle in world coordinates (radians, +x right, +y up) */
  angle: number;
  /** Power normalized to [0, 1] */
  power: number;
}

export interface ControllerFrameResult {
  aim: AimState;
  /** True on the frame the player releases a valid shot */
  fire: boolean;
}

export interface Controller {
  readonly id: PlayerId;
  update(dt: number, canAim: boolean): ControllerFrameResult;
  cancelAim(): void;
}
