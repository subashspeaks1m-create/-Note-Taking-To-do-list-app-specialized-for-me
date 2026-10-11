import * as THREE from 'three';
import type { StandInColors } from '../../domain/wardrobe';

const SKIN = '#c08a64';
const HAIR = '#16110e';

function mat(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.05, ...opts });
}

function limb(radius: number, length: number, material: THREE.Material) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 14), material);
  m.castShadow = true;
  return m;
}

/**
 * A simple mannequin in the outfit's colors, 1.8 m tall with feet at y = 0.
 * It only stands in until the real model of you is added, and the vault labels
 * it that way; it is never presented as the finished character.
 */
export function buildStandIn(c: StandInColors): THREE.Group {
  const g = new THREE.Group();
  g.name = 'stand-in';
  const skin = mat(SKIN, { roughness: 0.75 });
  const top = mat(c.top);
  const bottom = mat(c.bottom);
  const shoes = mat(c.shoes, { roughness: 0.5 });

  // Legs
  for (const side of [-1, 1]) {
    const thigh = limb(0.075, 0.36, bottom);
    thigh.position.set(side * 0.1, 0.72, 0);
    g.add(thigh);
    const shin = limb(0.06, 0.34, bottom);
    shin.position.set(side * 0.105, 0.32, 0);
    g.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.24), shoes);
    foot.position.set(side * 0.105, 0.04, 0.04);
    foot.geometry.translate(0, 0, 0);
    g.add(foot);
  }
  // Hips and torso
  const hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.08, 6, 16), bottom);
  hips.rotation.z = Math.PI / 2;
  hips.scale.set(1, 1, 0.75);
  hips.position.set(0, 0.95, 0);
  g.add(hips);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.34, 8, 20), top);
  torso.scale.set(1.08, 1, 0.68);
  torso.position.set(0, 1.25, 0);
  torso.name = 'stand-in-torso';
  g.add(torso);
  // Neck and head
  const neck = limb(0.05, 0.06, skin);
  neck.position.set(0, 1.5, 0);
  g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 18), skin);
  head.scale.set(0.92, 1.1, 1);
  head.position.set(0, 1.64, 0.01);
  g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.118, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(HAIR, { roughness: 0.9 }));
  hair.scale.set(0.98, 1.05, 1.05);
  hair.position.set(0, 1.665, -0.005);
  g.add(hair);
  // Arms in a relaxed A-pose
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.235, 1.42, 0);
    arm.rotation.z = side * 0.32;
    const upper = limb(0.05, 0.24, c.sleeves === 'none' ? skin : top);
    upper.position.y = -0.16;
    arm.add(upper);
    const fore = limb(0.042, 0.22, c.sleeves === 'long' ? top : skin);
    fore.position.y = -0.45;
    arm.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 14, 12), skin);
    hand.scale.set(0.8, 1.25, 0.55);
    hand.position.y = -0.64;
    arm.add(hand);
    g.add(arm);
  }
  if (c.cape) {
    const cape = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.34, 1.05, 24, 1, true, Math.PI * 0.62, Math.PI * 0.76), mat(c.cape, { side: THREE.DoubleSide, roughness: 0.8 }));
    cape.position.set(0, 0.92, -0.02);
    g.add(cape);
  }
  if (c.glow) {
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.035, 24), new THREE.MeshStandardMaterial({ color: c.glow, emissive: c.glow, emissiveIntensity: 2.2 }));
    core.position.set(0, 1.3, 0.122);
    g.add(core);
  }
  return g;
}
