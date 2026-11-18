import { Camera } from './camera';
import { damageConfig } from './config/damageConfig';
import { paletteConfig, type PlayerId } from './config/paletteConfig';
import type { Match } from './match';

export class Hud {
  draw(ctx: CanvasRenderingContext2D, match: Match, camera: Camera, isMuted: boolean): void {
    const w = camera.viewportWidth;
    const h = camera.viewportHeight;

    ctx.save();

    // Top-left: Blue player HP
    this.drawPlayerHpBar(ctx, 20, 18, 'AZUL', match.players.blue.hp, paletteConfig.players.blue.bodyPrimary, 'left');

    // Top-right (left of pause button): Black player HP
    this.drawPlayerHpBar(ctx, w - 72, 18, 'PRETO', match.players.black.hp, paletteConfig.players.black.bodyPrimary, 'right');

    // Top-center: Distance & Turn indicator
    const distM = Math.round(match.terrain.distance);
    const activeColor =
      match.activePlayer === 'blue'
        ? paletteConfig.players.blue.bodyPrimary
        : paletteConfig.players.black.bodyPrimary;
    const activeLabel = match.activePlayer === 'blue' ? 'AZUL' : 'PRETO';

    ctx.textAlign = 'center';
    ctx.fillStyle = '#1A1A1D';
    ctx.font = '800 15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(`Distância: ${distM}m`, w * 0.5, 32);

    ctx.fillStyle = activeColor;
    ctx.font = '700 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(`Vez do ${activeLabel}`, w * 0.5, 52);

    if (isMuted) {
      ctx.fillStyle = 'rgba(26, 26, 29, 0.55)';
      ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillText('SOM DESLIGADO (M)', w * 0.5, 70);
    }

    // Off-screen opponent indicator during aiming
    if (match.phase === 'aiming') {
      const opponentId: PlayerId = match.activePlayer === 'blue' ? 'black' : 'blue';
      const opp = match.players[opponentId];
      const oppScreen = camera.worldToScreen(opp.groundPos.x, opp.groundPos.y + 1.0);
      if (oppScreen.x < 16 || oppScreen.x > w - 16 || oppScreen.y < 16 || oppScreen.y > h - 16) {
        this.drawOffscreenIndicator(
          ctx,
          oppScreen.x,
          oppScreen.y,
          w,
          h,
          distM,
          paletteConfig.players[opponentId].bodyPrimary
        );
      }
    }

    // Center announcement ("HEADSHOT!", "ACERTO A 54m!", "ERROU!")
    if (match.announcement) {
      const t = match.announcement.age / match.announcement.duration;
      const scale = t < 0.15 ? 0.75 + (t / 0.15) * 0.35 : 1.1 - Math.min(0.1, (t - 0.15) * 0.2);
      const alpha = t > 0.75 ? Math.max(0, 1 - (t - 0.75) / 0.25) : 1;

      ctx.save();
      ctx.translate(w * 0.5, h * 0.34);
      ctx.scale(scale, scale);
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 40px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(244, 239, 230, 0.9)';
      ctx.strokeText(match.announcement.text, 0, 0);
      ctx.fillStyle = match.announcement.color;
      ctx.fillText(match.announcement.text, 0, 0);
      ctx.restore();
    }

    ctx.restore();
  }

  private drawPlayerHpBar(
    ctx: CanvasRenderingContext2D,
    anchorX: number,
    y: number,
    label: string,
    hp: number,
    color: string,
    align: 'left' | 'right'
  ): void {
    const barW = 170;
    const barH = 14;
    const x = align === 'left' ? anchorX : anchorX - barW;
    const frac = Math.max(0, Math.min(1, hp / damageConfig.maxHp));

    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.font = '800 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(`${label}  ${Math.ceil(hp)} HP`, anchorX, y + 11);

    const barY = y + 18;
    ctx.fillStyle = 'rgba(26, 26, 29, 0.14)';
    ctx.fillRect(x, barY, barW, barH);

    ctx.fillStyle = color;
    if (align === 'left') {
      ctx.fillRect(x, barY, barW * frac, barH);
    } else {
      ctx.fillRect(x + barW * (1 - frac), barY, barW * frac, barH);
    }

    ctx.strokeStyle = '#1A1A1D';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, barY, barW, barH);
  }

  private drawOffscreenIndicator(
    ctx: CanvasRenderingContext2D,
    targetX: number,
    targetY: number,
    viewW: number,
    viewH: number,
    distM: number,
    color: string
  ): void {
    const pad = 34;
    const cx = Math.max(pad, Math.min(viewW - pad, targetX));
    const cy = Math.max(92, Math.min(viewH - pad, targetY));
    const angle = Math.atan2(targetY - cy, targetX - cx);

    ctx.save();
    ctx.translate(cx, cy);

    // Arrow triangle pointing toward opponent
    ctx.save();
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-7, -7);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-7, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = color;
    ctx.font = '800 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = targetX > viewW * 0.5 ? 'right' : 'left';
    const textOffsetX = targetX > viewW * 0.5 ? -16 : 16;
    ctx.fillText(`${distM}m`, textOffsetX, 4);

    ctx.restore();
  }
}
