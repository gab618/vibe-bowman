import { physicsConfig } from './config/physicsConfig';
import { rigConfig, type Vec2 } from './config/rigConfig';
import { extractHitboxes, type BoneId, type BoneSegment, type HitboxShape, type RigPose } from './rig';
import type { Terrain } from './terrain';

export type RagdollNodeId =
  | 'pelvis'
  | 'neck'
  | 'headTop'
  | 'elbowFront'
  | 'handFront'
  | 'elbowBack'
  | 'handBack'
  | 'kneeFront'
  | 'footFront'
  | 'kneeBack'
  | 'footBack';

interface VerletNode {
  id: RagdollNodeId;
  pos: Vec2;
  oldPos: Vec2;
  pinned?: boolean;
}

interface DistanceConstraint {
  a: number;
  b: number;
  restLength: number;
}

export class Ragdoll {
  private nodes: VerletNode[] = [];
  private indexById = new Map<RagdollNodeId, number>();
  private constraints: DistanceConstraint[] = [];
  private facing: 1 | -1;

  constructor(pose: RigPose, hitPoint?: Vec2, arrowVelocity?: Vec2) {
    this.facing = pose.facing;

    const addNode = (id: RagdollNodeId, p: Vec2) => {
      const idx = this.nodes.length;
      this.nodes.push({
        id,
        pos: { x: p.x, y: p.y },
        oldPos: { x: p.x, y: p.y },
      });
      this.indexById.set(id, idx);
      return idx;
    };

    const iPelvis = addNode('pelvis', pose.pelvis);
    const iNeck = addNode('neck', pose.neck);
    const iHeadTop = addNode('headTop', pose.bones.head.end);
    const iElbowF = addNode('elbowFront', pose.bones.upperArmFront.end);
    const iHandF = addNode('handFront', pose.bones.forearmFront.end);
    const iElbowB = addNode('elbowBack', pose.bones.upperArmBack.end);
    const iHandB = addNode('handBack', pose.bones.forearmBack.end);
    const iKneeF = addNode('kneeFront', pose.bones.thighFront.end);
    const iFootF = addNode('footFront', pose.bones.shinFront.end);
    const iKneeB = addNode('kneeBack', pose.bones.thighBack.end);
    const iFootB = addNode('footBack', pose.bones.shinBack.end);

    const addBoneConstraint = (a: number, b: number) => {
      const pa = this.nodes[a].pos;
      const pb = this.nodes[b].pos;
      this.constraints.push({
        a,
        b,
        restLength: Math.hypot(pb.x - pa.x, pb.y - pa.y),
      });
    };

    // Structural bones
    addBoneConstraint(iPelvis, iNeck);
    addBoneConstraint(iNeck, iHeadTop);
    addBoneConstraint(iNeck, iElbowF);
    addBoneConstraint(iElbowF, iHandF);
    addBoneConstraint(iNeck, iElbowB);
    addBoneConstraint(iElbowB, iHandB);
    addBoneConstraint(iPelvis, iKneeF);
    addBoneConstraint(iKneeF, iFootF);
    addBoneConstraint(iPelvis, iKneeB);
    addBoneConstraint(iKneeB, iFootB);

    // Stiffness diagonals so torso/head/hips don't collapse completely
    addBoneConstraint(iPelvis, iHeadTop);
    addBoneConstraint(iNeck, iKneeF);
    addBoneConstraint(iNeck, iKneeB);
    addBoneConstraint(iKneeF, iKneeB);

    if (hitPoint && arrowVelocity) {
      let closestIdx = iNeck;
      let closestDist = Infinity;
      for (let i = 0; i < this.nodes.length; i++) {
        const d = Math.hypot(this.nodes[i].pos.x - hitPoint.x, this.nodes[i].pos.y - hitPoint.y);
        if (d < closestDist) {
          closestDist = d;
          closestIdx = i;
        }
      }
      const impulseDt = physicsConfig.fixedDt * physicsConfig.ragdoll.impactImpulseScale;
      const n = this.nodes[closestIdx];
      n.oldPos.x = n.pos.x - arrowVelocity.x * impulseDt;
      n.oldPos.y = n.pos.y - arrowVelocity.y * impulseDt;
    }
  }

  step(dt: number, terrain: Terrain): void {
    const cfg = physicsConfig.ragdoll;
    const g = physicsConfig.gravity;
    const damping = cfg.damping;

    // Verlet integration
    for (const node of this.nodes) {
      if (node.pinned) continue;
      const vx = (node.pos.x - node.oldPos.x) * damping;
      const vy = (node.pos.y - node.oldPos.y) * damping;
      node.oldPos.x = node.pos.x;
      node.oldPos.y = node.pos.y;
      node.pos.x += vx;
      node.pos.y += vy - g * dt * dt;
    }

    // Solve distance constraints + terrain collision
    for (let iter = 0; iter < cfg.constraintIterations; iter++) {
      for (const c of this.constraints) {
        const a = this.nodes[c.a];
        const b = this.nodes[c.b];
        const dx = b.pos.x - a.pos.x;
        const dy = b.pos.y - a.pos.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 1e-6) continue;
        const diff = (dist - c.restLength) / dist;
        const offsetX = dx * 0.5 * diff;
        const offsetY = dy * 0.5 * diff;
        if (!a.pinned) {
          a.pos.x += offsetX;
          a.pos.y += offsetY;
        }
        if (!b.pinned) {
          b.pos.x -= offsetX;
          b.pos.y -= offsetY;
        }
      }

      for (const node of this.nodes) {
        const radius = node.id === 'headTop' ? rigConfig.skeleton.headRadius * 0.5 : 0.04;
        const groundY = terrain.heightAt(node.pos.x) + radius;
        if (node.pos.y < groundY) {
          const vx = node.pos.x - node.oldPos.x;
          const vy = node.pos.y - node.oldPos.y;
          node.pos.y = groundY;
          node.oldPos.x = node.pos.x - vx * cfg.groundFriction;
          node.oldPos.y = node.pos.y + vy * cfg.groundRestitution;
        }
      }
    }
  }

  private getNode(id: RagdollNodeId): Vec2 {
    const idx = this.indexById.get(id)!;
    return this.nodes[idx].pos;
  }

  toRigPose(): RigPose {
    const pelvis = this.getNode('pelvis');
    const neck = this.getNode('neck');
    const headTop = this.getNode('headTop');
    const elbowFront = this.getNode('elbowFront');
    const handFront = this.getNode('handFront');
    const elbowBack = this.getNode('elbowBack');
    const handBack = this.getNode('handBack');
    const kneeFront = this.getNode('kneeFront');
    const footFront = this.getNode('footFront');
    const kneeBack = this.getNode('kneeBack');
    const footBack = this.getNode('footBack');

    const makeBone = (id: BoneId, zone: BoneSegment['zone'], start: Vec2, end: Vec2): BoneSegment => {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      return {
        id,
        zone,
        start: { ...start },
        end: { ...end },
        angle: Math.atan2(dy, dx),
        length: Math.hypot(dx, dy),
      };
    };

    const headBone = makeBone('head', 'head', neck, headTop);
    const headDx = headTop.x - neck.x;
    const headDy = headTop.y - neck.y;
    const headLen = Math.hypot(headDx, headDy) || 1;
    const headCenter: Vec2 = {
      x: neck.x + (headDx / headLen) * rigConfig.skeleton.headOffsetAboveNeck,
      y: neck.y + (headDy / headLen) * rigConfig.skeleton.headOffsetAboveNeck,
    };

    // Bow falls attached to front hand
    const forearmAngle = Math.atan2(handFront.y - elbowFront.y, handFront.x - elbowFront.x);
    const bowAngle = forearmAngle;
    const halfBowLen = rigConfig.bow.length * 0.5;
    const dirX = Math.cos(bowAngle);
    const dirY = Math.sin(bowAngle);
    const perpX = -dirY;
    const perpY = dirX;
    const restBack = rigConfig.skeleton.bowStringRestOffset;

    const stringTop: Vec2 = {
      x: handFront.x - dirX * restBack + perpX * halfBowLen,
      y: handFront.y - dirY * restBack + perpY * halfBowLen,
    };
    const stringBottom: Vec2 = {
      x: handFront.x - dirX * restBack - perpX * halfBowLen,
      y: handFront.y - dirY * restBack - perpY * halfBowLen,
    };

    return {
      facing: this.facing,
      pelvis: { ...pelvis },
      neck: { ...neck },
      headCenter,
      headRadius: rigConfig.skeleton.headRadius,
      bones: {
        torso: makeBone('torso', 'torso', pelvis, neck),
        head: headBone,
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
        grip: { ...handFront },
        angle: bowAngle,
        stringTop,
        stringBottom,
        nockPoint: {
          x: (stringTop.x + stringBottom.x) * 0.5,
          y: (stringTop.y + stringBottom.y) * 0.5,
        },
        nockedArrowTip: { ...handFront },
        nockedArrowTail: { ...handFront },
        showNockedArrow: false,
      },
    };
  }

  getHitboxes(): HitboxShape[] {
    return extractHitboxes(this.toRigPose());
  }
}
