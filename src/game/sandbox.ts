import { AssetLoader } from './assetLoader';
import { Camera, clampZoom } from './camera';
import { paletteConfig, type PlayerId, type TokenName } from './config/paletteConfig';
import { physicsConfig } from './config/physicsConfig';
import { rigConfig, type PartName, type Vec2 } from './config/rigConfig';
import { ParticleSystem } from './particles';
import { Ragdoll } from './ragdoll';
import type { DebugOverlayOptions, Renderer } from './renderer';
import { buildRigPose, type RigPose } from './rig';
import type { Terrain } from './terrain';

type SelectableAsset = PartName | 'bow' | 'arrow';

const FLAT_TERRAIN: Terrain = {
  seed: 0,
  width: 100,
  sampleStep: 0.5,
  samples: new Float64Array(201),
  leftArcherX: 25,
  rightArcherX: 75,
  distance: 50,
  heightAt: () => 0,
  normalAt: () => ({ x: 0, y: 1 }),
  intersectSegment: (a, b) => {
    if (a.y >= 0 && b.y <= 0 && a.y !== b.y) {
      const t = a.y / (a.y - b.y);
      return { t, point: { x: a.x + (b.x - a.x) * t, y: 0 }, normal: { x: 0, y: 1 } };
    }
    return null;
  },
};

export class VisualSandbox {
  private camera = new Camera();
  private particles = new ParticleSystem();
  private time = 0;
  private ragdollTimer = 0;
  private particleTimer = 0;
  private ragdollBlue: Ragdoll | null = null;
  private ragdollBlack: Ragdoll | null = null;

  private zoom = 1.15;
  private aimAngleDeg = 45;
  private aimPower = 1.0;
  private selectedAsset: SelectableAsset = 'torso';
  private debug: DebugOverlayOptions = {
    showBones: false,
    showHitboxes: false,
    showAnchors: false,
  };

  private panelEl: HTMLElement | null = null;

  constructor(
    private uiRoot: HTMLElement,
    private assetLoader: AssetLoader,
    private onExit: () => void
  ) {
    this.camera.snapTo(0, 1.35, this.zoom);
  }

  enter(): void {
    this.time = 0;
    this.ragdollTimer = 0;
    this.particleTimer = 0;
    this.particles.clear();
    this.spawnRagdolls();
    this.buildPanel();
  }

  exit(): void {
    if (this.panelEl) {
      this.panelEl.remove();
      this.panelEl = null;
    }
  }

  toggleDebug(): void {
    const anyOn = this.debug.showBones || this.debug.showHitboxes || this.debug.showAnchors;
    const next = !anyOn;
    this.debug.showBones = next;
    this.debug.showHitboxes = next;
    this.debug.showAnchors = next;
    const cb = this.panelEl?.querySelector<HTMLInputElement>('#sb-debug-cb');
    if (cb) cb.checked = next;
  }

  async reloadAssets(): Promise<void> {
    await this.assetLoader.reloadAssets(paletteConfig);
  }

  private spawnRagdolls(): void {
    const poseB = buildRigPose({
      mode: 'aim',
      groundPos: { x: 5.5, y: 0 },
      aimAngle: Math.PI / 4,
      power: 0.7,
    });
    this.ragdollBlue = new Ragdoll(poseB, poseB.neck, { x: 22, y: 6 });

    const poseK = buildRigPose({
      mode: 'aim',
      groundPos: { x: 7.4, y: 0 },
      aimAngle: Math.PI - Math.PI / 4,
      power: 0.7,
    });
    this.ragdollBlack = new Ragdoll(poseK, poseK.neck, { x: -22, y: 6 });
  }

  update(dt: number, viewportW: number, viewportH: number): void {
    this.camera.setViewport(viewportW, viewportH);
    this.camera.snapTo(2.4, 1.4, this.zoom);

    this.time += dt;
    this.ragdollTimer += dt;
    if (this.ragdollTimer >= 3.0) {
      this.ragdollTimer = 0;
      this.spawnRagdolls();
    }

    const subSteps = 2;
    const subDt = dt / subSteps;
    for (let i = 0; i < subSteps; i++) {
      this.ragdollBlue?.step(subDt, FLAT_TERRAIN);
      this.ragdollBlack?.step(subDt, FLAT_TERRAIN);
    }

    this.particleTimer += dt;
    if (this.particleTimer >= 0.85) {
      this.particleTimer = 0;
      this.particles.spawnBlood({ x: -0.7, y: 1.55 }, { x: 1, y: 0.3 }, 10);
      this.particles.spawnDust({ x: 1.4, y: 0.05 }, { x: 0, y: 1 }, 8);
    }
    this.particles.update(dt);
  }

  render(ctx: CanvasRenderingContext2D, renderer: Renderer): void {
    renderer.drawBackground(ctx, this.camera);

    // Flat reference ground line + subtle dark ground strip
    const groundY = this.camera.worldToScreen(0, 0).y;
    ctx.save();
    ctx.fillStyle = paletteConfig.world.terrainFill;
    ctx.fillRect(0, groundY, this.camera.viewportWidth, this.camera.viewportHeight - groundY);
    ctx.restore();

    const recoilPhase = (this.time % 1.0) / 0.25;
    const recoil = recoilPhase <= 1 ? Math.sin(recoilPhase * Math.PI) * 0.35 : 0;
    const aimRad = (this.aimAngleDeg * Math.PI) / 180;

    // 4 states side-by-side (blue + black pairs)
    const pairs: Array<{
      label: string;
      centerX: number;
      bluePose: RigPose;
      blackPose: RigPose;
    }> = [
      {
        label: 'Parado',
        centerX: -4.2,
        bluePose: buildRigPose({ mode: 'idle', groundPos: { x: -4.9, y: 0 }, facing: 1, showNockedArrow: true }),
        blackPose: buildRigPose({ mode: 'idle', groundPos: { x: -3.5, y: 0 }, facing: -1, showNockedArrow: true }),
      },
      {
        label: `Mirando (${this.aimAngleDeg}° · ${Math.round(this.aimPower * 100)}%)`,
        centerX: -1.4,
        bluePose: buildRigPose({ mode: 'aim', groundPos: { x: -2.1, y: 0 }, aimAngle: aimRad, power: this.aimPower }),
        blackPose: buildRigPose({
          mode: 'aim',
          groundPos: { x: -0.7, y: 0 },
          aimAngle: Math.PI - aimRad,
          power: this.aimPower,
        }),
      },
      {
        label: 'Atingido + Flecha Cravada',
        centerX: 2.3,
        bluePose: buildRigPose({
          mode: 'idle',
          groundPos: { x: 1.6, y: 0 },
          facing: 1,
          recoilOffsetAngle: recoil,
        }),
        blackPose: buildRigPose({
          mode: 'idle',
          groundPos: { x: 3.0, y: 0 },
          facing: -1,
          recoilOffsetAngle: recoil,
        }),
      },
    ];

    for (const pair of pairs) {
      renderer.drawArcherPose(ctx, pair.bluePose, 'blue', this.camera, rigConfig, paletteConfig, this.debug);
      renderer.drawArcherPose(ctx, pair.blackPose, 'black', this.camera, rigConfig, paletteConfig, this.debug);
      this.drawLabel(ctx, pair.label, pair.centerX, -0.45);
    }

    // Stuck arrow on the "Atingido" blue dummy torso
    const hitTorso = pairs[2].bluePose.bones.torso;
    const hitMid: Vec2 = {
      x: (hitTorso.start.x + hitTorso.end.x) * 0.5 + 0.05,
      y: (hitTorso.start.y + hitTorso.end.y) * 0.5 + 0.05,
    };
    renderer.drawArrowWorld(ctx, hitMid, -2.85, 'black', this.camera, rigConfig, paletteConfig);

    // Ragdoll pair
    if (this.ragdollBlue && this.ragdollBlack) {
      renderer.drawArcherPose(
        ctx,
        this.ragdollBlue.toRigPose(),
        'blue',
        this.camera,
        rigConfig,
        paletteConfig,
        this.debug
      );
      renderer.drawArcherPose(
        ctx,
        this.ragdollBlack.toRigPose(),
        'black',
        this.camera,
        rigConfig,
        paletteConfig,
        this.debug
      );
      this.drawLabel(ctx, 'Ragdoll (loop 3s)', 6.4, -0.45);
    }

    // Isolated arrows (blue & black) above center
    renderer.drawArrowWorld(ctx, { x: -3.2, y: 2.85 }, 0, 'blue', this.camera, rigConfig, paletteConfig);
    renderer.drawArrowWorld(ctx, { x: -1.8, y: 2.85 }, 0, 'black', this.camera, rigConfig, paletteConfig);
    this.drawLabel(ctx, 'Flechas (Azul / Preto)', -2.9, 3.15);

    // Particles
    renderer.drawParticles(ctx, this.particles, this.camera);
    this.drawLabel(ctx, 'Partículas', 0.35, 2.35);

    // Top-left Sandbox status bar
    ctx.save();
    ctx.fillStyle = '#1A1A1D';
    ctx.font = '800 16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('VISUAL SANDBOX (V ou Esc para sair)', 18, 28);
    ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillStyle = '#4A4A52';
    const assetStatus = this.assetLoader.hasAnySvg()
      ? 'SVGs carregados de public/assets/'
      : 'Modo fallback geométrico (nenhum SVG em public/assets/)';
    ctx.fillText(`D: debug · R: recarregar assets · ${assetStatus}`, 18, 48);
    ctx.restore();
  }

  private drawLabel(ctx: CanvasRenderingContext2D, text: string, wx: number, wy: number): void {
    const s = this.camera.worldToScreen(wx, wy);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '700 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillStyle = wy < 0 ? '#F4EFE6' : '#1A1A1D';
    ctx.fillText(text, s.x, s.y);
    ctx.restore();
  }

  private buildPanel(): void {
    if (this.panelEl) this.panelEl.remove();

    const panel = document.createElement('div');
    panel.className = 'sandbox-panel';
    this.panelEl = panel;

    const header = document.createElement('h2');
    header.innerHTML = '<span>Visual Sandbox</span>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'sandbox-btn secondary';
    closeBtn.textContent = 'Fechar (V)';
    closeBtn.addEventListener('click', () => this.onExit());
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // View & Pose controls
    const viewSec = document.createElement('div');
    viewSec.className = 'sandbox-section';
    viewSec.innerHTML = '<h3>Visualização & Pose</h3>';
    viewSec.appendChild(
      this.makeSlider('Zoom', physicsConfig.camera.minZoom, physicsConfig.camera.maxZoom, 0.05, this.zoom, (v) => {
        this.zoom = clampZoom(v);
      })
    );
    viewSec.appendChild(
      this.makeSlider('Ângulo (°)', -45, 90, 1, this.aimAngleDeg, (v) => {
        this.aimAngleDeg = v;
      })
    );
    viewSec.appendChild(
      this.makeSlider('Força', 0, 1, 0.02, this.aimPower, (v) => {
        this.aimPower = v;
      })
    );

    const debugRow = document.createElement('div');
    debugRow.className = 'sandbox-row';
    debugRow.innerHTML = '<label for="sb-debug-cb">Debug (D)</label>';
    const debugCb = document.createElement('input');
    debugCb.type = 'checkbox';
    debugCb.id = 'sb-debug-cb';
    debugCb.checked = this.debug.showBones;
    debugCb.addEventListener('change', () => {
      this.debug.showBones = debugCb.checked;
      this.debug.showHitboxes = debugCb.checked;
      this.debug.showAnchors = debugCb.checked;
    });
    debugRow.appendChild(debugCb);
    viewSec.appendChild(debugRow);
    panel.appendChild(viewSec);

    // Part selector + live rigConfig controls
    const partSec = document.createElement('div');
    partSec.className = 'sandbox-section';
    partSec.innerHTML = '<h3>Ajuste de Pivôs (rigConfig)</h3>';

    const selectRow = document.createElement('div');
    selectRow.className = 'sandbox-row';
    selectRow.innerHTML = '<label>Peça</label>';
    const select = document.createElement('select');
    const options: Array<[SelectableAsset, string]> = [
      ['head', 'head.svg'],
      ['torso', 'torso.svg'],
      ['upperArm', 'upper-arm.svg'],
      ['forearm', 'forearm.svg'],
      ['thigh', 'thigh.svg'],
      ['shin', 'shin.svg'],
      ['bow', 'bow.svg'],
      ['arrow', 'arrow.svg'],
    ];
    for (const [val, text] of options) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = text;
      opt.selected = val === this.selectedAsset;
      select.appendChild(opt);
    }
    selectRow.appendChild(select);
    partSec.appendChild(selectRow);

    const partControlsHost = document.createElement('div');
    partControlsHost.style.display = 'flex';
    partControlsHost.style.flexDirection = 'column';
    partControlsHost.style.gap = '6px';
    partSec.appendChild(partControlsHost);

    const renderPartControls = () => {
      partControlsHost.innerHTML = '';
      if (this.selectedAsset === 'bow') {
        const b = rigConfig.bow;
        partControlsHost.appendChild(this.makeSlider('grip.x', -50, 300, 1, b.grip.x, (v) => (b.grip.x = v)));
        partControlsHost.appendChild(this.makeSlider('grip.y', -50, 300, 1, b.grip.y, (v) => (b.grip.y = v)));
        partControlsHost.appendChild(this.makeSlider('top.x', -50, 300, 1, b.stringTop.x, (v) => (b.stringTop.x = v)));
        partControlsHost.appendChild(this.makeSlider('top.y', -50, 300, 1, b.stringTop.y, (v) => (b.stringTop.y = v)));
        partControlsHost.appendChild(this.makeSlider('bot.x', -50, 300, 1, b.stringBottom.x, (v) => (b.stringBottom.x = v)));
        partControlsHost.appendChild(this.makeSlider('bot.y', -50, 300, 1, b.stringBottom.y, (v) => (b.stringBottom.y = v)));
        partControlsHost.appendChild(this.makeSlider('rotOffset°', -180, 180, 1, b.rotationOffset, (v) => (b.rotationOffset = v)));
        partControlsHost.appendChild(this.makeSlider('widthScale', 0.4, 2.0, 0.05, b.widthScale, (v) => (b.widthScale = v)));
      } else if (this.selectedAsset === 'arrow') {
        const a = rigConfig.arrow;
        partControlsHost.appendChild(this.makeSlider('tip.x', -50, 300, 1, a.tip.x, (v) => (a.tip.x = v)));
        partControlsHost.appendChild(this.makeSlider('tip.y', -50, 300, 1, a.tip.y, (v) => (a.tip.y = v)));
        partControlsHost.appendChild(this.makeSlider('tail.x', -50, 300, 1, a.tail.x, (v) => (a.tail.x = v)));
        partControlsHost.appendChild(this.makeSlider('tail.y', -50, 300, 1, a.tail.y, (v) => (a.tail.y = v)));
        partControlsHost.appendChild(this.makeSlider('widthScale', 0.4, 2.5, 0.05, a.widthScale, (v) => (a.widthScale = v)));
      } else {
        const p = rigConfig.parts[this.selectedAsset];
        partControlsHost.appendChild(this.makeSlider('anchor.x', -50, 300, 1, p.anchor.x, (v) => (p.anchor.x = v)));
        partControlsHost.appendChild(this.makeSlider('anchor.y', -50, 300, 1, p.anchor.y, (v) => (p.anchor.y = v)));
        partControlsHost.appendChild(this.makeSlider('tip.x', -50, 300, 1, p.tip.x, (v) => (p.tip.x = v)));
        partControlsHost.appendChild(this.makeSlider('tip.y', -50, 300, 1, p.tip.y, (v) => (p.tip.y = v)));
        partControlsHost.appendChild(this.makeSlider('rotOffset°', -180, 180, 1, p.rotationOffset, (v) => (p.rotationOffset = v)));
        partControlsHost.appendChild(this.makeSlider('lengthScale', 0.5, 1.8, 0.02, p.lengthScale, (v) => (p.lengthScale = v)));
        partControlsHost.appendChild(this.makeSlider('widthScale', 0.5, 2.0, 0.02, p.widthScale, (v) => (p.widthScale = v)));
      }
    };

    select.addEventListener('change', () => {
      this.selectedAsset = select.value as SelectableAsset;
      renderPartControls();
    });
    renderPartControls();
    panel.appendChild(partSec);

    // Palette token color pickers
    const palSec = document.createElement('div');
    palSec.className = 'sandbox-section';
    palSec.innerHTML = '<h3>Paletas (Tokens)</h3>';

    const tokenLabels: Array<[TokenName, string]> = [
      ['bodyPrimary', 'Corpo principal'],
      ['bodyDetail', 'Corpo detalhe'],
      ['bowWood', 'Madeira arco'],
      ['arrowFletching', 'Penas flecha'],
      ['arrowShaft', 'Haste flecha'],
    ];

    for (const pid of ['blue', 'black'] as PlayerId[]) {
      const sub = document.createElement('div');
      sub.style.fontWeight = '700';
      sub.style.marginTop = '4px';
      sub.textContent = pid === 'blue' ? 'Jogador Azul' : 'Jogador Preto';
      palSec.appendChild(sub);

      for (const [token, label] of tokenLabels) {
        const row = document.createElement('div');
        row.className = 'sandbox-row';
        row.innerHTML = `<label>${label}</label>`;
        const picker = document.createElement('input');
        picker.type = 'color';
        picker.value = paletteConfig.players[pid][token];
        picker.addEventListener('input', () => {
          paletteConfig.players[pid][token] = picker.value.toUpperCase();
          void this.assetLoader.rebuildPalettes(paletteConfig);
        });
        row.appendChild(picker);
        palSec.appendChild(row);
      }
    }
    panel.appendChild(palSec);

    // Actions: Reload assets & Copy config
    const actSec = document.createElement('div');
    actSec.className = 'sandbox-section';
    const actions = document.createElement('div');
    actions.className = 'sandbox-actions';

    const reloadBtn = document.createElement('button');
    reloadBtn.className = 'sandbox-btn secondary';
    reloadBtn.textContent = 'Recarregar SVGs (R)';
    reloadBtn.addEventListener('click', () => void this.reloadAssets());

    const copyBtn = document.createElement('button');
    copyBtn.className = 'sandbox-btn';
    copyBtn.textContent = 'Copiar config';
    copyBtn.addEventListener('click', () => {
      const snippet = JSON.stringify(
        {
          parts: rigConfig.parts,
          bow: rigConfig.bow,
          arrow: rigConfig.arrow,
          playersPalette: paletteConfig.players,
        },
        null,
        2
      );
      void navigator.clipboard?.writeText(snippet).then(() => {
        copyBtn.textContent = 'Copiado!';
        setTimeout(() => (copyBtn.textContent = 'Copiar config'), 1500);
      });
    });

    actions.append(reloadBtn, copyBtn);
    actSec.appendChild(actions);
    panel.appendChild(actSec);

    this.uiRoot.appendChild(panel);
  }

  private makeSlider(
    label: string,
    min: number,
    max: number,
    step: number,
    initial: number,
    onChange: (val: number) => void
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'sandbox-row';

    const lbl = document.createElement('label');
    lbl.textContent = label;

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(initial);

    const valSpan = document.createElement('span');
    valSpan.className = 'val';
    valSpan.textContent = Number.isInteger(step) ? String(initial) : initial.toFixed(2);

    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      valSpan.textContent = Number.isInteger(step) ? String(v) : v.toFixed(2);
      onChange(v);
    });

    row.append(lbl, input, valSpan);
    return row;
  }
}
