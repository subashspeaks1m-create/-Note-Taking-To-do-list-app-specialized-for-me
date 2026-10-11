import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyLayeredOutfit, bodyBounds } from './viewerEngine';

function box(name: string, y: number, h = 0.2) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, h, 0.2));
  m.name = name;
  m.position.y = y;
  return m;
}

function layered() {
  const scene = new THREE.Group();
  scene.add(box('body_head', 1.7), box('body_torso', 1.3), box('body_legs', 0.5, 0.8));
  const a = new THREE.Group();
  a.name = 'outfit_web-runner';
  a.userData.hides = ['torso', 'legs'];
  a.add(box('cloth', 1));
  const b = new THREE.Group();
  b.name = 'outfit_dark-knight';
  b.userData.hides = 'body_torso, arms';
  b.add(box('cape', 1, 2.4));
  scene.add(a, b);
  return scene;
}

const visible = (scene: THREE.Object3D, name: string) => scene.getObjectByName(name)!.visible;

describe('layered outfit file', () => {
  it('shows only the chosen outfit and hides the body parts it covers', () => {
    const scene = layered();
    expect(applyLayeredOutfit(scene, 'outfit_web-runner')).toBe(true);
    expect(visible(scene, 'outfit_web-runner')).toBe(true);
    expect(visible(scene, 'outfit_dark-knight')).toBe(false);
    expect([visible(scene, 'body_head'), visible(scene, 'body_torso'), visible(scene, 'body_legs')]).toEqual([true, false, false]);
  });

  it('accepts hides as text, and brings back parts the last outfit hid', () => {
    const scene = layered();
    applyLayeredOutfit(scene, 'outfit_web-runner');
    applyLayeredOutfit(scene, 'outfit_dark-knight');
    expect([visible(scene, 'body_head'), visible(scene, 'body_torso'), visible(scene, 'body_legs')]).toEqual([true, false, true]);
  });

  it('reports an outfit missing from the file', () => {
    expect(applyLayeredOutfit(layered(), 'outfit_sorcerer')).toBe(false);
  });

  it('sizes by the whole body, so a tall cape or hidden feet do not change it', () => {
    const scene = layered();
    applyLayeredOutfit(scene, 'outfit_web-runner');
    const b = bodyBounds(scene);
    expect(b.min.y).toBeCloseTo(0.1);
    expect(b.max.y).toBeCloseTo(1.8);
  });
});
