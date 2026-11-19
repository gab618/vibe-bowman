import './style.css';
import { AssetLoader } from './game/assetLoader';
import { AudioEngine } from './game/audio';
import { Camera } from './game/camera';
import type { PlayerId } from './game/config/paletteConfig';
import { Hud } from './game/hud';
import { HumanController, InputManager } from './game/input';
import { Match } from './game/match';
import { ParticleSystem } from './game/particles';
import { Renderer } from './game/renderer';
import { VisualSandbox } from './game/sandbox';
import { StateMachine } from './game/state';
import { UiManager } from './game/ui';
import { generateTerrain } from './game/terrain';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiLayer = document.getElementById('ui-layer') as HTMLElement;
const ctx = canvas.getContext('2d')!;

const stateMachine = new StateMachine();
const assetLoader = new AssetLoader();
const audio = new AudioEngine();
const camera = new Camera();
const particles = new ParticleSystem();
const renderer = new Renderer(assetLoader);
const hud = new Hud();

const controllers: Record<PlayerId, HumanController> = {
  blue: new HumanController('blue'),
  black: new HumanController('black'),
};

let match: Match | null = null;
let lastWinner: PlayerId | null = null;
const menuPreviewTerrain = generateTerrain(42);

const inputManager = new InputManager(
  canvas,
  controllers,
  () => stateMachine.state === 'playing' && (match?.canAim ?? false)
);

function startNewMatch(): void {
  audio.unlock();
  particles.clear();
  lastWinner = null;
  controllers.blue.cancelAim();
  controllers.black.cancelAim();
  match = new Match(controllers, camera, particles, audio, (winner) => {
    lastWinner = winner;
    stateMachine.setState('gameover');
    audio.stopTension();
    audio.stopWhoosh();
    ui.render(stateMachine.state, lastWinner);
  });
  inputManager.setActivePlayer('blue');
  stateMachine.setState('playing');
  ui.render(stateMachine.state, lastWinner);
}

function togglePause(): void {
  if (stateMachine.state === 'playing') {
    inputManager.cancelAll();
    audio.stopTension();
    audio.stopWhoosh();
    stateMachine.setState('paused');
    ui.render(stateMachine.state, lastWinner);
  } else if (stateMachine.state === 'paused') {
    stateMachine.setState('playing');
    ui.render(stateMachine.state, lastWinner);
  }
}

function toggleSandbox(): void {
  const prev = stateMachine.state;
  const next = stateMachine.toggleSandbox();
  if (next === 'sandbox') {
    inputManager.cancelAll();
    audio.stopTension();
    audio.stopWhoosh();
    ui.render('sandbox', lastWinner);
    sandbox.enter();
  } else if (prev === 'sandbox') {
    sandbox.exit();
    ui.render(next, lastWinner);
  }
}

const sandbox = new VisualSandbox(uiLayer, assetLoader, () => {
  if (stateMachine.state === 'sandbox') {
    toggleSandbox();
  }
});

const ui = new UiManager(uiLayer, {
  onStartMatch: () => startNewMatch(),
  onPause: () => togglePause(),
  onResume: () => togglePause(),
  onRestartMatch: () => startNewMatch(),
  onExitToMenu: () => {
    inputManager.cancelAll();
    audio.stopTension();
    audio.stopWhoosh();
    match = null;
    lastWinner = null;
    stateMachine.setState('menu');
    ui.render(stateMachine.state, lastWinner);
  },
  onOpenSandbox: () => toggleSandbox(),
});

// Resize & DPR handling
let cssWidth = window.innerWidth;
let cssHeight = window.innerHeight;
let dpr = Math.min(window.devicePixelRatio || 1, 2);

function handleResize(): void {
  cssWidth = window.innerWidth;
  cssHeight = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
  canvas.height = Math.max(1, Math.floor(cssHeight * dpr));
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  camera.setViewport(cssWidth, cssHeight);
}

window.addEventListener('resize', handleResize);
handleResize();

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const key = e.key.toLowerCase();

  if (key === 'v') {
    toggleSandbox();
    return;
  }

  if (key === 'm') {
    audio.toggleMute();
    return;
  }

  if (stateMachine.state === 'sandbox') {
    if (e.key === 'Escape') {
      toggleSandbox();
    } else if (key === 'd') {
      sandbox.toggleDebug();
    } else if (key === 'r') {
      void sandbox.reloadAssets();
    }
    return;
  }

  if (e.key === 'Escape' || key === 'p') {
    if (stateMachine.state === 'playing' || stateMachine.state === 'paused') {
      togglePause();
    }
  }
});

// Load SVG assets (non-blocking; fallbacks render immediately)
void assetLoader.loadAll();
ui.render(stateMachine.state, lastWinner);

// Main animation loop
let lastTimestamp = performance.now();

function frame(now: number): void {
  const rawDt = (now - lastTimestamp) / 1000;
  lastTimestamp = now;
  const dt = Math.min(0.05, Math.max(0, rawDt));

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const curState = stateMachine.state;
  if (curState === 'sandbox') {
    sandbox.update(dt, cssWidth, cssHeight);
    sandbox.render(ctx, renderer);
  } else if (curState === 'menu') {
    camera.snapTo(menuPreviewTerrain.leftArcherX + menuPreviewTerrain.distance * 0.5, 1.5, 0.55);
    renderer.drawBackground(ctx, camera);
    renderer.drawTerrain(ctx, menuPreviewTerrain, camera);
  } else if (match) {
    if (curState === 'playing') {
      inputManager.setActivePlayer(match.activePlayer);
      match.update(dt);
    }
    renderer.drawMatch(ctx, match, camera);
    renderer.drawParticles(ctx, particles, camera);
    hud.draw(ctx, match, camera, audio.isMuted);
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
