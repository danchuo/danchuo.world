import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ArtifactMarker } from "./ArtifactMarker";
import { HIGHLIGHT_MIN } from "@/lib/artifactHighlight";
import { saveArtifactBox } from "@/lib/api/admin";
import type { AdminArtifactView, AdminPhotoView } from "@/lib/api/types";

vi.mock("@/lib/api/admin", () => ({
  saveArtifactBox: vi.fn(),
  deleteArtifactBox: vi.fn(),
  AdminApiError: class extends Error {},
}));

const CATALOGUE: AdminArtifactView[] = [
  {
    id: 6,
    name: "Очки",
    imageUrl: "/api/artifact-media/6",
    firstMentionedOn: "2026-01-01",
    rotatable: false,
    sortOrder: 0,
    detectionHint: null,
  },
  {
    id: 9,
    name: "Футболка",
    imageUrl: null,
    firstMentionedOn: "2026-02-01",
    rotatable: false,
    sortOrder: 1,
    detectionHint: null,
  },
];

const PHOTO: AdminPhotoView = {
  id: 3,
  thumbUrl: "/api/film-media/1/0/thumb",
  imageUrl: "/api/film-media/1/0/web",
  isCover: false,
  orientation: null,
  artifacts: [],
};

/** Размер кадра в jsdom нулевой — задаём его сами, иначе доли не из чего считать. */
const FRAME = 200;

function renderMarker(photo: AdminPhotoView = PHOTO) {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <ArtifactMarker
      token="t"
      dropId={1}
      photo={photo}
      artifacts={CATALOGUE}
      onSaved={onSaved}
      onError={() => {}}
      onClose={onClose}
    />,
  );
  const frame = view.container.querySelector<HTMLElement>(".marker-frame")!;
  frame.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: FRAME,
      height: FRAME,
      right: FRAME,
      bottom: FRAME,
      x: 0,
      y: 0,
      toJSON: () => "",
    }) as DOMRect;
  return { ...view, frame, onSaved, onClose };
}

/**
 * Событие указателя с координатами. `fireEvent.pointerDown` тут не годится: в jsdom нет
 * `PointerEvent`, и клики уезжают без `clientX` — рамка считалась бы из NaN.
 */
function pointer(target: Window | HTMLElement, type: string, [x, y]: [number, number]) {
  fireEvent(
    target,
    new MouseEvent(type, { clientX: x * FRAME, clientY: y * FRAME, bubbles: true, cancelable: true }),
  );
}

/** Протяжка мышью по кадру в долях кадра: нажали, повели, отпустили. */
function drag(frame: HTMLElement, from: [number, number], to: [number, number]) {
  pointer(frame, "pointerdown", from);
  pointer(window, "pointermove", to);
  pointer(window, "pointerup", to);
}

describe("ArtifactMarker — ручная разметка артефактов (§5.12)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saveArtifactBox).mockResolvedValue([{ ...PHOTO }]);
  });

  it("выбранный предмет + протяжка = рамка в долях кадра", async () => {
    const { frame, onSaved } = renderMarker();
    fireEvent.click(screen.getByRole("radio", { name: "Очки" }));
    drag(frame, [0.2, 0.3], [0.6, 0.8]);

    await waitFor(() => expect(saveArtifactBox).toHaveBeenCalled());
    expect(saveArtifactBox).toHaveBeenCalledWith("t", 1, 3, 6, {
      x0: 0.2,
      y0: 0.3,
      x1: 0.6,
      y1: 0.8,
    });
    // Свежие кадры возвращаются наверх — чипы находок и разметчик показывают одно и то же.
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("крошечная протяжка сохраняется не мельче минимума", async () => {
    const { frame } = renderMarker();
    fireEvent.click(screen.getByRole("radio", { name: "Очки" }));
    // Очки на общем плане мышью аккуратно не обвести — и не нужно: рамка отвечает на вопрос
    // «куда смотреть», а меньше минимума она на него не отвечает.
    drag(frame, [0.5, 0.5], [0.53, 0.52]);

    await waitFor(() => expect(saveArtifactBox).toHaveBeenCalled());
    const box = vi.mocked(saveArtifactBox).mock.calls[0][4];
    expect(box.x1 - box.x0).toBeCloseTo(HIGHLIGHT_MIN, 4);
    expect(box.y1 - box.y0).toBeCloseTo(HIGHLIGHT_MIN, 4);
  });

  it("без выбранного предмета протяжка ничего не сохраняет", () => {
    const { frame } = renderMarker();
    drag(frame, [0.2, 0.2], [0.7, 0.7]);
    expect(saveArtifactBox).not.toHaveBeenCalled();
    // И объясняет, чего не хватает — молчание тут читалось бы как поломка.
    expect(screen.getByText(/выбери предмет/)).toBeInTheDocument();
  });

  it("клик по кадру без протяжки рамку не заводит", () => {
    const { frame } = renderMarker();
    fireEvent.click(screen.getByRole("radio", { name: "Очки" }));
    drag(frame, [0.4, 0.4], [0.4, 0.4]);
    expect(saveArtifactBox).not.toHaveBeenCalled();
  });

  it("уже размеченные предметы видны на кадре", () => {
    const { container } = renderMarker({
      ...PHOTO,
      artifacts: [
        { artifactId: 9, name: "Футболка", imageUrl: null, x0: 0.1, y0: 0.1, x1: 0.5, y1: 0.5 },
      ],
    });
    const boxes = container.querySelectorAll(".marker-box");
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toHaveTextContent("Футболка");
    // Рамка стоит долями кадра, а не пикселями: кадр рендерится в произвольном размере.
    expect((boxes[0] as HTMLElement).style.left).toBe("10%");
    expect((boxes[0] as HTMLElement).style.width).toBe("40%");
  });

  it("перерисовка поверх уже размеченного предмета уходит той же парой кадр-предмет", async () => {
    const { frame } = renderMarker({
      ...PHOTO,
      artifacts: [
        { artifactId: 6, name: "Очки", imageUrl: null, x0: 0.1, y0: 0.1, x1: 0.2, y1: 0.2 },
      ],
    });
    fireEvent.click(screen.getByRole("radio", { name: "Очки" }));
    drag(frame, [0.5, 0.5], [0.9, 0.9]);

    await waitFor(() => expect(saveArtifactBox).toHaveBeenCalled());
    expect(vi.mocked(saveArtifactBox).mock.calls[0][3]).toBe(6);
  });

  it("Esc закрывает разметчик", () => {
    const { onClose } = renderMarker();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
