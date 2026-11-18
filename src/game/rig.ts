import { damageConfig, type HitZone } from './config/damageConfig';
import { rigConfig, type RigConfig, type Vec2 } from './config/rigConfig';

export type BoneId =
  | 'torso'
  | 'head'
  | 'upperArmFront'
  | 'forearmFront'
  | 'upperArmBack'
  | 'forearmBack'
  | 'thighFront'
  | 'shinFront'
  | 'thighBack'
  | 'shinBack';

export interface BoneSegment {
  id: BoneId;
  zone: HitZone;
  start: Vec2;
  end: Vec2;
  /** Direction angle in world space (radians) */
  angle: number;
  length: number;
}

export interface BowPose {
  grip: Vec2;
  /** Aim angle in world space (radians) */
  angle: number;
  stringTop: Vec2;
  stringBottom: Vec2;
  nockPoint: Vec2;
  nockedArrowTip: Vec2;
  nockedArrowTail: Vec2;
  showNockedArrow: boolean;
}

export interface RigPose {
  facing: 1 | -1;
  pelvis: Vec2;
  neck: Vec2;
  headCenter: Vec2;
  headRadius: number;
  bones: Record<BoneId, BoneSegment>;
  bow: BowPose;
}

export interface HitboxShape {
  boneId: BoneId;
  zone: HitZone;
  kind: 'circle' | 'capsule';
  a: Vec2;
  b: Vec2;
  radius: number;
}

export type PoseInput =
  | {
      mode: 'idle';
      groundPos: Vec2;
      facing: 1 | -1;
      recoilOffsetAngle?: number;
      showNockedArrow?: boolean;
    }
  | {
      mode: 'aim';
      groundPos: Vec2;
      /** Aim angle in world coordinates (+x right, +y up) */
      aimAngle: number;
      /** Power [0, 1] */
      power: number;
      recoilOffsetAngle?: number;
      showNockedArrow?: boolean;
    };

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function makeBone(id: BoneId, zone: HitZone, start: Vec2, end: Vec2): BoneSegment {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return {
    id,
    zone,
    start,
    end,
    angle: Math.atan2(dy, dx),
    length: Math.hypot(dx, dy),
  };
}

/**
 * 2-bone analytical inverse kinematics in 2D.
 * Never returns NaN even when target is out of reach or coincident with root.
 */
export function solveTwoBoneIK(
  root: Vec2,
  target: Vec2,
  len1: number,
  len2: number,
  bendHint: Vec2
): { joint: Vec2; end: Vec2 } {
  const dx = target.x - root.x;
  const dy = target.y - root.y;
  const dist = Math.hypot(dx, dy);

  if (dist < 1e-6) {
    const hLen = Math.hypot(bendHint.x, bendHint.y);
    const hx = hLen > 1e-6 ? bendHint.x / hLen : 0;
    const hy = hLen > 1e-6 ? bendHint.y / hLen : 1;
    return {
      joint: { x: root.x + hx * len1, y: root.y + hy * len1 },
      end: { x: root.x + hx * (len1 - len2), y: root.y + hy * (len1 - len2) },
    };
  }

  const ux = dx / dist;
  const uy = dy / dist;

  // Out of reach: stretch straight toward target
  if (dist >= len1 + len2 - 1e-5) {
    return {
      joint: { x: root.x + ux * len1, y: root.y + uy * len1 },
      end: { x: root.x + ux * (len1 + len2), y: root.y + uy * (len1 + len2) },
    };
  }

  // Too close: fold toward bendHint
  const minReach = Math.abs(len1 - len2) + 1e-5;
  const effectiveDist = Math.max(dist, minReach);

  const cosA = clamp(
    (len1 * len1 + effectiveDist * effectiveDist - len2 * len2) / (2 * len1 * effectiveDist),
    -1,
    1
  );
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));

  // Two candidate perpendiculars: (-uy, ux) and (uy, -ux)
  const p1x = -uy;
  const p1y = ux;
  const dot1 = p1x * bendHint.x + p1y * bendHint.y;
  const sign = dot1 >= 0 ? 1 : -1;

  const px = p1x * sign;
  const py = p1y * sign;

  const joint: Vec2 = {
    x: root.x + ux * (len1 * cosA) + px * (len1 * sinA),
    y: root.y + uy * (len1 * cosA) + py * (len1 * sinA),
  };

  return {
    joint,
    end: dist < minReach ? { x: root.x + ux * minReach, y: root.y + uy * minReach } : { ...target },
  };
}

/**
 * Computes world-space skeleton pose from idle or aim parameters.
 */
export function buildRigPose(input: PoseInput, cfg: RigConfig = rigConfig): RigPose {
  const sk = cfg.skeleton;

  let facing: 1 | -1;
  let localAimAngle = 0;
  let power = 0;
  let isAiming = false;

  if (input.mode === 'idle') {
    facing = input.facing;
  } else {
    isAiming = true;
    power = clamp(input.power, 0, 1);
    const cosA = Math.cos(input.aimAngle);
    facing = cosA >= -1e-6 ? 1 : -1;
    // Local angle relative to facing horizontal: 0 = forward, +pi/2 = straight up
    localAimAngle = Math.atan2(Math.sin(input.aimAngle), Math.abs(cosA));
  }

  const recoil = input.recoilOffsetAngle ?? 0;

  // Compute local coordinates (facing = +1: +x forward, +y up) relative to groundPos
  const maxTorsoTilt = (15 * Math.PI) / 180;
  const maxHeadTilt = (35 * Math.PI) / 180;

  // In local coords, tilting backward leans toward -x (negative rotation from vertical +y)
  // Aiming up (localAimAngle > 0) tilts torso slightly back or leans with aim:
  // Plan: "Torso: inclina 0,2*theta (limite de +-15 deg); Cabeça: inclina 0,5*theta (limite de +-35 deg)"
  const torsoAimTilt = isAiming
    ? clamp(0.2 * localAimAngle, -maxTorsoTilt, maxTorsoTilt)
    : 0;
  const headAimTilt = isAiming
    ? clamp(0.5 * localAimAngle, -maxHeadTilt, maxHeadTilt)
    : 0;

  // Angle from vertical (+y = pi/2 in local math angle): tilting up/forward for negative angle, back for positive
  // Standard: aiming up (+theta) -> torso leans back slightly (+theta * 0.2 from vertical -> pi/2 + torsoTilt) or tilts toward aim?
  // Wait: if aiming up (+45°), leaning torso slightly back (angle = pi/2 + 0.2*theta) opens the chest toward the sky naturally;
  // Wait: if aiming down (-30°), leaning forward (pi/2 - 6°) looks natural too! Let's check: angle from +x = pi/2 + torsoAimTilt + recoil
  // Actually let's check what happens if torso tilts toward aim vs back:
  // Tilting back when aiming up: neck moves slightly -x, chest faces up!
  // Let's use `torsoAngleFromVertical = torsoAimTilt + recoil` where positive leans back (`-sin, +cos`) or forward (`+sin, +cos`):
  // Wait: in standard math coords, rotating vertical `(0, 1)` CCW by `+a` gives `(-sin a, cos a)` (leans back). Rotating CW by `a` (`(sin a, cos a)`) leans forward.
  // Actually, if you aim UP (`localAimAngle > 0`), you lean BACK slightly (`-sin(torsoAimTilt)`), and if you aim DOWN (`localAimAngle < 0`), you lean FORWARD (`-sin(negative) = +`).
  // And recoil when hit from front leans BACK (`recoil > 0`).
  const torsoBackLean = torsoAimTilt + recoil;

  const pelvisLocal: Vec2 = { x: 0, y: sk.pelvisHeight };
  const neckLocal: Vec2 = {
    x: pelvisLocal.x - Math.sin(torsoBackLean) * sk.torsoLength,
    y: pelvisLocal.y + Math.cos(torsoBackLean) * sk.torsoLength,
  };

  // Head anchor at neck, tip above head
  const headBackLean = headAimTilt + recoil * 1.1;
  // Wait: when aiming UP (+45°), head looks UP (tilts back, nose pointing up-right), so head top moves slightly back (-x, +y).
  const headTopDist = sk.headOffsetAboveNeck + sk.headRadius;
  const headTopLocal: Vec2 = {
    x: neckLocal.x - Math.sin(headBackLean) * headTopDist,
    y: neckLocal.y + Math.cos(headBackLean) * headTopDist,
  };
  const headCenterLocal: Vec2 = {
    x: neckLocal.x - Math.sin(headBackLean) * sk.headOffsetAboveNeck,
    y: neckLocal.y + Math.cos(headBackLean) * sk.headOffsetAboveNeck,
  };

  // Legs: fixed stance with feet separated by footSpread (0.35 m)
  const halfSpread = sk.footSpread * 0.5;
  const footFrontTarget: Vec2 = { x: halfSpread, y: 0 };
  const footBackTarget: Vec2 = { x: -halfSpread, y: 0 };
  const kneeFrontIK = solveTwoBoneIK(pelvisLocal, footFrontTarget, sk.thighLength, sk.shinLength, { x: 1, y: 0.1 });
  const kneeBackIK = solveTwoBoneIK(pelvisLocal, footBackTarget, sk.thighLength, sk.shinLength, { x: 1, y: 0.1 });

  // Arms & Bow
  let bowAngleLocal: number;
  let gripLocal: Vec2;
  let stringHandTarget: Vec2;
  let frontArmIK: { joint: Vec2; end: Vec2 };
  let backArmIK: { joint: Vec2; end: Vec2 };

  if (isAiming) {
    bowAngleLocal = localAimAngle;
    const dirX = Math.cos(bowAngleLocal);
    const dirY = Math.sin(bowAngleLocal);

    gripLocal = {
      x: neckLocal.x + dirX * sk.bowGripDistance,
      y: neckLocal.y + dirY * sk.bowGripDistance,
    };

    const pullDist = sk.bowStringRestOffset + sk.bowStringMaxDraw * power;
    stringHandTarget = {
      x: gripLocal.x - dirX * pullDist,
      y: gripLocal.y - dirY * pullDist,
    };

    // Front elbow bends slightly downward; back elbow bends backward and up
    frontArmIK = solveTwoBoneIK(neckLocal, gripLocal, sk.upperArmLength, sk.forearmLength, {
      x: dirY,
      y: -Math.max(0.2, Math.abs(dirX)),
    });
    backArmIK = solveTwoBoneIK(neckLocal, stringHandTarget, sk.upperArmLength, sk.forearmLength, {
      x: -0.5,
      y: 1.0,
    });
  } else {
    // Idle: relaxed arms holding bow lowered forward
    bowAngleLocal = -0.35;
    gripLocal = {
      x: neckLocal.x + 0.32,
      y: neckLocal.y - 0.34,
    };
    const dirX = Math.cos(bowAngleLocal);
    const dirY = Math.sin(bowAngleLocal);
    stringHandTarget = {
      x: gripLocal.x - dirX * sk.bowStringRestOffset,
      y: gripLocal.y - dirY * sk.bowStringRestOffset,
    };

    frontArmIK = solveTwoBoneIK(neckLocal, gripLocal, sk.upperArmLength, sk.forearmLength, {
      x: -0.3,
      y: -1,
    });
    backArmIK = solveTwoBoneIK(
      neckLocal,
      { x: neckLocal.x - 0.12, y: neckLocal.y - 0.48 },
      sk.upperArmLength,
      sk.forearmLength,
      { x: -1, y: -0.2 }
    );
  }

  // Bow string endpoints in local space (perpendicular to aim direction)
  const halfBowLen = cfg.bow.length * 0.5;
  const dirX = Math.cos(bowAngleLocal);
  const dirY = Math.sin(bowAngleLocal);
  const perpX = -dirY;
  const perpY = dirX;
  const stringRestBack = sk.bowStringRestOffset;

  const stringTopLocal: Vec2 = {
    x: gripLocal.x - dirX * stringRestBack + perpX * halfBowLen,
    y: gripLocal.y - dirY * stringRestBack + perpY * halfBowLen,
  };
  const stringBottomLocal: Vec2 = {
    x: gripLocal.x - dirX * stringRestBack - perpX * halfBowLen,
    y: gripLocal.y - dirY * stringRestBack - perpY * halfBowLen,
  };

  const nockPointLocal: Vec2 = isAiming
    ? stringHandTarget
    : {
        x: (stringTopLocal.x + stringBottomLocal.x) * 0.5,
        y: (stringTopLocal.y + stringBottomLocal.y) * 0.5,
      };

  // Nocked arrow: tail at nockPointLocal, pointing along bowAngleLocal
  const arrowLen = 0.8;
  const nockedArrowTailLocal = nockPointLocal;
  const nockedArrowTipLocal: Vec2 = {
    x: nockPointLocal.x + dirX * arrowLen,
    y: nockPointLocal.y + dirY * arrowLen,
  };

  const toWorld = (p: Vec2): Vec2 => ({
    x: input.groundPos.x + p.x * facing,
    y: input.groundPos.y + p.y,
  });

  const pelvis = toWorld(pelvisLocal);
  const neck = toWorld(neckLocal);
  const headTop = toWorld(headTopLocal);
  const headCenter = toWorld(headCenterLocal);

  const elbowFront = toWorld(frontArmIK.joint);
  const handFront = toWorld(frontArmIK.end);
  const elbowBack = toWorld(backArmIK.joint);
  const handBack = toWorld(backArmIK.end);

  const kneeFront = toWorld(kneeFrontIK.joint);
  const footFront = toWorld(kneeFrontIK.end);
  const kneeBack = toWorld(kneeBackIK.joint);
  const footBack = toWorld(kneeBackIK.end);

  const gripWorld = toWorld(gripLocal);
  const bowAngleWorld = facing === 1 ? bowAngleLocal : Math.PI - bowAngleLocal;

  return {
    facing,
    pelvis,
    neck,
    headCenter,
    headRadius: sk.headRadius,
    bones: {
      torso: makeBone('torso', 'torso', pelvis, neck),
      head: makeBone('head', 'head', neck, headTop),
      upperArmFront: makeBone('upperArmFront', 'arm', neck, elbowFront),
      forearmFront: makeBone('forearmFront', 'arm', elbowFront, handFront),
      upperArmBack: makeBone('upperArmBack', 'arm', neck, elbowBack),
      forearmBack: makeBone('forearmBack', 'arm', elbowBack, handBack),
      thighFront: makeBone('thighFront', 'leg', pelvis, kneeFront),
      shinFront: makeBone('shinFront', 'leg', kneeFront, footFront),
      thighBack: makeBone('thighBack', 'leg', pelvis, kneeBack),
      shinBack: makeBone('shinBack', 'leg', kneeBack, footBack),
    },
    bow: {
      grip: gripWorld,
      angle: bowAngleWorld,
      stringTop: toWorld(stringTopLocal),
      stringBottom: toWorld(stringBottomLocal),
      nockPoint: toWorld(nockPointLocal),
      nockedArrowTip: toWorld(nockedArrowTipLocal),
      nockedArrowTail: toWorld(nockedArrowTailLocal),
      showNockedArrow: input.showNockedArrow ?? isAiming,
    },
  };
}

export function extractHitboxes(pose: RigPose): HitboxShape[] {
  const r = damageConfig.hitboxRadii;
  return [
    {
      boneId: 'head',
      zone: 'head',
      kind: 'circle',
      a: pose.headCenter,
      b: pose.headCenter,
      radius: r.head,
    },
    {
      boneId: 'torso',
      zone: 'torso',
      kind: 'capsule',
      a: pose.bones.torso.start,
      b: pose.bones.torso.end,
      radius: r.torso,
    },
    {
      boneId: 'upperArmFront',
      zone: 'arm',
      kind: 'capsule',
      a: pose.bones.upperArmFront.start,
      b: pose.bones.upperArmFront.end,
      radius: r.arm,
    },
    {
      boneId: 'forearmFront',
      zone: 'arm',
      kind: 'capsule',
      a: pose.bones.forearmFront.start,
      b: pose.bones.forearmFront.end,
      radius: r.arm,
    },
    {
      boneId: 'upperArmBack',
      zone: 'arm',
      kind: 'capsule',
      a: pose.bones.upperArmBack.start,
      b: pose.bones.upperArmBack.end,
      radius: r.arm,
    },
    {
      boneId: 'forearmBack',
      zone: 'arm',
      kind: 'capsule',
      a: pose.bones.forearmBack.start,
      b: pose.bones.forearmBack.end,
      radius: r.arm,
    },
    {
      boneId: 'thighFront',
      zone: 'leg',
      kind: 'capsule',
      a: pose.bones.thighFront.start,
      b: pose.bones.thighFront.end,
      radius: r.leg,
    },
    {
      boneId: 'shinFront',
      zone: 'leg',
      kind: 'capsule',
      a: pose.bones.shinFront.start,
      b: pose.bones.shinFront.end,
      radius: r.leg,
    },
    {
      boneId: 'thighBack',
      zone: 'leg',
      kind: 'capsule',
      a: pose.bones.thighBack.start,
      b: pose.bones.thighBack.end,
      radius: r.leg,
    },
    {
      boneId: 'shinBack',
      zone: 'leg',
      kind: 'capsule',
      a: pose.bones.shinBack.start,
      b: pose.bones.shinBack.end,
      radius: r.leg,
    },
  ];
}
