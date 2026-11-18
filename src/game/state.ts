export type GameScreenState = 'menu' | 'playing' | 'paused' | 'gameover' | 'sandbox';

export class StateMachine {
  private current: GameScreenState = 'menu';
  private beforeSandbox: GameScreenState = 'menu';

  get state(): GameScreenState {
    return this.current;
  }

  get stateBeforeSandbox(): GameScreenState {
    return this.beforeSandbox;
  }

  setState(next: GameScreenState): void {
    this.current = next;
  }

  toggleSandbox(): GameScreenState {
    if (this.current === 'sandbox') {
      // If returning from sandbox to an active match, keep it paused as specified
      this.current = this.beforeSandbox === 'playing' ? 'paused' : this.beforeSandbox;
    } else {
      this.beforeSandbox = this.current;
      this.current = 'sandbox';
    }
    return this.current;
  }

  exitSandbox(): GameScreenState {
    if (this.current === 'sandbox') {
      this.current = this.beforeSandbox === 'playing' ? 'paused' : this.beforeSandbox;
    }
    return this.current;
  }
}
