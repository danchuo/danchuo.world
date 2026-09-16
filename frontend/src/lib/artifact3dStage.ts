/** One shared WebGL renderer copies frames into per-view 2D canvases to avoid browser context limits. DESIGN §12.5. */

import { createFrameClock, fitDistance, nextSpin, rewindSpin } from "./artifact3d";

type Three = typeof import("three");
type GLTFLoaderCtor = typeof import("three/examples/jsm/loaders/GLTFLoader.js").GLTFLoader;
type GLTF = import("three/examples/jsm/loaders/GLTFLoader.js").GLTF;

export interface ArtifactHandle {
  /** Toggle rotation and embedded model animation. */
  setSpinning(on: boolean): void;
  /** Redraw after the canvas size changes. */
  resize(): void;
  dispose(): void;
}

export interface MountOptions {
  /** URL of a .glb or .gltf model. */
  src: string;
  /** Revolutions per minute on hover. */
  rpm?: number;
  /** Padding around the model; 1 fits the slot exactly. */
  padding?: number;
  signal?: AbortSignal;
}

/** A narrow vertical FOV limits perspective distortion. */
const FOV = 32;
/** Elevate the camera so sphere parallels read as volume instead of flat rings. */
const ELEVATION_DEG = 14;
const DEFAULT_RPM = 9;
/** A bounding sphere already exceeds flat silhouettes; extra padding makes them too small. */
const DEFAULT_PADDING = 1.0;
/** Clamp embedded animation with the same delta ceiling as nextSpin. */
const MAX_STEP_MS = 100;

interface View {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  scene: import("three").Scene;
  camera: import("three").PerspectiveCamera;
  pivot: import("three").Group;
  mixer: import("three").AnimationMixer | null;
  angle: number;
  rpm: number;
  spinning: boolean;
  /** Keep the loop alive while rewinding; stopped and rewinding are distinct states. */
  rewinding: boolean;
  needsRender: boolean;
}

let threePromise: Promise<{ THREE: Three; GLTFLoader: GLTFLoaderCtor }> | null = null;

function loadThree() {
  threePromise ??= Promise.all([
    import("three"),
    import("three/examples/jsm/loaders/GLTFLoader.js"),
  ]).then(([THREE, loaders]) => ({ THREE, GLTFLoader: loaders.GLTFLoader }));
  return threePromise;
}

const views = new Set<View>();
let renderer: import("three").WebGLRenderer | null = null;
let rendererSize = { w: 0, h: 0 };
let rafId = 0;
const clock = createFrameClock();

function ensureRenderer(THREE: Three) {
  if (renderer) return renderer;
  // Alpha preserves the wave background; preserveDrawingBuffer keeps the frame available for the later drawImage copy.
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearAlpha(0);
  rendererSize = { w: 0, h: 0 };
  return renderer;
}

function draw(view: View) {
  const { width, height } = view.canvas;
  if (!renderer || width === 0 || height === 0) return;
  // Resize only when dimensions change: assigning canvas.width clears even an unchanged context.
  if (rendererSize.w !== width || rendererSize.h !== height) {
    renderer.setSize(width, height, false);
    rendererSize = { w: width, h: height };
  }
  const aspect = width / height;
  if (view.camera.aspect !== aspect) {
    view.camera.aspect = aspect;
    view.camera.updateProjectionMatrix();
  }
  renderer.render(view.scene, view.camera);
  view.ctx.clearRect(0, 0, width, height);
  view.ctx.drawImage(renderer.domElement, 0, 0, width, height);
}

/** Wake an idle loop; tick schedules its own continuations. */
function schedule() {
  if (rafId) return;
  rafId = requestAnimationFrame(tick);
}

function tick(now: number) {
  rafId = 0;
  const delta = clock.step(now);
  let moving = false;
  for (const view of views) {
    if (view.spinning) {
      view.angle = nextSpin(view.angle, delta, view.rpm);
      view.pivot.rotation.y = view.angle;
      // Clamp embedded animation too, preventing jumps after tab suspension.
      view.mixer?.update(Math.min(delta, MAX_STEP_MS) / 1000);
      view.needsRender = true;
      moving = true;
    } else if (view.rewinding) {
      // Rewind rotation at the forward speed; embedded animation is not reversed. DESIGN §12.5.
      view.angle = rewindSpin(view.angle, delta, view.rpm);
      view.pivot.rotation.y = view.angle;
      view.rewinding = view.angle > 0;
      view.needsRender = true;
      moving = moving || view.rewinding;
    }
    if (view.needsRender) {
      draw(view);
      view.needsRender = false;
    }
  }
  // Continue directly: schedule cannot distinguish continuation from startup after rafId is cleared; resetting the clock freezes motion.
  if (moving) rafId = requestAnimationFrame(tick);
  else clock.reset();
}

function release(view: View) {
  views.delete(view);
  view.scene.traverse((obj) => {
    const mesh = obj as Partial<import("three").Mesh>;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose();
  });
  // Release the WebGL context when its last view is removed.
  if (views.size === 0 && renderer) {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    clock.reset();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer = null;
    rendererSize = { w: 0, h: 0 };
  }
}

/** Use the wave accent only when the glTF declares no materials. DESIGN §12.5. */
function dressMateriallessModel(THREE: Three, gltf: GLTF) {
  // Inspect source JSON: parsed default materials cannot distinguish omission from an explicit white material.
  const declared = (gltf.parser.json as { materials?: unknown[] }).materials;
  if (declared && declared.length > 0) return;

  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  const color = new THREE.Color(accent || "#ffffff");
  // Unlit fill flattens the silhouette; slight emission keeps shadows visible on dark waves.
  const material = new THREE.MeshStandardMaterial({
    color,
    metalness: 0,
    roughness: 0.5,
    emissive: color,
    emissiveIntensity: 0.28,
  });
  gltf.scene.traverse((obj: import("three").Object3D) => {
    const mesh = obj as import("three").Mesh;
    if (mesh.isMesh) mesh.material = material;
  });
}

/** Mount a model into an already sized canvas; otherwise the first frame stays empty until resize. */
export async function mountArtifact(
  canvas: HTMLCanvasElement,
  { src, rpm = DEFAULT_RPM, padding = DEFAULT_PADDING, signal }: MountOptions,
): Promise<ArtifactHandle> {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D-контекст канваса недоступен");

  const { THREE, GLTFLoader } = await loadThree();
  if (signal?.aborted) throw new Error("монтаж артефакта отменён");

  const gltf = await new GLTFLoader().loadAsync(src);
  if (signal?.aborted) throw new Error("монтаж артефакта отменён");

  // Create the renderer after loading so failed models cannot retain a context.
  ensureRenderer(THREE);

  const scene = new THREE.Scene();
  // PBR models need lights; unlit models ignore them.
  scene.add(new THREE.AmbientLight(0xffffff, 2.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(2, 3, 4);
  scene.add(key);

  const pivot = new THREE.Group();
  scene.add(pivot);
  pivot.add(gltf.scene);

  dressMateriallessModel(THREE, gltf);

  // Normalize placement by the bounding sphere so model scale cannot change its apparent slot size.
  const bounds = new THREE.Box3().setFromObject(gltf.scene);
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  gltf.scene.position.sub(sphere.center);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 1000);
  const distance = fitDistance(sphere.radius, FOV, padding);
  const elevation = (ELEVATION_DEG * Math.PI) / 180;
  camera.position.set(0, Math.sin(elevation) * distance, Math.cos(elevation) * distance);
  camera.lookAt(0, 0, 0);

  let mixer: import("three").AnimationMixer | null = null;
  if (gltf.animations.length > 0) {
    mixer = new THREE.AnimationMixer(gltf.scene);
    mixer.clipAction(gltf.animations[0]).play();
    mixer.update(0); // the animation's first frame IS the still picture at rest
  }

  const view: View = {
    canvas,
    ctx,
    scene,
    camera,
    pivot,
    mixer,
    angle: 0,
    rpm,
    spinning: false,
    rewinding: false,
    needsRender: true,
  };
  views.add(view);
  draw(view);
  view.needsRender = false;

  return {
    setSpinning(on) {
      if (view.spinning === on) return;
      view.spinning = on;
      // Leaving rewinds to the initial pose; re-entry resumes forward from the current angle.
      view.rewinding = !on && view.angle > 0;
      schedule();
    },
    resize() {
      view.needsRender = true;
      schedule();
    },
    dispose() {
      release(view);
    },
  };
}
