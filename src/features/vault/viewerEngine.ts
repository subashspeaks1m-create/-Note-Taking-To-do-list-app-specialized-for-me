import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { asset } from '../../app/asset';
import type { StandInColors } from '../../domain/wardrobe';
import type { ModelSource } from './models';
import { buildStandIn } from './standIn';

export type ViewerStatus =
  | { state: 'loading' }
  | { state: 'model'; triangles: number; clips: string[] }
  | { state: 'stand-in'; reason: 'no-model' | 'missing-outfit' }
  | { state: 'error'; message: string };

const TARGET_HEIGHT = 1.8;
const POLAR_MIN = Math.PI * 0.18;
const POLAR_MAX = Math.PI * 0.56;

function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const m of mats) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
      m.dispose();
    }
  });
}

function countTriangles(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const g = mesh.geometry;
    n += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
  });
  return Math.round(n);
}

/** Visible-only bounds, so hidden outfits in a layered file don't inflate the fit. */
function visibleBounds(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  // updateMatrixWorld (not updateWorldMatrix) also refreshes skinned meshes' bind matrices.
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    let v: THREE.Object3D | null = mesh;
    while (v) {
      if (!v.visible) return;
      v = v.parent;
    }
    box.expandByObject(mesh, true);
  });
  return box;
}

/**
 * What sets the character's size and floor: in a layered file the body parts,
 * all of them, so every outfit stands at the same height on the platform;
 * otherwise whatever is visible.
 */
export function bodyBounds(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  // updateMatrixWorld (not updateWorldMatrix) also refreshes skinned meshes' bind matrices.
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (/^body_/.test(o.name)) box.expandByObject(o, true);
  });
  return box.isEmpty() ? visibleBounds(root) : box;
}

/** Layered file: show one `outfit_<id>` node, hide the others and the body parts it covers. */
export function applyLayeredOutfit(scene: THREE.Object3D, node: string): boolean {
  const outfits: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if (o.name.startsWith('outfit_')) outfits.push(o);
  });
  const chosen = outfits.find((o) => o.name === node);
  if (!chosen) return false;
  for (const o of outfits) o.visible = o === chosen;
  const raw = chosen.userData.hides as string[] | string | undefined;
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[\s,]+/) : [];
  const hides = new Set(list.filter(Boolean).map((h) => `body_${h.replace(/^body_/, '')}`));
  scene.traverse((o) => {
    if (o.name.startsWith('body_')) o.visible = !hides.has(o.name);
  });
  return true;
}

/**
 * The 3D chamber: a lit platform, a real model (or a labeled stand-in),
 * orbit controls with a full horizontal revolution, and render-on-demand
 * that pauses while the viewer is hidden.
 */
export class ViewerEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  private controls: OrbitControls;
  private loader: GLTFLoader;
  private draco: DRACOLoader;
  private pmrem: THREE.PMREMGenerator;
  private root = new THREE.Group();
  private ring: THREE.Mesh;
  private rim: THREE.DirectionalLight;
  private mixer: THREE.AnimationMixer | null = null;
  private clock = new THREE.Clock();
  private raf = 0;
  private visible = true;
  private loadToken = 0;
  private layered: { url: string; gltf: GLTF } | null = null;
  private current: THREE.Object3D | null = null;
  private resizeObs: ResizeObserver;
  private intersectObs: IntersectionObserver;
  private reducedMotion = false;
  private breathe = true;
  private clips: string[] = [];

  constructor(private host: HTMLElement, private onStatus: (s: ViewerStatus) => void) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.className = 'viewer__canvas';
    host.appendChild(this.renderer.domElement);

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;

    // Key, fill and an accent rim from behind so the back of the outfit reads too.
    this.scene.add(new THREE.HemisphereLight('#dfe8ff', '#1a1410', 0.55));
    const key = new THREE.DirectionalLight('#fff4e6', 2.1);
    key.position.set(1.6, 3, 2.4);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight('#bcd2ff', 0.6);
    fill.position.set(-2.4, 1.6, 1.2);
    this.scene.add(fill);
    this.rim = new THREE.DirectionalLight('#79deec', 1.6);
    this.rim.position.set(-0.8, 2.4, -2.6);
    this.scene.add(this.rim);
    const back = new THREE.DirectionalLight('#ffffff', 0.7);
    back.position.set(1.5, 1.5, -2.5);
    this.scene.add(back);

    // Platform: dark metal disc, glowing ring and a soft contact shadow.
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.78, 0.84, 0.08, 64),
      // Low metalness and dimmed reflections keep the top dark from every side;
      // a shiny disc mirrored the bright room behind the character.
      new THREE.MeshStandardMaterial({ color: '#070a0f', metalness: 0.2, roughness: 0.85, envMapIntensity: 0.04 }),
    );
    disc.position.y = -0.04;
    this.scene.add(disc);
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.8, 0.008, 12, 96),
      new THREE.MeshStandardMaterial({ color: '#79deec', emissive: '#79deec', emissiveIntensity: 1.1 }),
    );
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 0.002;
    this.scene.add(this.ring);
    const shadowTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const ctx = c.getContext('2d')!;
      const grd = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
      grd.addColorStop(0, 'rgba(0,0,0,0.75)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })();
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.003;
    this.scene.add(shadow);
    this.scene.add(this.root);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minPolarAngle = POLAR_MIN;
    this.controls.maxPolarAngle = POLAR_MAX;
    this.controls.autoRotateSpeed = 1.6;
    this.controls.rotateSpeed = 0.8;

    this.draco = new DRACOLoader();
    this.draco.setDecoderPath(asset('/draco/'));
    this.loader = new GLTFLoader();
    this.loader.setDRACOLoader(this.draco);
    this.loader.setMeshoptDecoder(MeshoptDecoder);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.intersectObs = new IntersectionObserver(([e]) => {
      this.visible = !!e?.isIntersecting;
      if (this.visible) this.start();
    });
    this.intersectObs.observe(host);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resize();
    this.start();
  }

  private onVisibility = () => {
    if (document.visibilityState === 'visible') this.start();
  };

  setAccent(color: string) {
    (this.ring.material as THREE.MeshStandardMaterial).color.set(color);
    (this.ring.material as THREE.MeshStandardMaterial).emissive.set(color);
    this.rim.color.set(color);
  }

  setMotion(opts: { autoRotate: boolean; reducedMotion: boolean }) {
    this.reducedMotion = opts.reducedMotion;
    this.controls.autoRotate = opts.autoRotate;
    this.breathe = !opts.reducedMotion;
  }

  /** Show an outfit: its real model when one exists, else the labeled stand-in. */
  async show(source: ModelSource | null, colors: StandInColors) {
    const token = ++this.loadToken;
    if (!source) {
      this.mount(buildStandIn(colors), null, true);
      this.onStatus({ state: 'stand-in', reason: 'no-model' });
      return;
    }
    this.onStatus({ state: 'loading' });
    try {
      if (source.kind === 'whole') {
        const gltf = await this.loader.loadAsync(source.url);
        if (token !== this.loadToken) return disposeObject(gltf.scene);
        this.mount(gltf.scene, gltf, true);
      } else {
        const fresh = !this.layered || this.layered.url !== source.url;
        if (fresh) {
          const gltf = await this.loader.loadAsync(source.url);
          if (token !== this.loadToken) return disposeObject(gltf.scene);
          if (this.layered && this.layered.gltf.scene !== this.current) disposeObject(this.layered.gltf.scene);
          this.layered = { url: source.url, gltf };
        }
        const layered = this.layered!;
        // Pick the outfit before measuring, so a cape or helmet that is hidden doesn't skew the size.
        if (!applyLayeredOutfit(layered.gltf.scene, source.node)) {
          this.mount(buildStandIn(colors), null, true);
          this.onStatus({ state: 'stand-in', reason: 'missing-outfit' });
          return;
        }
        if (this.current !== layered.gltf.scene) this.mount(layered.gltf.scene, layered.gltf, fresh);
        else this.fit();
      }
      this.onStatus({ state: 'model', triangles: countTriangles(this.root), clips: this.clips });
    } catch (e) {
      if (token !== this.loadToken) return;
      this.mount(buildStandIn(colors), null, true);
      this.onStatus({ state: 'error', message: (e as Error).message || 'The model file could not be read.' });
    }
  }

  private mount(obj: THREE.Object3D, gltf: GLTF | null, normalize: boolean) {
    if (this.current && this.current !== obj) {
      this.root.remove(this.current);
      // The layered file stays cached for the next outfit; anything else is freed.
      if (!this.layered || this.current !== this.layered.gltf.scene) disposeObject(this.current);
    }
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.current = obj;
    this.clips = gltf ? gltf.animations.map((a) => a.name) : [];
    if (gltf && gltf.animations.length) {
      this.mixer = new THREE.AnimationMixer(obj);
      const idle = gltf.animations.find((a) => /idle|breath|stand/i.test(a.name)) ?? gltf.animations[0]!;
      this.mixer.clipAction(idle).play();
      // Pose the first idle frame before measuring: the rest pose can stand differently.
      this.mixer.update(0);
    }
    if (normalize && gltf) {
      // Scale to a standard height, feet on the platform, centered over it.
      obj.position.set(0, 0, 0);
      obj.scale.setScalar(1);
      const box = bodyBounds(obj);
      const size = box.getSize(new THREE.Vector3());
      const s = size.y > 0 ? TARGET_HEIGHT / size.y : 1;
      obj.scale.setScalar(s);
      const b2 = bodyBounds(obj);
      const c = b2.getCenter(new THREE.Vector3());
      obj.position.set(-c.x, -b2.min.y, -c.z);
    }
    this.root.add(obj);
    this.fit();
  }

  /** Frame the whole visible body, hair to shoe soles, for the current aspect. */
  fit() {
    const box = visibleBounds(this.root);
    if (box.isEmpty()) return;
    // Keep the floor in frame even when an outfit hides the feet.
    box.expandByPoint(new THREE.Vector3(0, 0, 0));
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const distV = (size.y * 0.5) / Math.tan(vFov / 2);
    const distH = (Math.max(size.x, size.z) * 0.5 + 0.25) / Math.tan(hFov / 2);
    const dist = Math.max(distV, distH) * 1.18 + Math.max(size.x, size.z) * 0.5;
    const dir = this.camera.position.clone().sub(this.controls.target);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0.15, 1);
    dir.normalize();
    this.controls.target.copy(center);
    this.camera.position.copy(center).add(dir.multiplyScalar(dist));
    this.controls.minDistance = dist * 0.45;
    this.controls.maxDistance = dist * 1.6;
    this.controls.update();
  }

  /** Turn to an absolute angle around the character (0 = front, 180 = back). */
  view(deg: number) {
    const t = this.controls.target;
    const dist = this.camera.position.distanceTo(t);
    const polar = Math.PI * 0.47;
    const az = THREE.MathUtils.degToRad(deg);
    this.camera.position.set(t.x + dist * Math.sin(polar) * Math.sin(az), t.y + dist * Math.cos(polar), t.z + dist * Math.sin(polar) * Math.cos(az));
    this.controls.update();
    this.start();
  }

  rotateBy(deg: number) {
    const t = this.controls.target;
    const offset = this.camera.position.clone().sub(t);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(deg));
    this.camera.position.copy(t).add(offset);
    this.controls.update();
    this.start();
  }

  /** Current horizontal angle in degrees, 0 = front. */
  angle(): number {
    const o = this.camera.position.clone().sub(this.controls.target);
    return (THREE.MathUtils.radToDeg(Math.atan2(o.x, o.z)) + 360) % 360;
  }

  private resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fit();
    this.renderer.render(this.scene, this.camera);
  }

  private start() {
    if (this.raf) return;
    this.clock.getDelta();
    const tick = () => {
      this.raf = 0;
      if (!this.visible || document.visibilityState !== 'visible') return;
      const dt = Math.min(0.05, this.clock.getDelta());
      this.mixer?.update(dt);
      if (this.breathe && !this.mixer && this.current) {
        this.current.scale.y = this.current.scale.x * (1 + Math.sin(this.clock.elapsedTime * 1.6) * 0.004);
      }
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Snapshot of the canvas (used by tests and screenshots). */
  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  get motionReduced(): boolean {
    return this.reducedMotion;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.loadToken++;
    this.resizeObs.disconnect();
    this.intersectObs.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.controls.dispose();
    if (this.current) disposeObject(this.current);
    if (this.layered && this.layered.gltf.scene !== this.current) disposeObject(this.layered.gltf.scene);
    disposeObject(this.scene);
    this.scene.environment?.dispose();
    this.pmrem.dispose();
    this.draco.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
