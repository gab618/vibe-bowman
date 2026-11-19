import { AssetLoader, type LoadedSvgAsset } from './assetLoader';
import { Camera } from './camera';
import { paletteConfig, type PaletteConfig, type PlayerId } from './config/paletteConfig';
import { physicsConfig } from './config/physicsConfig';
import { rigConfig, type DrawLayer, type PartName, type RigConfig, type Vec2 } from './config/rigConfig';
import { resolveStuckArrowTransform, type Match } from './match';
import type { ParticleSystem } from './particles';
import { extractHitboxes, type BoneSegment, type RigPose } from './rig';
import type { Terrain } from './terrain';

export interface DebugOverlayOptions {
  showBones: boolean;
  showHitboxes: boolean;
  showAnchors: boolean;
}

export class Renderer {
  private paperPatternCanvas: HTMLCanvasElement;
  private paperPattern: CanvasPattern | null = null;
  private lastPaperNoiseColor = '';

  constructor(private assetLoader: AssetLoader) {
    this.paperPatternCanvas = document.createElement('canvas');
    this.paperPatternCanvas.width = 256;
    this.paperPatternCanvas.height = 256;
    this.rebuildPaperTexture(paletteConfig.world.paperNoise);
  }

  private rebuildPaperTexture(noiseColor: string): void {
    this.lastPaperNoiseColor = noiseColor;
    const ctx = this.paperPatternCanvas.getContext('2d');
    if (!ctx) return;

    const w = this.paperPatternCanvas.width;
    const h = this.paperPatternCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // Subtle deterministic speckles and paper fibers
    let seed = 1337;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    ctx.fillStyle = noiseColor;
    for (let i = 0; i < 420; i++) {
      ctx.globalAlpha = 0.04 + rand() * 0.08;
      const x = rand() * w;
      const y = rand() * h;
      const r = 0.5 + rand() * 1.1;
      ctx.fillRect(x, y, r, r);
    }

    ctx.strokeStyle = noiseColor;
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 45; i++) {
      ctx.globalAlpha = 0.05 + rand() * 0.06;
      const x = rand() * w;
      const y = rand() * h;
      const len = 4 + rand() * 12;
      const ang = rand() * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.paperPattern = null;
  }

  drawBackground(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    pal: PaletteConfig = paletteConfig
  ): void {
    if (this.lastPaperNoiseColor !== pal.world.paperNoise) {
      this.rebuildPaperTexture(pal.world.paperNoise);
    }

    ctx.fillStyle = pal.world.paperBg;
    ctx.fillRect(0, 0, camera.viewportWidth, camera.viewportHeight);

    if (!this.paperPattern) {
      this.paperPattern = ctx.createPattern(this.paperPatternCanvas, 'repeat');
    }
    if (this.paperPattern) {
      ctx.save();
      const ox = ((-camera.x * camera.scale * 0.2) % 256 + 256) % 256;
      const oy = ((camera.y * camera.scale * 0.2) % 256 + 256) % 256;
      ctx.translate(ox - 256, oy - 256);
      ctx.fillStyle = this.paperPattern;
      ctx.fillRect(0, 0, camera.viewportWidth + 512, camera.viewportHeight + 512);
      ctx.restore();
    }
  }

  drawTerrain(
    ctx: CanvasRenderingContext2D,
    terrain: Terrain,
    camera: Camera,
    pal: PaletteConfig = paletteConfig
  ): void {
    const leftWorld = camera.screenToWorld(0, camera.viewportHeight).x;
    const rightWorld = camera.screenToWorld(camera.viewportWidth, 0).x;

    const iStart = Math.max(0, Math.floor(leftWorld / terrain.sampleStep) - 1);
    const iEnd = Math.min(terrain.samples.length - 1, Math.ceil(rightWorld / terrain.sampleStep) + 1);
    if (iEnd <= iStart) return;

    ctx.save();
    ctx.fillStyle = pal.world.terrainFill;
    ctx.beginPath();

    const firstX = iStart * terrain.sampleStep;
    const firstScreen = camera.worldToScreen(firstX, terrain.samples[iStart]);
    ctx.moveTo(firstScreen.x, camera.viewportHeight + 20);
    ctx.lineTo(firstScreen.x, firstScreen.y);

    for (let i = iStart + 1; i <= iEnd; i++) {
      const p = camera.worldToScreen(i * terrain.sampleStep, terrain.samples[i]);
      ctx.lineTo(p.x, p.y);
    }

    const lastScreen = camera.worldToScreen(iEnd * terrain.sampleStep, terrain.samples[iEnd]);
    ctx.lineTo(lastScreen.x, camera.viewportHeight + 20);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawMatch(
    ctx: CanvasRenderingContext2D,
    match: Match,
    camera: Camera,
    debug?: DebugOverlayOptions
  ): void {
    this.drawBackground(ctx, camera);
    this.drawTerrain(ctx, match.terrain, camera);

    // Draw stuck arrows on terrain behind or alongside characters
    for (const stuck of match.stuckArrows) {
      if (stuck.kind === 'terrain') {
        const tr = resolveStuckArrowTransform(stuck, match.players);
        this.drawArrowWorld(ctx, tr.tip, tr.angle, stuck.owner, camera);
      }
    }

    // Draw players
    for (const pid of ['blue', 'black'] as PlayerId[]) {
      const p = match.players[pid];
      this.drawArcherPose(ctx, p.pose, pid, camera, rigConfig, paletteConfig, debug);
    }

    // Draw arrows stuck in bones
    for (const stuck of match.stuckArrows) {
      if (stuck.kind === 'bone') {
        const tr = resolveStuckArrowTransform(stuck, match.players);
        this.drawArrowWorld(ctx, tr.tip, tr.angle, stuck.owner, camera);
      }
    }

    // Draw active flying arrow
    if (match.projectile && match.projectile.active) {
      this.drawArrowWorld(
        ctx,
        match.projectile.tip,
        match.projectile.angle,
        match.activePlayer,
        camera
      );
    }

    // Aim ghost & vector indicator during aiming
    if (match.phase === 'aiming') {
      const active = match.players[match.activePlayer];
      if (active.lastShot) {
        this.drawAimVector(
          ctx,
          active.pose.neck,
          active.lastShot.angle,
          active.lastShot.power,
          camera,
          paletteConfig.world.aimGhost,
          false
        );
      }
      if (match.currentAim.isAiming) {
        this.drawAimVector(
          ctx,
          active.pose.neck,
          match.currentAim.angle,
          match.currentAim.power,
          camera,
          paletteConfig.world.aimLine,
          true
        );
      }
    }
  }

  drawParticles(
    ctx: CanvasRenderingContext2D,
    particles: ParticleSystem,
    camera: Camera
  ): void {
    if (particles.particles.length === 0) return;
    ctx.save();
    for (const p of particles.particles) {
      const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      const s = camera.worldToScreen(p.x, p.y);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(1.5, p.radius * camera.scale), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawAimVector(
    ctx: CanvasRenderingContext2D,
    originWorld: Vec2,
    angle: number,
    power: number,
    camera: Camera,
    color: string,
    showLabel: boolean
  ): void {
    const start = camera.worldToScreen(originWorld.x, originWorld.y);
    const lenPx = 28 + power * 110;
    const dx = Math.cos(angle);
    const dy = -Math.sin(angle);
    const endX = start.x + dx * lenPx;
    const endY = start.y + dy * lenPx;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = showLabel ? 2.5 : 1.75;
    if (!showLabel) {
      ctx.setLineDash([5, 5]);
    }

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Arrowhead
    ctx.setLineDash([]);
    const headLen = 9;
    const screenAngle = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(
      endX - headLen * Math.cos(screenAngle - 0.45),
      endY - headLen * Math.sin(screenAngle - 0.45)
    );
    ctx.lineTo(
      endX - headLen * Math.cos(screenAngle + 0.45),
      endY - headLen * Math.sin(screenAngle + 0.45)
    );
    ctx.closePath();
    ctx.fill();

    if (showLabel) {
      const cosA = Math.cos(angle);
      const elevDeg = Math.round((Math.atan2(Math.sin(angle), Math.abs(cosA)) * 180) / Math.PI);
      const pct = Math.round(power * 100);
      const label = `${elevDeg}° · ${pct}%`;
      ctx.font = '700 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, endX + dx * 22, endY + dy * 18 - 6);
    }

    ctx.restore();
  }

  drawArrowWorld(
    ctx: CanvasRenderingContext2D,
    tipWorld: Vec2,
    angleWorld: number,
    owner: PlayerId,
    camera: Camera,
    cfg: RigConfig = rigConfig,
    pal: PaletteConfig = paletteConfig
  ): void {
    const len = physicsConfig.arrowLength;
    const tailWorld: Vec2 = {
      x: tipWorld.x - Math.cos(angleWorld) * len,
      y: tipWorld.y - Math.sin(angleWorld) * len,
    };

    const sTail = camera.worldToScreen(tailWorld.x, tailWorld.y);
    const sTip = camera.worldToScreen(tipWorld.x, tipWorld.y);

    const svgAsset = this.assetLoader.getAsset('arrow', owner);
    if (svgAsset) {
      this.drawBoneAlignedSvg(
        ctx,
        svgAsset,
        cfg.arrow.tail,
        cfg.arrow.tip,
        sTail,
        sTip,
        1,
        1,
        cfg.arrow.widthScale,
        cfg.arrow.rotationOffset
      );
      return;
    }

    // Geometric fallback
    const screenAngle = Math.atan2(sTip.y - sTail.y, sTip.x - sTail.x);
    const pxLen = Math.hypot(sTip.x - sTail.x, sTip.y - sTail.y);
    const p = pal.players[owner];

    ctx.save();
    ctx.translate(sTail.x, sTail.y);
    ctx.rotate(screenAngle);

    ctx.strokeStyle = p.arrowShaft;
    ctx.lineWidth = Math.max(1.8, 0.03 * camera.scale);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(pxLen - 6, 0);
    ctx.stroke();

    // Fletching
    ctx.strokeStyle = p.arrowFletching;
    ctx.lineWidth = Math.max(1.8, 0.025 * camera.scale);
    ctx.beginPath();
    ctx.moveTo(0, -3.5);
    ctx.lineTo(pxLen * 0.16, 0);
    ctx.lineTo(0, 3.5);
    ctx.stroke();

    // Tip triangle
    ctx.fillStyle = '#1A1A1D';
    ctx.beginPath();
    ctx.moveTo(pxLen, 0);
    ctx.lineTo(pxLen - 8, -3.5);
    ctx.lineTo(pxLen - 8, 3.5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  drawArcherPose(
    ctx: CanvasRenderingContext2D,
    pose: RigPose,
    playerId: PlayerId,
    camera: Camera,
    cfg: RigConfig = rigConfig,
    pal: PaletteConfig = paletteConfig,
    debug?: DebugOverlayOptions
  ): void {
    const palette = pal.players[playerId];

    // Precompute bow string attachment screen positions (aligned with bow SVG if loaded)
    const bowAsset = this.assetLoader.getAsset('bow', playerId);
    const bowEnds = this.computeBowStringScreenEnds(pose, bowAsset, camera, cfg);

    for (const layer of cfg.zOrder) {
      this.drawLayer(
        ctx,
        layer,
        pose,
        playerId,
        palette,
        bowAsset,
        bowEnds,
        camera,
        cfg,
        pal
      );
    }

    if (debug && (debug.showBones || debug.showHitboxes || debug.showAnchors)) {
      this.drawDebugOverlay(ctx, pose, camera, debug);
    }
  }

  private drawLayer(
    ctx: CanvasRenderingContext2D,
    layer: DrawLayer,
    pose: RigPose,
    playerId: PlayerId,
    palette: PaletteConfig['players']['blue'],
    bowAsset: LoadedSvgAsset | null,
    bowEnds: { top: Vec2; bottom: Vec2 },
    camera: Camera,
    cfg: RigConfig,
    pal: PaletteConfig
  ): void {
    switch (layer) {
      case 'legBack':
        this.drawBonePart(ctx, 'thigh', pose.bones.thighBack, pose.facing, playerId, palette.bodyDetail, 0.11, camera, cfg);
        this.drawBonePart(ctx, 'shin', pose.bones.shinBack, pose.facing, playerId, palette.bodyDetail, 0.095, camera, cfg);
        break;
      case 'armBack':
        this.drawBonePart(ctx, 'upperArm', pose.bones.upperArmBack, pose.facing, playerId, palette.bodyDetail, 0.085, camera, cfg);
        this.drawBonePart(ctx, 'forearm', pose.bones.forearmBack, pose.facing, playerId, palette.bodyDetail, 0.075, camera, cfg);
        break;
      case 'torso':
        this.drawBonePart(ctx, 'torso', pose.bones.torso, pose.facing, playerId, palette.bodyPrimary, 0.16, camera, cfg);
        break;
      case 'head':
        this.drawHead(ctx, pose, playerId, palette.bodyPrimary, camera, cfg);
        break;
      case 'legFront':
        this.drawBonePart(ctx, 'thigh', pose.bones.thighFront, pose.facing, playerId, palette.bodyPrimary, 0.115, camera, cfg);
        this.drawBonePart(ctx, 'shin', pose.bones.shinFront, pose.facing, playerId, palette.bodyPrimary, 0.1, camera, cfg);
        break;
      case 'bow':
        this.drawBow(ctx, pose, bowAsset, bowEnds, palette, camera, cfg, pal);
        break;
      case 'nockedArrow':
        if (pose.bow.showNockedArrow) {
          this.drawArrowWorld(ctx, pose.bow.nockedArrowTip, pose.bow.angle, playerId, camera, cfg, pal);
        }
        break;
      case 'armFront':
        this.drawBonePart(ctx, 'upperArm', pose.bones.upperArmFront, pose.facing, playerId, palette.bodyPrimary, 0.09, camera, cfg);
        this.drawBonePart(ctx, 'forearm', pose.bones.forearmFront, pose.facing, playerId, palette.bodyPrimary, 0.08, camera, cfg);
        break;
    }
  }

  private drawHead(
    ctx: CanvasRenderingContext2D,
    pose: RigPose,
    playerId: PlayerId,
    fallbackColor: string,
    camera: Camera,
    cfg: RigConfig
  ): void {
    const asset = this.assetLoader.getAsset('head', playerId);
    const sStart = camera.worldToScreen(pose.bones.head.start.x, pose.bones.head.start.y);
    const sEnd = camera.worldToScreen(pose.bones.head.end.x, pose.bones.head.end.y);

    if (asset) {
      const partCfg = cfg.parts.head;
      this.drawBoneAlignedSvg(
        ctx,
        asset,
        partCfg.anchor,
        partCfg.tip,
        sStart,
        sEnd,
        pose.facing,
        partCfg.lengthScale,
        partCfg.widthScale,
        partCfg.rotationOffset
      );
      return;
    }

    const center = camera.worldToScreen(pose.headCenter.x, pose.headCenter.y);
    const radiusPx = Math.max(3, pose.headRadius * camera.scale);
    ctx.save();
    ctx.fillStyle = fallbackColor;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawBonePart(
    ctx: CanvasRenderingContext2D,
    partName: PartName,
    bone: BoneSegment,
    facing: 1 | -1,
    playerId: PlayerId,
    fallbackColor: string,
    fallbackThicknessM: number,
    camera: Camera,
    cfg: RigConfig
  ): void {
    const sStart = camera.worldToScreen(bone.start.x, bone.start.y);
    const sEnd = camera.worldToScreen(bone.end.x, bone.end.y);

    const asset = this.assetLoader.getAsset(partName, playerId);
    if (asset) {
      const partCfg = cfg.parts[partName];
      this.drawBoneAlignedSvg(
        ctx,
        asset,
        partCfg.anchor,
        partCfg.tip,
        sStart,
        sEnd,
        facing,
        partCfg.lengthScale,
        partCfg.widthScale,
        partCfg.rotationOffset
      );
      return;
    }

    // Fallback capsule
    ctx.save();
    ctx.strokeStyle = fallbackColor;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(2, fallbackThicknessM * camera.scale);
    ctx.beginPath();
    ctx.moveTo(sStart.x, sStart.y);
    ctx.lineTo(sEnd.x, sEnd.y);
    ctx.stroke();
    ctx.restore();
  }

  private drawBoneAlignedSvg(
    ctx: CanvasRenderingContext2D,
    asset: LoadedSvgAsset,
    anchorVb: Vec2,
    tipVb: Vec2,
    sStart: Vec2,
    sEnd: Vec2,
    facing: 1 | -1,
    lengthScale: number,
    widthScale: number,
    rotationOffsetDeg: number
  ): void {
    const r = asset.rasterScale;
    const ax = anchorVb.x * r;
    const ay = anchorVb.y * r;
    const tx = tipVb.x * r;
    const ty = tipVb.y * r;

    const svgDx = tx - ax;
    const svgDy = ty - ay;
    const svgLen = Math.hypot(svgDx, svgDy);
    if (svgLen < 1e-4) return;
    const svgAngle = Math.atan2(svgDy, svgDx);

    const screenDx = sEnd.x - sStart.x;
    const screenDy = sEnd.y - sStart.y;
    const screenLen = Math.hypot(screenDx, screenDy);
    const screenAngle = Math.atan2(screenDy, screenDx);

    const scaleLen = (screenLen / svgLen) * lengthScale;
    const scaleWid = (screenLen / svgLen) * widthScale;
    const rotOffsetRad = ((rotationOffsetDeg * Math.PI) / 180) * facing;

    ctx.save();
    ctx.translate(sStart.x, sStart.y);
    ctx.rotate(screenAngle + rotOffsetRad);
    ctx.scale(scaleLen, scaleWid * facing);
    ctx.rotate(-svgAngle);
    ctx.translate(-ax, -ay);
    ctx.drawImage(asset.image, 0, 0);
    ctx.restore();
  }

  private computeBowStringScreenEnds(
    pose: RigPose,
    bowAsset: LoadedSvgAsset | null,
    camera: Camera,
    cfg: RigConfig
  ): { top: Vec2; bottom: Vec2 } {
    if (!bowAsset) {
      return {
        top: camera.worldToScreen(pose.bow.stringTop.x, pose.bow.stringTop.y),
        bottom: camera.worldToScreen(pose.bow.stringBottom.x, pose.bow.stringBottom.y),
      };
    }

    const bCfg = cfg.bow;
    const r = bowAsset.rasterScale;
    const svgSpan = Math.hypot(
      (bCfg.stringBottom.x - bCfg.stringTop.x) * r,
      (bCfg.stringBottom.y - bCfg.stringTop.y) * r
    );
    const targetPxLen = bCfg.length * camera.scale;
    const scale = svgSpan > 1e-4 ? targetPxLen / svgSpan : 1;

    const gripScreen = camera.worldToScreen(pose.bow.grip.x, pose.bow.grip.y);
    const screenAngle = -pose.bow.angle + ((bCfg.rotationOffset * Math.PI) / 180) * pose.facing;

    const transformPt = (pt: Vec2): Vec2 => {
      const lx = (pt.x - bCfg.grip.x) * r * scale;
      const ly = (pt.y - bCfg.grip.y) * r * scale * pose.facing;
      const cos = Math.cos(screenAngle);
      const sin = Math.sin(screenAngle);
      return {
        x: gripScreen.x + lx * cos - ly * sin,
        y: gripScreen.y + lx * sin + ly * cos,
      };
    };

    return {
      top: transformPt(bCfg.stringTop),
      bottom: transformPt(bCfg.stringBottom),
    };
  }

  private drawBow(
    ctx: CanvasRenderingContext2D,
    pose: RigPose,
    bowAsset: LoadedSvgAsset | null,
    bowEnds: { top: Vec2; bottom: Vec2 },
    palette: PaletteConfig['players']['blue'],
    camera: Camera,
    cfg: RigConfig,
    pal: PaletteConfig
  ): void {
    const nockScreen = camera.worldToScreen(pose.bow.nockPoint.x, pose.bow.nockPoint.y);

    // Bowstring
    ctx.save();
    ctx.strokeStyle = pal.world.bowString;
    ctx.lineWidth = Math.max(1.2, 0.018 * camera.scale);
    ctx.beginPath();
    ctx.moveTo(bowEnds.top.x, bowEnds.top.y);
    ctx.lineTo(nockScreen.x, nockScreen.y);
    ctx.lineTo(bowEnds.bottom.x, bowEnds.bottom.y);
    ctx.stroke();
    ctx.restore();

    const gripScreen = camera.worldToScreen(pose.bow.grip.x, pose.bow.grip.y);
    const screenAngle = -pose.bow.angle + ((cfg.bow.rotationOffset * Math.PI) / 180) * pose.facing;

    if (bowAsset) {
      const bCfg = cfg.bow;
      const r = bowAsset.rasterScale;
      const svgSpan = Math.hypot(
        (bCfg.stringBottom.x - bCfg.stringTop.x) * r,
        (bCfg.stringBottom.y - bCfg.stringTop.y) * r
      );
      const targetPxLen = bCfg.length * camera.scale;
      const scale = svgSpan > 1e-4 ? targetPxLen / svgSpan : 1;

      ctx.save();
      ctx.translate(gripScreen.x, gripScreen.y);
      ctx.rotate(screenAngle);
      ctx.scale(scale * bCfg.widthScale, scale * pose.facing);
      ctx.translate(-bCfg.grip.x * r, -bCfg.grip.y * r);
      ctx.drawImage(bowAsset.image, 0, 0);
      ctx.restore();
      return;
    }

    // Geometric bow arc fallback
    const halfSpanPx = Math.hypot(bowEnds.top.x - bowEnds.bottom.x, bowEnds.top.y - bowEnds.bottom.y) * 0.5;
    const radiusPx = Math.max(8, halfSpanPx * 1.15);
    const arcCenterOffset = Math.sqrt(Math.max(0, radiusPx * radiusPx - halfSpanPx * halfSpanPx));
    const bowMidX = (bowEnds.top.x + bowEnds.bottom.x) * 0.5;
    const bowMidY = (bowEnds.top.y + bowEnds.bottom.y) * 0.5;
    const fwdX = Math.cos(screenAngle);
    const fwdY = Math.sin(screenAngle);
    const arcCenterX = bowMidX - fwdX * arcCenterOffset;
    const arcCenterY = bowMidY - fwdY * arcCenterOffset;
    const a1 = Math.atan2(bowEnds.top.y - arcCenterY, bowEnds.top.x - arcCenterX);
    const a2 = Math.atan2(bowEnds.bottom.y - arcCenterY, bowEnds.bottom.x - arcCenterX);

    ctx.save();
    ctx.strokeStyle = palette.bowWood;
    ctx.lineWidth = Math.max(2.5, 0.045 * camera.scale);
    ctx.lineCap = 'round';
    ctx.beginPath();
    // Draw shorter arc facing forward
    const diff = ((a2 - a1 + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    ctx.arc(arcCenterX, arcCenterY, radiusPx, a1, a2, diff < 0);
    ctx.stroke();
    ctx.restore();
  }

  private drawDebugOverlay(
    ctx: CanvasRenderingContext2D,
    pose: RigPose,
    camera: Camera,
    debug: DebugOverlayOptions
  ): void {
    ctx.save();

    if (debug.showHitboxes) {
      const hbs = extractHitboxes(pose);
      ctx.strokeStyle = 'rgba(210, 40, 40, 0.75)';
      ctx.fillStyle = 'rgba(210, 40, 40, 0.12)';
      ctx.lineWidth = 1.5;

      for (const hb of hbs) {
        const sa = camera.worldToScreen(hb.a.x, hb.a.y);
        const sb = camera.worldToScreen(hb.b.x, hb.b.y);
        const rPx = hb.radius * camera.scale;
        if (hb.kind === 'circle') {
          ctx.beginPath();
          ctx.arc(sa.x, sa.y, rPx, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          const ang = Math.atan2(sb.y - sa.y, sb.x - sa.x);
          ctx.beginPath();
          ctx.arc(sa.x, sa.y, rPx, ang + Math.PI * 0.5, ang + Math.PI * 1.5);
          ctx.arc(sb.x, sb.y, rPx, ang - Math.PI * 0.5, ang + Math.PI * 0.5);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    if (debug.showBones) {
      ctx.strokeStyle = '#0B84FF';
      ctx.lineWidth = 2;
      for (const bone of Object.values(pose.bones)) {
        const s = camera.worldToScreen(bone.start.x, bone.start.y);
        const e = camera.worldToScreen(bone.end.x, bone.end.y);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(e.x, e.y);
        ctx.stroke();
      }
    }

    if (debug.showAnchors) {
      for (const bone of Object.values(pose.bones)) {
        const s = camera.worldToScreen(bone.start.x, bone.start.y);
        const e = camera.worldToScreen(bone.end.x, bone.end.y);
        ctx.fillStyle = '#00C853';
        ctx.beginPath();
        ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FF9100';
        ctx.beginPath();
        ctx.arc(e.x, e.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }
}
