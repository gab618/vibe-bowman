import { describe, expect, it } from 'vitest';
import { computeHitDamage, damageConfig } from '../game/config/damageConfig';
import { paletteConfig } from '../game/config/paletteConfig';
import { ensureSvgDimensions, replaceSvgTokens } from '../game/assetLoader';

describe('Dano por zona', () => {
  it('headshot causa 100 de dano (morte instantânea)', () => {
    const dmg = computeHitDamage({ zone: 'head', boneId: 'head', impactSpeed: 30 });
    expect(dmg).toBe(100);
    expect(damageConfig.maxHp - dmg).toBeLessThanOrEqual(0);
  });

  it('três acertos no corpo (34) matam, mas dois não', () => {
    const torsoDmg = computeHitDamage({ zone: 'torso', boneId: 'torso', impactSpeed: 30 });
    const armDmg = computeHitDamage({ zone: 'arm', boneId: 'forearmFront', impactSpeed: 30 });
    const legDmg = computeHitDamage({ zone: 'leg', boneId: 'shinFront', impactSpeed: 30 });

    expect(torsoDmg).toBe(34);
    expect(armDmg).toBe(34);
    expect(legDmg).toBe(34);

    expect(damageConfig.maxHp - torsoDmg * 2).toBeGreaterThan(0);
    expect(damageConfig.maxHp - (torsoDmg + armDmg + legDmg)).toBeLessThanOrEqual(0);
  });
});

describe('Pipeline de tokens SVG', () => {
  it('substitui apenas os tokens sem diferenciar maiúsculas/minúsculas e preserva outras cores', () => {
    const raw = `
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="30" fill="#ff00ff" stroke="#00FFFF" />
        <rect x="0" y="0" width="10" height="10" style="fill:#FF8000;stroke:#123456" />
        <path d="M0 0" fill="#ABCDEF" />
      </svg>
    `;

    const out = replaceSvgTokens(raw, paletteConfig.players.blue);
    expect(out).toContain(`fill="${paletteConfig.players.blue.bodyPrimary}"`);
    expect(out).toContain(`stroke="${paletteConfig.players.blue.bodyDetail}"`);
    expect(out).toContain(`fill:${paletteConfig.players.blue.arrowShaft}`);
    expect(out).toContain('#123456');
    expect(out).toContain('#ABCDEF');
  });

  it('injeta width e height a partir do viewBox quando ausentes', () => {
    const raw = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 165"><rect /></svg>`;
    const res = ensureSvgDimensions(raw, 4);

    expect(res.viewBoxWidth).toBe(80);
    expect(res.viewBoxHeight).toBe(165);
    expect(res.svgText).toContain('width="320"');
    expect(res.svgText).toContain('height="660"');
  });
});
