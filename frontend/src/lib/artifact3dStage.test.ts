import { beforeEach, describe, expect, it, vi } from "vitest";

const loadAsync = vi.fn();
const renderers = vi.hoisted(() => ({ made: 0 }));

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    loadAsync = loadAsync;
  },
}));

vi.mock("three", () => {
  class Vector3 {
    x = 0;
    y = 0;
    z = 0;
    set() {
      return this;
    }
    sub() {
      return this;
    }
  }
  class Object3D {
    children: Object3D[] = [];
    position = new Vector3();
    rotation = { order: "XYZ", set: vi.fn() };
    add(child: Object3D) {
      this.children.push(child);
      return this;
    }
    traverse(visit: (obj: Object3D) => void) {
      visit(this);
      for (const child of this.children) child.traverse(visit);
    }
  }
  class PerspectiveCamera extends Object3D {
    aspect = 1;
    lookAt = vi.fn();
    updateProjectionMatrix = vi.fn();
  }
  class Sphere {
    center = new Vector3();
    radius = 1;
  }
  return {
    Scene: Object3D,
    Group: Object3D,
    AmbientLight: Object3D,
    DirectionalLight: Object3D,
    PerspectiveCamera,
    Sphere,
    Box3: class {
      setFromObject() {
        return this;
      }
      getBoundingSphere(target: Sphere) {
        return target;
      }
    },
    AnimationMixer: class {
      clipAction() {
        return { play: vi.fn() };
      }
      update = vi.fn();
    },
    Color: class {},
    MeshStandardMaterial: class {},
    WebGLRenderer: class {
      constructor() {
        renderers.made += 1;
      }
      domElement = { width: 8, height: 8 };
      setClearAlpha = vi.fn();
      setSize = vi.fn();
      render = vi.fn();
      dispose = vi.fn();
      forceContextLoss = vi.fn();
    },
  };
});

function fakeCanvas(): HTMLCanvasElement {
  const ctx = { drawImage: vi.fn(), clearRect: vi.fn(), globalCompositeOperation: "source-over" };
  return { width: 32, height: 32, getContext: () => ctx } as unknown as HTMLCanvasElement;
}

/** One parse's worth of GPU resources, with the handles a disposal has to reach. */
function fakeModel() {
  const geometry = { dispose: vi.fn() };
  const texture = { isTexture: true, dispose: vi.fn() };
  const material = { map: texture, dispose: vi.fn() };
  const node = (): unknown => ({
    isMesh: true,
    geometry,
    material,
    position: { sub: vi.fn() },
    traverse(visit: (obj: unknown) => void) {
      visit(this);
    },
    clone() {
      return node();
    },
  });
  return {
    geometry,
    texture,
    material,
    gltf: { scene: node(), animations: [], parser: { json: { materials: [{}] } } },
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  renderers.made = 0;
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function stage() {
  return import("./artifact3dStage");
}

describe("mountArtifact: one model for everyone", () => {
  it("two items at one address parse the file once", async () => {
    loadAsync.mockImplementation(async () => fakeModel().gltf);
    const { mountArtifact } = await stage();

    await mountArtifact(fakeCanvas(), { src: "/m.glb" });
    await mountArtifact(fakeCanvas(), { src: "/m.glb" });

    expect(loadAsync).toHaveBeenCalledTimes(1);
  });

  it("different addresses share only the code, not the parse", async () => {
    loadAsync.mockImplementation(async () => fakeModel().gltf);
    const { mountArtifact } = await stage();

    await mountArtifact(fakeCanvas(), { src: "/a.glb" });
    await mountArtifact(fakeCanvas(), { src: "/b.glb" });

    expect(loadAsync).toHaveBeenCalledTimes(2);
  });

  it("while anyone still wears the model it is not removed from video memory", async () => {
    const model = fakeModel();
    loadAsync.mockResolvedValue(model.gltf);
    const { mountArtifact, IDLE_RELEASE_MS } = await stage();

    const first = await mountArtifact(fakeCanvas(), { src: "/m.glb" });
    const second = await mountArtifact(fakeCanvas(), { src: "/m.glb" });

    vi.useFakeTimers();
    first.dispose();
    await vi.advanceTimersByTimeAsync(IDLE_RELEASE_MS * 2);
    expect(model.geometry.dispose).not.toHaveBeenCalled();

    second.dispose();
    // The last holder out does not free at once: a wave swap brings the same model straight back.
    await vi.advanceTimersByTimeAsync(IDLE_RELEASE_MS - 1);
    expect(model.geometry.dispose).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(model.geometry.dispose).toHaveBeenCalledTimes(1);
    // A material does not free its maps, and a texture left behind is the heaviest thing on the card.
    expect(model.texture.dispose).toHaveBeenCalledTimes(1);
    expect(model.material.dispose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("a remount within the idle window reuses the parse and the renderer", async () => {
    loadAsync.mockImplementation(async () => fakeModel().gltf);
    const { mountArtifact } = await stage();

    (await mountArtifact(fakeCanvas(), { src: "/m.glb" })).dispose();
    await mountArtifact(fakeCanvas(), { src: "/m.glb" });

    expect(loadAsync).toHaveBeenCalledTimes(1);
    expect(renderers.made).toBe(1);
  });

  it("an address left without holders past the idle window is read again", async () => {
    loadAsync.mockImplementation(async () => fakeModel().gltf);
    const { mountArtifact, IDLE_RELEASE_MS } = await stage();

    vi.useFakeTimers();
    (await mountArtifact(fakeCanvas(), { src: "/m.glb" })).dispose();
    await vi.advanceTimersByTimeAsync(IDLE_RELEASE_MS);
    vi.useRealTimers();
    await mountArtifact(fakeCanvas(), { src: "/m.glb" });

    expect(loadAsync).toHaveBeenCalledTimes(2);
  });

  it("a failed file is not memoised as the answer — the next item tries again", async () => {
    loadAsync.mockRejectedValueOnce(new Error("нет файла"));
    loadAsync.mockImplementation(async () => fakeModel().gltf);
    const { mountArtifact } = await stage();

    await expect(mountArtifact(fakeCanvas(), { src: "/m.glb" })).rejects.toThrow();
    await expect(mountArtifact(fakeCanvas(), { src: "/m.glb" })).resolves.toBeTruthy();
  });
});
