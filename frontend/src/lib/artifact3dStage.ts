/** One shared WebGL renderer copies frames into per-view 2D canvases to avoid browser context limits. DESIGN §12.5. */

import { createFrameClock, fitDistance, nextSpin, rewindSpin, wrapAngle } from "./artifact3d";

type Three = typeof import("three");
type GLTFLoaderCtor = typeof import("three/examples/jsm/loaders/GLTFLoader.js").GLTFLoader;
type GLTF = import("three/examples/jsm/loaders/GLTFLoader.js").GLTF;

export interface ArtifactHandle {
  /** Toggle rotation and embedded model animation. */
  setSpinning(on: boolean): void;
  /**
   * Turn the object by hand, in radians: around its own axis, and over its head. Both are
   * unbounded, so the hand takes the object all the way round either way. Cancels spin and rewind.
   */
  turn(deltaYaw: number, deltaPitch?: number): void;
  /**
   * Move the sun, in radians about the vertical. The phase changes from day to day while the body
   * keeps turning, so the light is steered in the live scene rather than rebuilt. DESIGN §7.7
   */
  setLight(azimuth: number): void;
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
  /**
   * Light from ONE named direction instead of the studio pair, `azimuth` in radians about the
   * vertical. For a thing whose lighting carries meaning — the Moon's phase. DESIGN §7.7
   */
  light?: { azimuth: number; ambient: number; intensity?: number };
  /**
   * Resting pose in DEGREES, for a thing that reads better off-axis than face-on. `yaw` turns it
   * to the viewer's right, `pitch` tips its top away. Spin and drag compose on top of it.
   */
  pose?: { yaw?: number; pitch?: number };
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

const radians = (deg: number) => (deg * Math.PI) / 180;

interface View {
  canvas: HTMLCanvasElement;
  /** The model's address: what the view took from the shared parse and must hand back. */
  src: string;
  ctx: CanvasRenderingContext2D;
  scene: import("three").Scene;
  camera: import("three").PerspectiveCamera;
  pivot: import("three").Group;
  mixer: import("three").AnimationMixer | null;
  angle: number;
  /** Tip towards and away from the viewer; only a hand sets it, so spin and rewind leave it alone. */
  pitch: number;
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
  /* Alpha preserves the wave background. The frame is copied out in the SAME task that drew it, so
     `preserveDrawingBuffer` is not needed — and it costs a full buffer keep-and-resolve every frame. */
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
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
  // `copy` (set at mount) replaces the whole canvas, so the frame needs no separate clear.
  view.ctx.drawImage(renderer.domElement, 0, 0, width, height);
}

/* Pose in ONE place, because the two angles do not commute: the object yaws about the world's
   vertical and tips about its own horizontal, which is the `YXZ` order set on the pivot. */
function applyPose(view: View) {
  view.pivot.rotation.set(view.pitch, view.angle, 0);
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
      applyPose(view);
      // Clamp embedded animation too, preventing jumps after tab suspension.
      view.mixer?.update(Math.min(delta, MAX_STEP_MS) / 1000);
      view.needsRender = true;
      moving = true;
    } else if (view.rewinding) {
      // Rewind rotation at the forward speed; embedded animation is not reversed. DESIGN §12.5.
      view.angle = rewindSpin(view.angle, delta, view.rpm);
      applyPose(view);
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
  dropModel(view.src);
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

/**
 * One parse per address, worn by every view at it. A shaft of identical objects otherwise fetched,
 * decoded and uploaded the same scan once per slot — the card's first turns paid for it. DESIGN §12.5
 */
interface SharedModel {
  ready: Promise<{ gltf: GLTF; radius: number }>;
  /** Views wearing it now; the last one out frees the geometry and the texture. */
  users: number;
}

const models = new Map<string, SharedModel>();

function takeModel(THREE: Three, GLTFLoader: GLTFLoaderCtor, src: string) {
  let shared = models.get(src);
  if (!shared) {
    const ready = new GLTFLoader().loadAsync(src).then((gltf) => prepare(THREE, gltf));
    shared = { ready, users: 0 };
    models.set(src, shared);
    // A failed load is not remembered as the answer: the next view tries the address again.
    ready.catch(() => models.delete(src));
  }
  shared.users += 1;
  return shared.ready;
}

function dropModel(src: string) {
  const shared = models.get(src);
  if (!shared) return;
  shared.users -= 1;
  if (shared.users > 0) return;
  models.delete(src);
  shared.ready.then(({ gltf }) => disposeModel(gltf), () => {});
}

/** Dress and centre once, for everyone: a clone inherits both, and both are the same for all views. */
function prepare(THREE: Three, gltf: GLTF) {
  dressMateriallessModel(THREE, gltf);
  // Placement by the bounding sphere, so model scale cannot change the apparent slot size.
  const sphere = new THREE.Box3().setFromObject(gltf.scene).getBoundingSphere(new THREE.Sphere());
  gltf.scene.position.sub(sphere.center);
  return { gltf, radius: sphere.radius };
}

function disposeModel(gltf: GLTF) {
  gltf.scene.traverse((obj) => {
    const mesh = obj as Partial<import("three").Mesh>;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach(disposeMaterial);
    else if (material) disposeMaterial(material);
  });
}

/* A material does not free its maps: without this the scan's texture outlives the last view that
   wore it, and the GPU keeps a megabyte per address nobody is looking at any more. */
function disposeMaterial(material: import("three").Material) {
  for (const value of Object.values(material)) {
    const texture = value as Partial<import("three").Texture> | null;
    if (texture?.isTexture) texture.dispose?.();
  }
  material.dispose();
}

/** Mount a model into an already sized canvas; otherwise the first frame stays empty until resize. */
export async function mountArtifact(
  canvas: HTMLCanvasElement,
  { src, rpm = DEFAULT_RPM, padding = DEFAULT_PADDING, light, pose, signal }: MountOptions,
): Promise<ArtifactHandle> {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D-контекст канваса недоступен");
  // One pass per frame: the copy replaces the canvas whole, so no clear is needed before it.
  ctx.globalCompositeOperation = "copy";

  const { THREE, GLTFLoader } = await loadThree();
  if (signal?.aborted) throw new Error("монтаж артефакта отменён");

  let shared: { gltf: GLTF; radius: number };
  try {
    shared = await takeModel(THREE, GLTFLoader, src);
  } catch (error) {
    dropModel(src);
    throw error;
  }
  if (signal?.aborted) {
    dropModel(src);
    throw new Error("монтаж артефакта отменён");
  }
  const { gltf } = shared;

  // Create the renderer after loading so failed models cannot retain a context.
  ensureRenderer(THREE);

  const scene = new THREE.Scene();
  // PBR models need lights; unlit models ignore them.
  scene.add(new THREE.AmbientLight(0xffffff, light?.ambient ?? 2.4));
  const key = new THREE.DirectionalLight(0xffffff, light?.intensity ?? 2.4);
  /* Its own sun stands nearly level with the object, so the terminator runs down it and the phase
     is real geometry; the studio key stays high and to the right, where it flatters a silhouette. */
  const aimSun = (azimuth: number) => key.position.set(Math.sin(azimuth) * 4, 0.7, Math.cos(azimuth) * 4);
  if (light) aimSun(light.azimuth);
  else key.position.set(2, 3, 4);
  scene.add(key);

  /* ⚠️ The resting pose is the pivot's PARENT, never its child. Inside the pivot the spin turns an
     already-tilted body about the WORLD vertical, and it PRECESSES: the object sweeps a cone and
     crosses over itself instead of turning on its own axis. DESIGN §12.5 */
  const rest = new THREE.Group();
  rest.rotation.order = "YXZ";
  if (pose) rest.rotation.set(radians(pose.pitch ?? 0), radians(pose.yaw ?? 0), 0);
  scene.add(rest);

  const pivot = new THREE.Group();
  pivot.rotation.order = "YXZ";
  rest.add(pivot);
  /* A clone, not the parse itself: it carries its own pose while geometry, material and texture stay
     the shared ones, so a second view of the same address costs a node tree and nothing on the GPU. */
  const object = gltf.scene.clone();
  pivot.add(object);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 1000);
  const distance = fitDistance(shared.radius, FOV, padding);
  const elevation = (ELEVATION_DEG * Math.PI) / 180;
  camera.position.set(0, Math.sin(elevation) * distance, Math.cos(elevation) * distance);
  camera.lookAt(0, 0, 0);

  let mixer: import("three").AnimationMixer | null = null;
  if (gltf.animations.length > 0) {
    mixer = new THREE.AnimationMixer(object);
    mixer.clipAction(gltf.animations[0]).play();
    mixer.update(0); // the animation's first frame IS the still picture at rest
  }

  const view: View = {
    canvas,
    src,
    ctx,
    scene,
    camera,
    pivot,
    mixer,
    angle: 0,
    pitch: 0,
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
    // A hand on the object outranks both gestures: it neither drifts on by itself nor snaps back.
    turn(deltaYaw, deltaPitch = 0) {
      view.spinning = false;
      view.rewinding = false;
      view.angle = wrapAngle(view.angle + deltaYaw);
      view.pitch = wrapAngle(view.pitch + deltaPitch);
      applyPose(view);
      view.needsRender = true;
      schedule();
    },
    setLight(azimuth) {
      aimSun(azimuth);
      view.needsRender = true;
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
