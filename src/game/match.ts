import { AudioEngine } from './audio';
import { Camera, clampZoom } from './camera';
import { computeHitDamage, damageConfig } from './config/damageConfig';
import { type PlayerId } from './config/paletteConfig';
import { physicsConfig } from './config/physicsConfig';
import { rigConfig, type Vec2 } from './config/rigConfig';
import type { AimState, Controller } from './controller';
import { ParticleSystem } from './particles';
import {
  createProjectile,
  launchSpeedFromPower,
  stepProjectile,
  type ProjectileState,
} from './physics';
import { Ragdoll } from './ragdoll';
import { buildRigPose, extractHitboxes, type BoneId, type HitboxShape, type RigPose } from './rig';
import { generateTerrain, type Terrain } from './terrain';

export type MatchPhase = 'aiming' | 'flight' | 'impact_hold' | 'transition' | 'dying';

export type StuckArrow =
  | {
      kind: 'terrain';
      owner: PlayerId;
      worldTip: Vec2;
      angle: number;
    }
  | {
      kind: 'bone';
      owner: PlayerId;
      targetPlayer: PlayerId;
      boneId: BoneId;
      localPos: Vec2;
      localAngle: number;
    };

export interface PlayerState {
  id: PlayerId;
  label: string;
  groundPos: Vec2;
  hp: number;
  facing: 1 | -1;
  pose: RigPose;
  ragdoll: Ragdoll | null;
  recoilTimer: number;
  recoilSign: number;
  lastShot: { angle: number; power: number } | null;
}

export interface Announcement {
  text: string;
  color: string;
  age: number;
  duration: number;
}

export function resolveStuckArrowTransform(
  arrow: StuckArrow,
  players: Record<PlayerId, PlayerState>
): { tip: Vec2; angle: number } {
  if (arrow.kind === 'terrain') {
    return { tip: arrow.worldTip, angle: arrow.angle };
  }
  const target = players[arrow.targetPlayer];
  const bone = target.pose.bones[arrow.boneId];
  const ux = Math.cos(bone.angle);
  const uy = Math.sin(bone.angle);
  const vx = -uy;
  const vy = ux;
  return {
    tip: {
      x: bone.start.x + ux * arrow.localPos.x + vx * arrow.localPos.y,
      y: bone.start.y + uy * arrow.localPos.x + vy * arrow.localPos.y,
    },
    angle: bone.angle + arrow.localAngle,
  };
}

export class Match {
  terrain: Terrain;
  players: Record<PlayerId, PlayerState>;
  activePlayer: PlayerId = 'blue';
  phase: MatchPhase = 'aiming';
  projectile: ProjectileState | null = null;
  stuckArrows: StuckArrow[] = [];
  announcement: Announcement | null = null;
  currentAim: AimState = { isAiming: false, angle: 0.45, power: 0 };
  winner: PlayerId | null = null;

  private phaseTimer = 0;
  private impactFocusPoint: Vec2 | null = null;
  private accumulator = 0;
  private controllers: Record<PlayerId, Controller>;
  private camera: Camera;
  private particles: ParticleSystem;
  private audio: AudioEngine;
  private onGameOver: (winner: PlayerId) => void;

  constructor(
    controllers: Record<PlayerId, Controller>,
    camera: Camera,
    particles: ParticleSystem,
    audio: AudioEngine,
    onGameOver: (winner: PlayerId) => void,
    seed?: number
  ) {
    this.controllers = controllers;
    this.camera = camera;
    this.particles = particles;
    this.audio = audio;
    this.onGameOver = onGameOver;

    this.terrain = generateTerrain(seed);
    const bluePos: Vec2 = {
      x: this.terrain.leftArcherX,
      y: this.terrain.heightAt(this.terrain.leftArcherX),
    };
    const blackPos: Vec2 = {
      x: this.terrain.rightArcherX,
      y: this.terrain.heightAt(this.terrain.rightArcherX),
    };

    this.players = {
      blue: {
        id: 'blue',
        label: 'AZUL',
        groundPos: bluePos,
        hp: damageConfig.maxHp,
        facing: 1,
        pose: buildRigPose({ mode: 'idle', groundPos: bluePos, facing: 1, showNockedArrow: true }),
        ragdoll: null,
        recoilTimer: 0,
        recoilSign: 1,
        lastShot: null,
      },
      black: {
        id: 'black',
        label: 'PRETO',
        groundPos: blackPos,
        hp: damageConfig.maxHp,
        facing: -1,
        pose: buildRigPose({ mode: 'idle', groundPos: blackPos, facing: -1, showNockedArrow: true }),
        ragdoll: null,
        recoilTimer: 0,
        recoilSign: 1,
        lastShot: null,
      },
    };

    this.camera.snapTo(bluePos.x, bluePos.y + 1.2, physicsConfig.camera.defaultZoom);
  }

  get canAim(): boolean {
    return this.phase === 'aiming';
  }

  private getRecoilAngle(player: PlayerState): number {
    if (player.recoilTimer <= 0) return 0;
    const dur = rigConfig.skeleton.hitRecoilDuration;
    const progress = 1 - player.recoilTimer / dur;
    // Fast kick then smooth return
    const curve = Math.sin(progress * Math.PI);
    return curve * 0.32 * player.recoilSign;
  }

  private pushAnnouncement(text: string, color: string = '#1A1A1D'): void {
    this.announcement = {
      text,
      color,
      age: 0,
      duration: 1.2,
    };
  }

  private addStuckArrow(arrow: StuckArrow): void {
    this.stuckArrows.push(arrow);
    if (this.stuckArrows.length > physicsConfig.maxStuckArrows) {
      this.stuckArrows.shift();
    }
  }

  update(frameDt: number): void {
    // Update announcement timer
    if (this.announcement) {
      this.announcement.age += frameDt;
      if (this.announcement.age >= this.announcement.duration) {
        this.announcement = null;
      }
    }

    // Update hit recoil timers
    for (const pid of ['blue', 'black'] as PlayerId[]) {
      const p = this.players[pid];
      if (p.recoilTimer > 0) {
        p.recoilTimer = Math.max(0, p.recoilTimer - frameDt);
      }
    }

    // Controller update
    const ctrl = this.controllers[this.activePlayer];
    const ctrlRes = ctrl.update(frameDt, this.canAim);
    this.currentAim = ctrlRes.aim;

    if (this.canAim) {
      this.audio.updateTension(ctrlRes.aim.isAiming, ctrlRes.aim.power);
    } else {
      this.audio.updateTension(false, 0);
    }

    // Update poses for non-ragdoll players
    for (const pid of ['blue', 'black'] as PlayerId[]) {
      const p = this.players[pid];
      if (p.ragdoll) continue;
      const recoilAngle = this.getRecoilAngle(p);
      if (pid === this.activePlayer && this.phase === 'aiming' && ctrlRes.aim.isAiming) {
        p.pose = buildRigPose({
          mode: 'aim',
          groundPos: p.groundPos,
          aimAngle: ctrlRes.aim.angle,
          power: ctrlRes.aim.power,
          recoilOffsetAngle: recoilAngle,
          showNockedArrow: true,
        });
        p.facing = p.pose.facing;
      } else {
        p.pose = buildRigPose({
          mode: 'idle',
          groundPos: p.groundPos,
          facing: p.facing,
          recoilOffsetAngle: recoilAngle,
          showNockedArrow: pid === this.activePlayer && this.phase === 'aiming',
        });
      }
    }

    // Fire arrow if requested
    if (this.canAim && ctrlRes.fire) {
      this.fireArrow(ctrlRes.aim.angle, ctrlRes.aim.power);
    }

    // Fixed-timestep physics accumulator
    this.accumulator += frameDt;
    const fixedDt = physicsConfig.fixedDt;
    let steps = 0;

    while (this.accumulator >= fixedDt && steps < physicsConfig.maxStepsPerFrame) {
      this.stepPhysics(fixedDt);
      this.accumulator -= fixedDt;
      steps++;
    }
    if (steps >= physicsConfig.maxStepsPerFrame) {
      this.accumulator = 0;
    }

    // Particles
    this.particles.update(frameDt);

    // Phase timers & audio whoosh
    if (this.phase === 'flight' && this.projectile) {
      const speed = Math.hypot(this.projectile.vel.x, this.projectile.vel.y);
      this.audio.updateWhoosh(true, speed);
    } else {
      this.audio.updateWhoosh(false, 0);
    }

    if (this.phase === 'impact_hold') {
      this.phaseTimer -= frameDt;
      if (this.phaseTimer <= 0) {
        this.activePlayer = this.activePlayer === 'blue' ? 'black' : 'blue';
        this.phase = 'transition';
        this.phaseTimer = physicsConfig.camera.turnTransitionSeconds;
      }
    } else if (this.phase === 'transition') {
      this.phaseTimer -= frameDt;
      if (this.phaseTimer <= 0) {
        this.phase = 'aiming';
      }
    } else if (this.phase === 'dying') {
      this.phaseTimer -= frameDt;
      if (this.phaseTimer <= 0 && this.winner) {
        const winId = this.winner;
        this.winner = null;
        this.onGameOver(winId);
      }
    }

    this.updateCamera(frameDt);
  }

  private fireArrow(angle: number, power: number): void {
    const shooter = this.players[this.activePlayer];
    shooter.lastShot = { angle, power };

    const pose = buildRigPose({
      mode: 'aim',
      groundPos: shooter.groundPos,
      aimAngle: angle,
      power,
      showNockedArrow: false,
    });
    shooter.pose = pose;
    shooter.facing = pose.facing;

    const speed = launchSpeedFromPower(power);
    this.projectile = createProjectile(pose.bow.nockedArrowTip, angle, speed);
    this.phase = 'flight';
    this.audio.playRelease(power);
  }

  private stepPhysics(dt: number): void {
    // Update active ragdolls
    for (const pid of ['blue', 'black'] as PlayerId[]) {
      const p = this.players[pid];
      if (p.ragdoll) {
        p.ragdoll.step(dt, this.terrain);
        p.pose = p.ragdoll.toRigPose();
      }
    }

    if (this.phase !== 'flight' || !this.projectile || !this.projectile.active) {
      return;
    }

    // Gather all hitboxes from both players
    const allHitboxes: Array<{ owner: PlayerId; shape: HitboxShape }> = [];
    for (const pid of ['blue', 'black'] as PlayerId[]) {
      const p = this.players[pid];
      const shapes = p.ragdoll ? p.ragdoll.getHitboxes() : extractHitboxes(p.pose);
      for (const s of shapes) {
        allHitboxes.push({ owner: pid, shape: s });
      }
    }

    const res = stepProjectile(
      this.projectile,
      dt,
      this.terrain,
      allHitboxes.map((h) => h.shape)
    );

    if (!res) return;

    const dirX = Math.cos(this.projectile.angle);
    const dirY = Math.sin(this.projectile.angle);
    const embeddedTip: Vec2 = {
      x: (res.kind === 'out_of_bounds' ? this.projectile.tip.x : res.point.x) +
        dirX * physicsConfig.arrowPenetration,
      y: (res.kind === 'out_of_bounds' ? this.projectile.tip.y : res.point.y) +
        dirY * physicsConfig.arrowPenetration,
    };

    if (res.kind === 'terrain') {
      this.addStuckArrow({
        kind: 'terrain',
        owner: this.activePlayer,
        worldTip: embeddedTip,
        angle: this.projectile.angle,
      });
      this.particles.spawnDust(res.point, res.normal);
      this.audio.playGroundImpact();
      this.impactFocusPoint = { ...res.point };
      this.projectile = null;
      this.phase = 'impact_hold';
      this.phaseTimer = physicsConfig.camera.impactHoldSeconds;
      return;
    }

    if (res.kind === 'out_of_bounds') {
      this.pushAnnouncement('ERROU!', '#4A4A52');
      this.impactFocusPoint = {
        x: Math.max(0, Math.min(this.terrain.width, this.projectile.tip.x)),
        y: Math.max(this.terrain.heightAt(this.terrain.leftArcherX), this.projectile.tip.y),
      };
      this.projectile = null;
      this.phase = 'impact_hold';
      this.phaseTimer = physicsConfig.camera.impactHoldSeconds;
      return;
    }

    if (res.kind === 'player') {
      const hitEntry = allHitboxes.find((h) => h.shape === res.hitbox);
      const targetId: PlayerId = hitEntry ? hitEntry.owner : this.activePlayer === 'blue' ? 'black' : 'blue';
      const target = this.players[targetId];
      const bone = target.pose.bones[res.hitbox.boneId];

      // Convert embedded tip to bone-local coordinates
      const ux = Math.cos(bone.angle);
      const uy = Math.sin(bone.angle);
      const vx = -uy;
      const vy = ux;
      const relX = embeddedTip.x - bone.start.x;
      const relY = embeddedTip.y - bone.start.y;

      this.addStuckArrow({
        kind: 'bone',
        owner: this.activePlayer,
        targetPlayer: targetId,
        boneId: res.hitbox.boneId,
        localPos: {
          x: relX * ux + relY * uy,
          y: relX * vx + relY * vy,
        },
        localAngle: this.projectile.angle - bone.angle,
      });

      const impactSpeed = Math.hypot(this.projectile.vel.x, this.projectile.vel.y);
      const dmg = computeHitDamage({
        zone: res.hitbox.zone,
        boneId: res.hitbox.boneId,
        impactSpeed,
      });
      target.hp = Math.max(0, target.hp - dmg);

      const isHeadshot = res.hitbox.zone === 'head';
      this.particles.spawnBlood(res.point, { x: dirX, y: dirY }, isHeadshot ? 26 : 16);
      this.audio.playBodyImpact(isHeadshot);

      if (isHeadshot) {
        this.pushAnnouncement('HEADSHOT!', '#B3261E');
      } else {
        const distM = Math.round(this.terrain.distance);
        this.pushAnnouncement(`ACERTO A ${distM}m!`, '#1A1A1D');
      }

      this.impactFocusPoint = { ...res.point };

      if (target.hp <= 0) {
        // Death -> Ragdoll
        if (!target.ragdoll) {
          target.ragdoll = new Ragdoll(target.pose, res.point, this.projectile.vel);
        }
        this.winner = targetId === 'blue' ? 'black' : 'blue';
        this.projectile = null;
        this.phase = 'dying';
        this.phaseTimer = 2.0;
      } else {
        // Recoil away from incoming arrow
        const hitFromFront = dirX * target.facing < 0;
        target.recoilSign = hitFromFront ? 1 : -1;
        target.recoilTimer = rigConfig.skeleton.hitRecoilDuration;
        this.projectile = null;
        this.phase = 'impact_hold';
        this.phaseTimer = physicsConfig.camera.impactHoldSeconds;
      }
    }
  }

  private updateCamera(dt: number): void {
    const active = this.players[this.activePlayer];
    const camCfg = physicsConfig.camera;

    if (this.phase === 'aiming' || this.phase === 'transition') {
      let targetX = active.groundPos.x;
      let targetY = active.groundPos.y + 1.2;

      if (this.phase === 'aiming' && this.currentAim.isAiming) {
        const maxScreenWorldX = (this.camera.viewportWidth / this.camera.scale) * camCfg.aimLookAheadFraction;
        const maxScreenWorldY = (this.camera.viewportHeight / this.camera.scale) * camCfg.aimLookAheadFraction;
        const lookDist = this.currentAim.power;
        targetX += Math.cos(this.currentAim.angle) * maxScreenWorldX * lookDist;
        targetY += Math.sin(this.currentAim.angle) * maxScreenWorldY * lookDist;
      }

      this.camera.setTarget(targetX, targetY, camCfg.defaultZoom);
    } else if (this.phase === 'flight' && this.projectile) {
      const speed = Math.hypot(this.projectile.vel.x, this.projectile.vel.y);
      const groundH = this.terrain.heightAt(
        Math.max(0, Math.min(this.terrain.width, this.projectile.tip.x))
      );
      const heightAboveGround = Math.max(0, this.projectile.tip.y - groundH);
      const zoomOut = Math.min(0.45, speed / 120 + heightAboveGround / 60);
      const targetZoom = clampZoom(camCfg.defaultZoom - zoomOut);
      this.camera.setTarget(this.projectile.tip.x, this.projectile.tip.y, targetZoom);
    } else if ((this.phase === 'impact_hold' || this.phase === 'dying') && this.impactFocusPoint) {
      this.camera.setTarget(this.impactFocusPoint.x, this.impactFocusPoint.y + 0.5, camCfg.defaultZoom);
    }

    this.camera.update(dt);
  }
}
