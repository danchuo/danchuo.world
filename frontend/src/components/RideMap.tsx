"use client";

import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

interface RideMapProps {
  startLat: number;
  startLon: number;
  finishLat: number;
  finishLon: number;
  /** The active wave, which picks the set of pixel pins (RIDE_PINS). */
  wave?: string | null;
  /**
   * An interactive map: it can be panned, zoomed and hovered for a station's address. Only enabled
   * where the map is not wrapped in a clickable button. In the tile it stays `false` — the map is
   * static and the click belongs to the "open the map" button.
   */
  interactivePins?: boolean;
  /** Start address — a hint on the start pin, only with `interactivePins`. */
  startLabel?: string | null;
  /** Finish address — a hint on the finish pin, only with `interactivePins`. */
  finishLabel?: string | null;
  /**
   * The map is showing terrain, not an empty box. Needed by whoever WAITS for it: the develop
   * transition carries the map from tile to modal, and starting the flight before the first frame
   * would fly an empty rectangle across the screen. It never fires if the map failed to start.
   */
  onReady?: () => void;
}

/**
 * The Velobike ride mini-map. There are only two points — start and finish, as the API gives no
 * track — so it draws two markers and a DASHED ARC between them: honestly "A to B", not a path
 * travelled. Rendered by MapLibre GL from a vector style. DESIGN §7.6
 */
const ARC_COLOR = "#c2603f";

/**
 * Pixel pins per wave. On a mini-map a pin is tiny, so the sprites are deliberately SIMPLIFIED for
 * that size; detailed versions wait beside them for a future large map. Their size stays FIXED
 * rather than fractional — stretching them would show off the simplification. DESIGN §12
 */
interface PinSpec {
  url: string;
  w: number;
  h: number;
}
const RIDE_PINS: Record<string, { start: PinSpec; finish: PinSpec }> = {
  "wave-01": {
    start: { url: "/assets/waves/wave-01/decor/pin-start.png", w: 27, h: 34 },
    finish: { url: "/assets/waves/wave-01/decor/pin-finish.png", w: 27, h: 34 },
  },
};

/**
 * The map's base layer, ONE for every wave, tile and modal alike — different styles would tear the
 * develop transition apart mid-flight. Light on purpose, and free of keys or limits: VersaTiles on
 * OpenStreetMap data. A dark style was considered and rejected. DESIGN §7.6
 */
const MAP_STYLE = "https://tiles.versatiles.org/assets/styles/colorful/style.json";

/**
 * How far manual zoom is allowed in the window. The vector is drawn from geometry, so the limit hits
 * nothing technical — the number is chosen by meaning: 19 is a single courtyard.
 */
const MAX_ZOOM = 19;

/**
 * Ceiling for AUTOMATIC framing. Without it a ride "from the door to the next building" would open
 * flat against the asphalt: a box around two points does not care how close they are.
 */
const FIT_MAX_ZOOM = 16;

/**
 * The MapLibre worker's address, and a condition of the map working at all: the worker imports a
 * sibling file RELATIVE TO ITSELF, which Next's bundler cannot see, so the import 404s and the
 * worker dies silently — style background, no streets, no errors. See docs/pitfalls.md.
 */
const WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";

/** Points of a quadratic Bézier from s to f, with the control point pushed out perpendicular. */
function arcPoints(s: [number, number], f: [number, number]): [number, number][] {
  const k = 0.18;
  const mLat = (s[0] + f[0]) / 2;
  const mLon = (s[1] + f[1]) / 2;
  const dLat = f[0] - s[0];
  const dLon = f[1] - s[1];
  const cLat = mLat - dLon * k;
  const cLon = mLon + dLat * k;
  const pts: [number, number][] = [];
  for (let t = 0; t <= 1.0001; t += 0.04) {
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    pts.push([a * s[0] + b * cLat + c * f[0], a * s[1] + b * cLon + c * f[1]]);
  }
  return pts;
}

/** A polyline of `[lat, lon]` pairs as GeoJSON, where coordinates run the other way (`[lon, lat]`). */
function lineOf(points: [number, number][]) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString" as const, coordinates: points.map(([la, lo]) => [lo, la]) },
  };
}

/**
 * The "reset view" button, third in the zoom stack and only in the modal, where the map can be
 * moved at all. It is custom because only the caller knows the framing. The return FLIES, unlike
 * the instant resize refit: a jump from a strange part of the city would read as a new map.
 */
function resetViewControl(refit: (duration?: number) => void) {
  return {
    onAdd() {
      const group = document.createElement("div");
      group.className = "maplibregl-ctrl maplibregl-ctrl-group";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ride-map__reset";
      button.title = "Вернуть карту к поездке";
      button.setAttribute("aria-label", "Вернуть карту к поездке");
      // The glyph is a reticle: a frame with the ride's point at its centre. Drawn in `currentColor`,
      // so it takes the button's colour and follows the wave (the zoomer's native buttons get their
      // glyph as a mask image, which a wave recolours with a filter).
      button.innerHTML =
        '<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">' +
        '<path d="M7.5 1.5v2M7.5 11.5v2M1.5 7.5h2M11.5 7.5h2" stroke="currentColor" ' +
        'stroke-width="1.3" stroke-linecap="round"/>' +
        '<circle cx="7.5" cy="7.5" r="3.6" stroke="currentColor" stroke-width="1.3"/>' +
        '<circle cx="7.5" cy="7.5" r="1.2" fill="currentColor"/></svg>';
      button.addEventListener("click", () => refit(420));
      group.appendChild(button);
      return group;
    },
    onRemove() {},
  };
}

export function RideMap({
  startLat,
  startLon,
  finishLat,
  finishLon,
  wave,
  interactivePins,
  startLabel,
  finishLabel,
  onReady,
}: RideMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const interactive = !!interactivePins;
  // The callback goes through a ref: it arrives from the caller's render and changes identity on each
  // one, so standing in an effect's dependencies it would rebuild the whole map for nothing.
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let map: any = null;
    let ro: ResizeObserver | null = null;
    let attribWatch: MutationObserver | null = null;

    // Named exports rather than `default`: maplibre-gl has none.
    import("maplibre-gl").then((maplibregl) => {
      if (cancelled || !ref.current) return;
      maplibregl.setWorkerUrl(WORKER_URL);
      const start: [number, number] = [startLat, startLon];
      const finish: [number, number] = [finishLat, finishLon];
      const pins = wave ? RIDE_PINS[wave] : undefined;

      // In the TILE the map is static — it is a widget, not an atlas, and the whole thing is one
      // button. In the MODAL it pans and zooms, and the zoom control and provider attribution
      // appear with that: an interactive map may not be shown without attribution.
      map = new maplibregl.Map({
        container: el,
        style: MAP_STYLE,
        center: [(startLon + finishLon) / 2, (startLat + finishLat) / 2],
        zoom: 12,
        maxZoom: MAX_ZOOM,
        interactive,
        attributionControl: interactive ? { compact: true } : false,
        // Rotation and tilt are off FOREVER, in both modes: the board looks at the map from above,
        // as at a diagram, and a tilted city would read as a fault rather than a feature.
        dragRotate: false,
        pitchWithRotate: false,
        // `preserveDrawingBuffer`: without it the map is on screen but blank in any SNAPSHOT —
        // WebGL drops the buffer after presenting a frame: visual regression, screenshots and the
        // modal's flight preview (RideTile) would get a blank. Antialiasing goes with it.
        canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
      });
      if (interactive) {
        map.touchZoomRotate?.disableRotation();
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
      }

      // The provider attribution is COLLAPSED to an "i" and its links open in a new tab; both have
      // to be forced. `compact: true` means "has a collapse button", not "is collapsed", and the
      // links arrive as an HTML string from the style with no `target`. An observer redoes both.
      const attrib = el.querySelector(".maplibregl-ctrl-attrib");
      if (attrib) {
        const tame = () => {
          attrib.classList.remove("maplibregl-compact-show");
          attrib.removeAttribute("open");
          for (const link of Array.from(attrib.querySelectorAll("a"))) {
            link.target = "_blank";
            link.rel = "noreferrer";
          }
        };
        tame();
        attribWatch = new MutationObserver(tame);
        attribWatch.observe(attrib, { childList: true, subtree: true });
      }

      const bounds = () => {
        const b = new maplibregl.LngLatBounds();
        b.extend([startLon, startLat]);
        b.extend([finishLon, finishLat]);
        return b;
      };

      // Framing is recomputed on EVERY container resize, not just on mount. Zoom means "metres per
      // pixel": tuned for one size, a bigger container keeps the scale and merely shows more empty
      // map, so the points drift together. A repeated fitBounds keeps the FRAMING constant. §8.1
      const refit = (duration = 0) => {
        if (!map) return;
        map.resize();
        const box = el.getBoundingClientRect();
        if (box.width < 40 || box.height < 40) return;
        // Air around the route is a share of the frame rather than pixels, so it reads the same on the
        // tile and in the window. The pin's height is added on top: a
        // pixel pin hangs its head ABOVE its point and the top edge would cut it without the slack.
        const breathe = Math.min(box.width, box.height) * 0.14;
        const top = breathe + (pins ? 34 : 0) + (interactive ? 18 : 0);
        // Ceiling on the padding: framing into a negative remainder is impossible, and on a narrow
        // tile the sum could easily eat the whole frame.
        const capY = box.height * 0.4;
        const capX = box.width * 0.4;
        map.fitBounds(bounds(), {
          padding: {
            top: Math.min(top, capY),
            bottom: Math.min(breathe, capY),
            left: Math.min(breathe, capX),
            right: Math.min(breathe, capX),
          },
          duration,
          maxZoom: FIT_MAX_ZOOM,
        });
      };

      map.once("load", () => {
        if (cancelled) return;
        map.addSource("arc", { type: "geojson", data: lineOf(arcPoints(start, finish)) });
        map.addLayer({
          id: "arc",
          type: "line",
          source: "arc",
          layout: { "line-cap": "round", "line-join": "round" },
          // The dash is given in LINE WIDTHS, not pixels: 4/5 px at a width of 2.5 means 1.6/2.
          paint: {
            "line-color": ARC_COLOR,
            "line-width": 2.5,
            "line-opacity": 0.9,
            "line-dasharray": [1.6, 2],
          },
        });
        refit();
        /* ⚠️ Ready on `idle`, NOT on `load`: `load` means the STYLE is up, while the city tiles are
           still travelling, and a wave switch (which has its data already) then uncovered the tile
           over a blank map. `idle` is the first frame with nothing left to fetch. DESIGN §7.10 */
        map.once("idle", () => {
          if (!cancelled) readyRef.current?.();
        });
      });

      /**
       * A marker with an address tooltip on hover. `anchor` is what actually stands on the point —
       * the pixel pin's sharp tip, or a fallback circle's centre. Shifting the node with our own
       * `transform` is impossible: the map rewrites a marker's `transform` every frame.
       */
      const addMarker = (
        p: [number, number],
        node: HTMLElement,
        label: string | null | undefined,
        offsetY: number,
        anchor: "bottom" | "center",
      ) => {
        new maplibregl.Marker({ element: node, anchor }).setLngLat([p[1], p[0]]).addTo(map);
        if (!interactive || !label) return;
        const popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: [0, offsetY],
          className: "ride-pin-tip",
        }).setText(label);
        node.style.pointerEvents = "auto";
        node.addEventListener("mouseenter", () => popup.setLngLat([p[1], p[0]]).addTo(map));
        node.addEventListener("mouseleave", () => popup.remove());
      };

      if (pins) {
        // Pixel pins: the anchor is the sharp tip (bottom centre) and the head rises above the point.
        const addPin = (p: [number, number], spec: PinSpec, label: string | null | undefined) => {
          const img = document.createElement("img");
          img.src = spec.url;
          img.width = spec.w;
          img.height = spec.h;
          img.alt = "";
          img.className = "ride-pin-icon";
          addMarker(p, img, label, -spec.h, "bottom");
        };
        addPin(start, pins.start, startLabel);
        addPin(finish, pins.finish, finishLabel);
      } else {
        const addDot = (p: [number, number], color: string, label: string | null | undefined) => {
          const dot = document.createElement("span");
          dot.className = "ride-pin-dot";
          dot.style.background = color;
          addMarker(p, dot, label, -10, "center");
        };
        addDot(start, "#2f9e44", startLabel);
        addDot(finish, "#e03131", finishLabel);
      }

      // The control is added AFTER the zoomer and also top-left: controls in one corner stack in the
      // order they are added, so "reset the view" lands under `+`/`−`, as asked.
      if (interactive) map.addControl(resetViewControl(refit), "top-left");
      refit();

      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(() => refit());
        ro.observe(el);
      }
    });

    return () => {
      cancelled = true;
      if (ro) ro.disconnect();
      if (attribWatch) attribWatch.disconnect();
      if (map) map.remove();
    };
  }, [startLat, startLon, finishLat, finishLon, wave, interactive, startLabel, finishLabel]);

  // `isolation: isolate` gives a stacking context of its own: the map's internal z-indexes otherwise
  // leak to the root and paint OVER modals (z-50). Isolation locks them inside the tile, so any fixed
  // overlay stays above the map.
  return (
    <div
      ref={ref}
      // `ride-map` is the permanent hook for a wave's skin.
      className="ride-map"
      // pointer-events: `none` in the tile, where the map is static and a click passes through it to
      // the "open the map" button; `auto` in the modal, where the map is dragged and pins catch hover.
      style={{
        width: "100%",
        height: "100%",
        borderRadius: "var(--radius-sm)",
        isolation: "isolate",
        pointerEvents: interactive ? "auto" : "none",
      }}
      aria-hidden
    />
  );
}
