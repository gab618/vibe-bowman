export interface Vec2 {
  x: number;
  y: number;
}

export type PartName =
  | 'head'
  | 'torso'
  | 'upperArm'
  | 'forearm'
  | 'thigh'
  | 'shin';

export interface BoneAssetConfig {
  src: string;
  anchor: Vec2;
  tip: Vec2;
  rotationOffset: number;
  lengthScale: number;
  widthScale: number;
}

export interface BowAssetConfig {
  src: string;
  grip: Vec2;
  stringTop: Vec2;
  stringBottom: Vec2;
  /** Physical distance between stringTop and stringBottom in meters */
  length: number;
  rotationOffset: number;
  widthScale: number;
}

export interface ArrowAssetConfig {
  src: string;
  tip: Vec2;
  tail: Vec2;
  rotationOffset: number;
  widthScale: number;
}

export type DrawLayer =
  | 'legBack'
  | 'armBack'
  | 'torso'
  | 'head'
  | 'legFront'
  | 'bow'
  | 'nockedArrow'
  | 'armFront';

export interface RigConfig {
  /** Rasterization multiplier relative to SVG viewBox size */
  assetRasterScale: number;
  skeleton: {
    pelvisHeight: number;
    torsoLength: number;
    headOffsetAboveNeck: number;
    headRadius: number;
    upperArmLength: number;
    forearmLength: number;
    thighLength: number;
    shinLength: number;
    footSpread: number;
    bowGripDistance: number;
    bowStringRestOffset: number;
    bowStringMaxDraw: number;
    hitRecoilDuration: number;
  };
  parts: Record<PartName, BoneAssetConfig>;
  bow: BowAssetConfig;
  arrow: ArrowAssetConfig;
  zOrder: DrawLayer[];
}

export function createDefaultRigConfig(): RigConfig {
  return {
    assetRasterScale: 4,
    skeleton: {
      pelvisHeight: 0.95,
      torsoLength: 0.55,
      headOffsetAboveNeck: 0.16,
      headRadius: 0.13,
      upperArmLength: 0.3,
      forearmLength: 0.28,
      thighLength: 0.45,
      shinLength: 0.45,
      footSpread: 0.35,
      bowGripDistance: 0.55,
      bowStringRestOffset: 0.15,
      bowStringMaxDraw: 0.45,
      hitRecoilDuration: 0.25,
    },
    parts: {
      head: {
        src: 'head.svg',
        anchor: { x: 75, y: 76 },
        tip: { x: 19, y: 55 },
        rotationOffset: -24,
        lengthScale: 1.44,
        widthScale: 1.28,
      },
      torso: {
        src: 'torso.svg',
        anchor: { x: 40, y: 125 },
        tip: { x: 40, y: 10 },
        rotationOffset: 0,
        lengthScale: 1.1,
        widthScale: 1.1,
      },
      upperArm: {
        src: 'upper-arm.svg',
        anchor: { x: 20, y: 7 },
        tip: { x: 106, y: 20 },
        rotationOffset: 0,
        lengthScale: 1.22,
        widthScale: 1.86,
      },
      forearm: {
        src: 'forearm.svg',
        anchor: { x: 15, y: 11 },
        tip: { x: 106, y: 15 },
        rotationOffset: 0,
        lengthScale: 1.66,
        widthScale: 2,
      },
      thigh: {
        src: 'thigh.svg',
        anchor: { x: 16, y: 22 },
        tip: { x: 134, y: 22 },
        rotationOffset: 0,
        lengthScale: 1.56,
        widthScale: 1.46,
      },
      shin: {
        src: 'shin.svg',
        anchor: { x: 16, y: 22 },
        tip: { x: 134, y: 22 },
        rotationOffset: 0,
        lengthScale: 1.3,
        widthScale: 1.5,
      },
    },
    bow: {
      src: 'bow.svg',
      grip: { x: 42, y: 120 },
      stringTop: { x: 16, y: 14 },
      stringBottom: { x: 16, y: 226 },
      length: 1.2,
      rotationOffset: 0,
      widthScale: 1,
    },
    arrow: {
      src: 'arrow.svg',
      tip: { x: 154, y: 16 },
      tail: { x: 10, y: 16 },
      rotationOffset: 0,
      widthScale: 1,
    },
    zOrder: [
      'legBack',
      'armBack',
      'torso',
      'head',
      'legFront',
      'bow',
      'nockedArrow',
      'armFront',
    ],
  };
}

export const rigConfig: RigConfig = createDefaultRigConfig();
