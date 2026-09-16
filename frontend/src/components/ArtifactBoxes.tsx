"use client";

import { useState } from "react";
import { padHighlight } from "@/lib/artifactHighlight";
import { laysOnSide } from "@/lib/artifactBox";
import type { ArtifactBoxView } from "@/lib/api/types";

/**
 * Detection boxes over a frame. Positions are PERCENTAGES, since coordinates arrive as fractions
 * while the frame renders at different sizes — so the holder must repeat the photo's aspect ratio
 * or they drift. [shown] is in order of appearance, which is what layers overlapping boxes. §5.12
 */
export function ArtifactBoxes({ boxes, shown }: { boxes: ArtifactBoxView[]; shown: number[] }) {
  return (
    <>
      {boxes.map((a) => {
        // The box is deliberately wider than the find: it shows an AREA rather than outlining
        // the object's edge.
        const r = padHighlight(a);
        return (
          <span
            key={a.artifactId}
            className="artifact-box"
            style={{
              left: `${r.x0 * 100}%`,
              top: `${r.y0 * 100}%`,
              width: `${r.width * 100}%`,
              height: `${r.height * 100}%`,
            }}
          >
            {/* The name is ALWAYS in the markup: the hint lives on hover, a screen reader has none,
                and without this the finding would not exist for it. */}
            <span className="sr-only">{a.name}</span>
            {shown.includes(a.artifactId) && (
              // The item card: the object itself as a picture with its name below. Words would not
              // explain what that lettering on the photo is; the cut-out object explains at once.
              <span
                className="artifact-card"
                aria-hidden
                style={{ zIndex: shown.indexOf(a.artifactId) + 1 }}
              >
                {a.imageUrl && (
                  <ArtifactCardImage src={a.imageUrl} rotatable={a.rotatable === true} />
                )}
                <span className="artifact-card__name">{a.name}</span>
              </span>
            )}
          </span>
        );
      })}
    </>
  );
}

/**
 * The item inside a hint card. The slot is LANDSCAPE while an item may be drawn upright, where
 * `contain` would shrink it to a thread — so the card honours the same "may lie on its side" flag
 * as the ribbon, and measures the picture only on load. DESIGN §7.2
 */
function ArtifactCardImage({ src, rotatable }: { src: string; rotatable: boolean }) {
  const [ratio, setRatio] = useState(0);
  // The slot is landscape, hence vertical = false.
  const tilted = laysOnSide(ratio, rotatable, false);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={`artifact-card__img${tilted ? " artifact-card__img--tilted" : ""}`}
      onLoad={(e) => {
        const img = e.currentTarget;
        if (img.naturalHeight > 0) setRatio(img.naturalWidth / img.naturalHeight);
      }}
    />
  );
}
