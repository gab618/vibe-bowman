import { describe, expect, it } from 'vitest';
import { buildRigPose, solveTwoBoneIK } from '../game/rig';

describe('IK de 2 ossos e Rig', () => {
  it('alcança o alvo com precisão quando dentro do alcance', () => {
    const root = { x: 0, y: 1 };
    const target = { x: 0.42, y: 1.15 };
    const l1 = 0.3;
    const l2 = 0.28;

    const { joint, end } = solveTwoBoneIK(root, target, l1, l2, { x: -0.5, y: 1 });

    expect(end.x).toBeCloseTo(target.x, 4);
    expect(end.y).toBeCloseTo(target.y, 4);

    const d1 = Math.hypot(joint.x - root.x, joint.y - root.y);
    const d2 = Math.hypot(end.x - joint.x, end.y - joint.y);
    expect(d1).toBeCloseTo(l1, 4);
    expect(d2).toBeCloseTo(l2, 4);
  });

  it('estica o braço sem gerar NaN quando o alvo está fora do alcance ou coincidente', () => {
    const root = { x: 1, y: 2 };
    const farTarget = { x: 5, y: 5 };
    const l1 = 0.3;
    const l2 = 0.28;

    const far = solveTwoBoneIK(root, farTarget, l1, l2, { x: 0, y: 1 });
    expect(Number.isNaN(far.joint.x)).toBe(false);
    expect(Number.isNaN(far.joint.y)).toBe(false);
    expect(Number.isNaN(far.end.x)).toBe(false);
    expect(Number.isNaN(far.end.y)).toBe(false);
    expect(Math.hypot(far.end.x - root.x, far.end.y - root.y)).toBeCloseTo(l1 + l2, 4);

    const zero = solveTwoBoneIK(root, root, l1, l2, { x: 0, y: 1 });
    expect(Number.isNaN(zero.joint.x)).toBe(false);
    expect(Number.isNaN(zero.end.y)).toBe(false);
  });

  it('mantém cotovelo dobrado sem NaN durante mira máxima', () => {
    const pose = buildRigPose({
      mode: 'aim',
      groundPos: { x: 25, y: 0 },
      aimAngle: Math.PI / 4,
      power: 1,
    });
    expect(pose.facing).toBe(1);
    expect(pose.bones.forearmBack.end.x).not.toBeNaN();
    expect(pose.bones.upperArmBack.length).toBeCloseTo(0.3, 3);
  });
});
