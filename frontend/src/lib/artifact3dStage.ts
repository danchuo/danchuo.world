/**
 * Сцена 3D-артефактов (DESIGN §12.5) — браузерная половина: грузит glTF и рисует его в
 * `<canvas>` вызывающего. Чистая арифметика (посадка камеры, шаг вращения, распознавание
 * адреса) — в `artifact3d.ts`; React-обёртка — в `components/Artifact3D.tsx`.
 *
 * ⚠️ **Рендерер один на весь борд, канвасов — сколько угодно.** Волна 03 несёт много
 * 3D-предметов, а WebGL-контекстов у браузера считанные единицы (~16, и самый старый он
 * молча роняет). Поэтому здесь один `WebGLRenderer` со своим скрытым канвасом; каждый вид
 * рисуется в него и **копируется** в свой 2D-канвас (`drawImage`). Контекст всегда ровно
 * один, сколько бы артефактов ни висело на экране.
 *
 * `three` подгружается **динамически**: страница без 3D-артефактов за библиотеку не платит.
 */

import { createFrameClock, fitDistance, nextSpin, rewindSpin } from "./artifact3d";

type Three = typeof import("three");
type GLTFLoaderCtor = typeof import("three/examples/jsm/loaders/GLTFLoader.js").GLTFLoader;
type GLTF = import("three/examples/jsm/loaders/GLTFLoader.js").GLTF;

export interface ArtifactHandle {
  /** Включить/выключить движение (вращение + встроенная анимация модели). */
  setSpinning(on: boolean): void;
  /** Канвас сменил размер — перерисовать под новый. */
  resize(): void;
  dispose(): void;
}

export interface MountOptions {
  /** Адрес `.glb`/`.gltf`. */
  src: string;
  /** Оборотов в минуту при наведении. */
  rpm?: number;
  /** Поле вокруг предмета: 1 — впритык к краю слота. */
  padding?: number;
  signal?: AbortSignal;
}

/** Вертикальный угол обзора. Узкий — предмет читается почти ортогонально, без раздувания краёв. */
const FOV = 32;
/**
 * Подъём камеры над экватором. Прямо в лоб шар с сеткой читается плоским кольцевым узором;
 * с наклона параллели становятся эллипсами, и предмет мгновенно читается объёмным.
 */
const ELEVATION_DEG = 14;
const DEFAULT_RPM = 9;
/**
 * Поле вокруг предмета. Единица — габаритная сфера модели вписана в кадр ровно: предмет берёт
 * слот целиком. Больше единицы прежнего запаса не даём намеренно — сфера и так шире силуэта
 * (особенно у плоских моделей вроде спирали), и лишнее поле читалось как «модель мелковата».
 */
const DEFAULT_PADDING = 1.0;
/** Тот же потолок шага, что у вращения (`nextSpin`) — им же обрезаем встроенную анимацию. */
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
  /**
   * Курсор ушёл, но предмет ещё не вернулся в исходное положение. Отдельное состояние от
   * [View.spinning], а не его отрицание: «стоит» и «отматывается назад» — разные вещи, и цикл
   * обязан жить, пока идёт вторая.
   */
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
  // `alpha` — артефакт стоит на фоне волны, своей подложки у него нет.
  // `preserveDrawingBuffer` обязателен: кадр копируется в чужой канвас ПОСЛЕ отрисовки, без
  // него буфер к моменту `drawImage` уже очищен и в слот приезжает пустота.
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearAlpha(0);
  rendererSize = { w: 0, h: 0 };
  return renderer;
}

function draw(view: View) {
  const { width, height } = view.canvas;
  if (!renderer || width === 0 || height === 0) return;
  // Размер общего рендерера подгоняем под ТЕКУЩИЙ вид и только когда он реально другой:
  // присваивание `canvas.width` сбрасывает контекст, даже если значение то же.
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

/** Будит цикл, если он спит. Продолжает его сам [tick] — см. предупреждение там. */
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
      // Встроенную анимацию модели (у покупных она обычно есть) двигаем тем же шагом и с тем
      // же потолком — иначе после свёрнутой вкладки она проматывается рывком.
      view.mixer?.update(Math.min(delta, MAX_STEP_MS) / 1000);
      view.needsRender = true;
      moving = true;
    } else if (view.rewinding) {
      // Обратный ход той же скорости — до упора в исходное положение (§12.5). Встроенную
      // анимацию назад НЕ гоняем: у наших моделей её нет, а вслепую кормить микшер
      // отрицательным шагом — догадка. Появится анимированная модель — решим на ней.
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
  // ⚠️ Продолжаем цикл ЗДЕСЬ, а не через `schedule()`: `rafId` наверху уже обнулён, поэтому
  // страж «уже идёт» продолжение не отличил бы от запуска. Пока запуск заодно обнулял отсчёт
  // кадров, шаг выходил нулевым каждый раз — предмет рисовался под одним углом и выглядел
  // неподвижным (регрессия закреплена тестами `createFrameClock`).
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
  // Последний вид ушёл — отдаём и WebGL-контекст: борд без 3D не должен держать его занятым.
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

/**
 * Модель без материалов одевается **акцентом активной волны**.
 *
 * Так бывает у геометрии, выгруженной инструментом-конструктором (наш `spiral-vortex.glb` —
 * из trimesh): материалов в файле нет вовсе. Умолчание glTF на этот случай —
 * металл с шероховатостью 1, и без карты окружения он рисуется почти чёрным пятном.
 *
 * Правило простое: **файл сам говорит, как выглядит; не сказал — одевает волна.** Цвет берём
 * из токена `--accent`, а не константой (DESIGN: ноль хардкод-цветов), поэтому предмет без
 * собственного вида остаётся своим на любой волне. Модель со своими материалами (наш глобус —
 * эмиссивный циан) не трогаем: она уже сказала.
 */
function dressMateriallessModel(THREE: Three, gltf: GLTF) {
  // Спрашиваем ИСХОДНЫЙ json, а не разобранные материалы: три-джей уже подставил своё
  // умолчание, и по нему «файл молчал» от «файл сказал: белый» не отличить.
  const declared = (gltf.parser.json as { materials?: unknown[] }).materials;
  if (declared && declared.length > 0) return;

  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  const color = new THREE.Color(accent || "#ffffff");
  // Не unlit: сплошная заливка превратила бы предмет в плоский силуэт. Немного собственного
  // свечения — чтобы тени не уводили его в чёрное на тёмной волне.
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
 * Ставит артефакт в канвас и отдаёт ручку управления. Канвас к этому моменту должен иметь
 * размер (его задаёт вызывающий из наблюдаемого CSS-бокса) — иначе первый кадр будет пустым
 * до первого [ArtifactHandle.resize].
 */
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

  // Рендерер создаём ПОСЛЕ загрузки: сорвавшаяся модель не должна оставлять занятый контекст.
  ensureRenderer(THREE);

  const scene = new THREE.Scene();
  // Свет нужен покупным PBR-моделям; наш каркасный глобус — unlit и его игнорирует.
  scene.add(new THREE.AmbientLight(0xffffff, 2.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(2, 3, 4);
  scene.add(key);

  const pivot = new THREE.Group();
  scene.add(pivot);
  pivot.add(gltf.scene);

  dressMateriallessModel(THREE, gltf);

  // Предмет любого масштаба садится в слот одинаково: центрируем по его габаритной сфере и от
  // её радиуса считаем дистанцию камеры. Волне не приходится подбирать числа под файл — купленная
  // модель в сотню единиц встанет так же, как наш глобус в единицу.
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
    mixer.update(0); // первый кадр анимации — и есть статичная картинка покоя
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
      // Курсор ушёл — не замираем на месте, а откатываемся в исходное положение. Вернулся на
      // полпути — откат отменяется тем же флагом, и предмет едет вперёд с того места, где был.
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
