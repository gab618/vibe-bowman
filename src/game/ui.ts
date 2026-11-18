import { paletteConfig, type PlayerId } from './config/paletteConfig';
import type { GameScreenState } from './state';

export interface UiActions {
  onStartMatch: () => void;
  onPause: () => void;
  onResume: () => void;
  onRestartMatch: () => void;
  onExitToMenu: () => void;
  onOpenSandbox: () => void;
}

export class UiManager {
  private root: HTMLElement;
  private actions: UiActions;
  private lastKey = '';

  constructor(root: HTMLElement, actions: UiActions) {
    this.root = root;
    this.actions = actions;
  }

  render(state: GameScreenState, winner: PlayerId | null): void {
    const key = `${state}:${winner ?? ''}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.root.innerHTML = '';

    if (state === 'sandbox') {
      return;
    }

    if (state === 'menu') {
      const overlay = document.createElement('div');
      overlay.className = 'ui-overlay';

      const title = document.createElement('h1');
      title.className = 'ui-title';
      title.textContent = 'BOWMAN';

      const sub = document.createElement('p');
      sub.className = 'ui-subtitle';
      sub.textContent = 'Duelo de arco e flecha · 2 Jogadores';

      const btns = document.createElement('div');
      btns.className = 'ui-buttons';

      const startBtn = document.createElement('button');
      startBtn.className = 'ui-btn';
      startBtn.textContent = 'Iniciar partida';
      startBtn.addEventListener('click', () => this.actions.onStartMatch());

      const sandboxBtn = document.createElement('button');
      sandboxBtn.className = 'ui-btn secondary';
      sandboxBtn.textContent = 'Visual Sandbox (V)';
      sandboxBtn.addEventListener('click', () => this.actions.onOpenSandbox());

      btns.append(startBtn, sandboxBtn);

      const hint = document.createElement('p');
      hint.className = 'ui-hint';
      hint.textContent = 'Arraste para trás para mirar e solte para atirar · M: som · V: Sandbox';

      overlay.append(title, sub, btns, hint);
      this.root.appendChild(overlay);
      return;
    }

    if (state === 'playing') {
      const pauseBtn = document.createElement('button');
      pauseBtn.className = 'pause-hud-btn';
      pauseBtn.title = 'Pausar (Esc / P)';
      pauseBtn.textContent = '⏸';
      pauseBtn.addEventListener('click', () => this.actions.onPause());
      this.root.appendChild(pauseBtn);
      return;
    }

    if (state === 'paused') {
      const overlay = document.createElement('div');
      overlay.className = 'ui-overlay';

      const title = document.createElement('h1');
      title.className = 'ui-title';
      title.style.fontSize = '2.4rem';
      title.textContent = 'PAUSADO';

      const btns = document.createElement('div');
      btns.className = 'ui-buttons';

      const resumeBtn = document.createElement('button');
      resumeBtn.className = 'ui-btn';
      resumeBtn.textContent = 'Continuar';
      resumeBtn.addEventListener('click', () => this.actions.onResume());

      const restartBtn = document.createElement('button');
      restartBtn.className = 'ui-btn secondary';
      restartBtn.textContent = 'Reiniciar partida';
      restartBtn.addEventListener('click', () => this.actions.onRestartMatch());

      const menuBtn = document.createElement('button');
      menuBtn.className = 'ui-btn secondary';
      menuBtn.textContent = 'Sair para o menu';
      menuBtn.addEventListener('click', () => this.actions.onExitToMenu());

      btns.append(resumeBtn, restartBtn, menuBtn);
      overlay.append(title, btns);
      this.root.appendChild(overlay);
      return;
    }

    if (state === 'gameover') {
      const overlay = document.createElement('div');
      overlay.className = 'ui-overlay';

      const title = document.createElement('h1');
      title.className = 'ui-winner';
      const isBlue = winner === 'blue';
      title.textContent = isBlue ? 'JOGADOR AZUL VENCEU!' : 'JOGADOR PRETO VENCEU!';
      title.style.color = isBlue
        ? paletteConfig.players.blue.bodyPrimary
        : paletteConfig.players.black.bodyPrimary;

      const btns = document.createElement('div');
      btns.className = 'ui-buttons';

      const playAgainBtn = document.createElement('button');
      playAgainBtn.className = 'ui-btn';
      playAgainBtn.textContent = 'Jogar novamente';
      playAgainBtn.addEventListener('click', () => this.actions.onRestartMatch());

      const menuBtn = document.createElement('button');
      menuBtn.className = 'ui-btn secondary';
      menuBtn.textContent = 'Menu';
      menuBtn.addEventListener('click', () => this.actions.onExitToMenu());

      btns.append(playAgainBtn, menuBtn);
      overlay.append(title, btns);
      this.root.appendChild(overlay);
    }
  }
}
