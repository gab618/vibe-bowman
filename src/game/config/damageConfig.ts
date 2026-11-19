export type HitZone = 'head' | 'torso' | 'arm' | 'leg';

export interface HitContext {
  zone: HitZone;
  boneId: string;
  impactSpeed: number;
}

export const damageConfig = {
  maxHp: 100,
  zoneDamage: {
    head: 100,
    torso: 34,
    arm: 34,
    leg: 34,
  } as Record<HitZone, number>,
  hitboxRadii: {
    head: 0.13,
    torso: 0.12,
    arm: 0.06,
    leg: 0.07,
  } as Record<HitZone, number>,
};

export function computeHitDamage(ctx: HitContext): number {
  return damageConfig.zoneDamage[ctx.zone];
}
