import { useImperativeHandle, useRef, type CSSProperties, type Ref } from 'react';
import type { Outfit } from '../../domain/wardrobe';
import { PLACEHOLDER_SHAPE, frameFor, outfitPicture } from './pictures';

export interface PictureFigureHandle {
  /** Turn to the platform angle: shows the nearest view, or leans a front-only picture. */
  setYaw: (deg: number) => void;
}

interface Props {
  outfit: Outfit;
  ref?: Ref<PictureFigureHandle>;
}

/**
 * You, as a picture standing on the platform: an HTML/CSS character with an
 * idle breath, a rim light in the outfit's color and a materialize effect
 * when the outfit changes. An outfit with a turnaround shows all eight sides
 * as the platform turns; a front-only picture leans with it instead. An
 * outfit whose picture isn't made yet shows your outline in its colors.
 */
export function PictureFigure({ outfit, ref }: Props) {
  const pic = outfitPicture(outfit.id);
  const frames = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const shownFrame = useRef(0);
  const c = outfit.colors;
  const style = {
    '--rim': c.glow ?? c.cape ?? c.top,
    '--top': c.top,
    '--bottom': c.bottom,
    '--shape': `url("${PLACEHOLDER_SHAPE}")`,
  } as CSSProperties;

  useImperativeHandle(ref, () => ({
    setYaw: (deg) => {
      if (pic?.frames) {
        const i = frameFor(deg);
        if (i === shownFrame.current) return;
        const kids = frames.current?.children;
        kids?.[shownFrame.current]?.classList.remove('is-on');
        kids?.[i]?.classList.add('is-on');
        shownFrame.current = i;
      } else if (body.current) {
        body.current.style.transform = `perspective(900px) rotateY(${(Math.sin((deg * Math.PI) / 180) * 16).toFixed(2)}deg)`;
      }
    },
  }));

  return (
    <div key={outfit.id} className={`pfig ${pic ? '' : 'pfig--pending'}`} style={style} data-outfit={outfit.id}>
      <span className="pfig__glow" aria-hidden="true" />
      <div ref={body} className="pfig__body">
        <div className="pfig__breath">
          {pic?.frames ? (
            <div ref={frames} className="pfig__frames">
              {pic.frames.map((src, i) => (
                <img key={src} className={`pfig__img ${i === 0 ? 'is-on' : ''}`} src={src} alt="" draggable={false} decoding="async" />
              ))}
            </div>
          ) : pic ? (
            <img className="pfig__img is-on" src={pic.src} alt="" draggable={false} decoding="async" />
          ) : (
            <span className="pfig__shape" />
          )}
        </div>
      </div>
      <span className="pfig__scan" aria-hidden="true" />
      <span className="pfig__shadow" aria-hidden="true" />
      {!pic && <span className="pfig__badge">Picture coming</span>}
    </div>
  );
}
