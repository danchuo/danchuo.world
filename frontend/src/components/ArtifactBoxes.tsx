"use client";

import { useState } from "react";
import { padHighlight } from "@/lib/artifactHighlight";
import { laysOnSide } from "@/lib/artifactBox";
import type { ArtifactBoxView } from "@/lib/api/types";
import { Artifact3D } from "./Artifact3D";

/**
 * Detection boxes over a frame. Positions are PERCENTAGES, since coordinates arrive as fractions
 * while the frame renders at different sizes — so the holder must repeat the photo's aspect ratio
 * or they drift. [shown] is in order of appearance, which is what layers overlapping boxes. §5.12
 */
export function ArtifactBoxes({
  boxes,
  shown,
  aside = false,
}: {
  boxes: ArtifactBoxView[];
  shown: number[];
  /**
   * Stand the found thing BESIDE the frame instead of over it. The reel edition has room to
   * either side of the photograph, and a thing on bare ground needs no plate. DESIGN §7.5
   */
  aside?: boolean;
}) {
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
            data-shown={shown.includes(a.artifactId) ? "" : undefined}
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
            {!aside && shown.includes(a.artifactId) && (
              // The item card: the object itself with its name below. Words would not explain what
              // that lettering on the photo is; the thing explains at once.
              <span
                className="artifact-card"
                aria-hidden
                style={{ zIndex: shown.indexOf(a.artifactId) + 1 }}
              >
                <ArtifactFace artifact={a} />
                <span className="artifact-card__name">{a.name}</span>
              </span>
            )}
          </span>
        );
      })}

      {aside && shown.length > 0 && (
        /* One column beside the frame rather than a card per find: two finds under one hand are
           read together, and the photograph stays a photograph. */
        <span className="artifact-finds" aria-hidden>
          {shown.map((id) => {
            const found = boxes.find((b) => b.artifactId === id);
            return found ? (
              <span className="artifact-find" key={id}>
                <ArtifactFace artifact={found} aside />
                <span className="artifact-find__name">{found.name}</span>
              </span>
            ) : null;
          })}
        </span>
      )}
    </>
  );
}

/** The thing itself when it has a model, its picture when it has not. DESIGN §7.5 */
function ArtifactFace({ artifact, aside = false }: { artifact: ArtifactBoxView; aside?: boolean }) {
  const slot = aside ? "artifact-find__face" : "artifact-card__model";
  if (artifact.model3dUrl) {
    /* Turning: the card appeared in answer to the hand on the box, so the thing is under attention
       even though the pointer is not on it. */
    return <Artifact3D src={artifact.model3dUrl} className={slot} spin />;
  }
  if (!artifact.imageUrl) return null;
  /* A drawn item in the SAME square slot, so a set of finds does not jump in size depending on
     which of them happens to carry a model. The flat one simply does not turn. */
  if (aside) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={artifact.imageUrl} alt="" className={slot} />;
  }
  return <ArtifactCardImage src={artifact.imageUrl} rotatable={artifact.rotatable === true} />;
}

/**
 * The PICTURE of an item over the frame. The slot is LANDSCAPE while an item may be drawn upright,
 * where `contain` would shrink it to a thread — so the card honours the same "may lie on its side"
 * flag as the ribbon, and measures the picture only on load. DESIGN §7.2
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
