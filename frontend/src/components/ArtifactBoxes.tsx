"use client";

import { useState } from "react";
import { padHighlight } from "@/lib/artifactHighlight";
import { laysOnSide } from "@/lib/artifactBox";
import type { ArtifactBoxView } from "@/lib/api/types";

/**
 * Рамки находок поверх кадра (§5.12). Позиция — **в процентах**: координаты приходят долями
 * кадра, а кадр рендерится в разном размере (мозаика, плёнка, полный экран), так что множитель
 * задаёт вёрстка. Держатель рамок обязан повторять пропорцию снимка — иначе проценты поедут.
 *
 * [shown] — чьи карточки сейчас раскрыты, **в порядке появления**: индекс задаёт высоту слоя,
 * поэтому в пересечении рамок сверху оказывается та, что открылась позже. В галерее это порядок
 * наведения, в полноэкранном кадре — просто все находки (тач-флоу, см. [PhotoLightbox]).
 */
export function ArtifactBoxes({ boxes, shown }: { boxes: ArtifactBoxView[]; shown: number[] }) {
  return (
    <>
      {boxes.map((a) => {
        // Рамка намеренно шире находки: показываем область, а не обводим предмет по краю.
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
            {/* Имя — в разметке ВСЕГДА: подсказка живёт по наведению, а ховера у скринридера
                нет, и без этого находка для него просто не существовала бы. */}
            <span className="sr-only">{a.name}</span>
            {shown.includes(a.artifactId) && (
              // Карточка предмета: сам предмет картинкой + имя под ней. Имя словами не объясняет,
              // что это за надпись на фото, — знакомый вырезанный предмет объясняет сразу.
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
 * Предмет внутри карточки-подсказки. Слот карточки **лежачий**, а предмет бывает нарисован
 * стоймя (ракетка ~1:3.3) — в contain он вырождается в нитку и опознать его нельзя. Поэтому
 * карточка уважает тот же флаг «можно набок», что и лента (DESIGN §7.2): флаг разрешает,
 * решает пропорция самой картинки, и меряется она только по факту загрузки — до `onLoad`
 * пропорции нет, а повернуть «на всякий случай» значит показать предмет боком.
 */
function ArtifactCardImage({ src, rotatable }: { src: string; rotatable: boolean }) {
  const [ratio, setRatio] = useState(0);
  // Слот лежачий ⇒ vertical = false.
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
