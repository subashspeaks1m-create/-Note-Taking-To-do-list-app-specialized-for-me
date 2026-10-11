import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { useReducedMotion } from '../../app/displayPrefs';
import type { Look } from '../../domain/character';
import { CharacterPortrait } from './CharacterPortrait';
import { Silhouette } from './Silhouette';

const IDLE_DEG_PER_SEC = 14;
const DRAG_DEG_PER_PX = 0.6;
const RESUME_AFTER_MS = 2500;
const RUNES = 'PURSUIT OF GREATNESS · LEARN · BUILD · EARN · BECOME · ';

/**
 * The character on a round platform. Drag (or use the arrow keys) to spin it;
 * it turns slowly on its own when left alone. A look with a 360° spin clip is
 * scrubbed frame by frame with the platform, so he turns all the way round.
 * A still look turns the platform and sways slightly.
 */
interface StageProps {
  look: Look;
  label: string;
  /** Platform skin id ('base' is the rune disc). */
  platform?: string;
  /** Streak transformation aura; dimmed while the streak is below its length. */
  aura?: { id: string; lit: boolean } | null;
}

export function CharacterStage({ look, label, platform = 'base', aura = null }: StageProps) {
  const reduced = useReducedMotion();
  const discRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const angle = useRef(0);
  const drag = useRef<{ x: number; start: number } | null>(null);
  const lastTouch = useRef(0);

  useEffect(() => {
    const apply = () => {
      const a = angle.current;
      if (discRef.current) discRef.current.style.transform = `rotateX(74deg) rotateZ(${-a}deg)`;
      const video = videoRef.current;
      if (video && video.duration > 0) {
        const t = ((((a % 360) + 360) % 360) / 360) * video.duration;
        if (Math.abs(video.currentTime - t) > 0.02) video.currentTime = t;
      } else if (figureRef.current) {
        figureRef.current.style.transform = `rotateY(${Math.sin((a * Math.PI) / 180) * 9}deg)`;
      }
    };
    let raf = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const idle = !drag.current && now - lastTouch.current > RESUME_AFTER_MS;
      if (idle && !reduced && document.visibilityState === 'visible') angle.current += IDLE_DEG_PER_SEC * dt;
      apply();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, look.id]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, start: angle.current };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    lastTouch.current = performance.now();
    if (!drag.current) return;
    angle.current = drag.current.start + (e.clientX - drag.current.x) * DRAG_DEG_PER_PX;
  };
  const endDrag = () => {
    drag.current = null;
    lastTouch.current = performance.now();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    lastTouch.current = performance.now();
    angle.current += e.key === 'ArrowLeft' ? -15 : 15;
  };

  return (
    <div
      className={`stage stage--${look.accent} plat--${platform}`}
      role="group"
      tabIndex={0}
      aria-roledescription="character stage"
      aria-label={`${label}. Drag or use the left and right arrow keys to spin.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    >
      <div className="stage__beam" aria-hidden="true" />
      <div className="stage__platform" aria-hidden="true">
        <span className="stage__deco" />
        <div ref={discRef} className="stage__disc">
          <svg viewBox="0 0 400 400">
            <defs>
              <radialGradient id="stage-floor">
                <stop offset="0" stopColor="var(--stage-glow)" stopOpacity="0.55" />
                <stop offset="0.55" stopColor="var(--stage-glow)" stopOpacity="0.12" />
                <stop offset="1" stopColor="#05070a" stopOpacity="0.95" />
              </radialGradient>
              <path id="stage-rune-path" d="M200 200m-158 0a158 158 0 1 1 316 0a158 158 0 1 1 -316 0" />
            </defs>
            <circle cx="200" cy="200" r="196" fill="url(#stage-floor)" stroke="var(--stage-glow)" strokeOpacity="0.9" strokeWidth="3" />
            <circle cx="200" cy="200" r="172" fill="none" stroke="var(--stage-glow)" strokeOpacity="0.5" strokeWidth="1.5" />
            <circle cx="200" cy="200" r="142" fill="none" stroke="var(--stage-glow)" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="2 10" />
            <circle cx="200" cy="200" r="96" fill="none" stroke="var(--stage-glow)" strokeOpacity="0.6" strokeWidth="2" />
            {Array.from({ length: 24 }, (_, i) => (
              <line key={i} x1="200" y1="6" x2="200" y2={i % 6 === 0 ? 30 : 18} stroke="var(--stage-glow)" strokeWidth={i % 6 === 0 ? 3 : 1.5} transform={`rotate(${i * 15} 200 200)`} />
            ))}
            <text fill="var(--stage-glow)" fillOpacity="0.75" fontSize="15" fontWeight="700" letterSpacing="3">
              <textPath href="#stage-rune-path">{RUNES + RUNES}</textPath>
            </text>
            <path d="M200 118 266 232H134Z" fill="none" stroke="var(--stage-glow)" strokeOpacity="0.7" strokeWidth="2" />
          </svg>
        </div>
        <div className="stage__rim" />
      </div>

      <div key={look.id} className="stage__figure-wrap">
        {aura && <span className={`stage__aura aura--${aura.id} ${aura.lit ? '' : 'aura--dim'}`} aria-hidden="true" />}
        <span className="stage__flash" aria-hidden="true" />
        <div ref={figureRef} className="stage__figure">
          {look.spin ? (
            <video ref={videoRef} className="stage__media" src={look.spin} poster={look.image} muted playsInline preload="auto" />
          ) : look.id === 'base' ? (
            <CharacterPortrait variant="chamber" className="stage__portrait" />
          ) : look.image ? (
            <img className="stage__media" src={look.image} alt="" draggable={false} />
          ) : (
            <Silhouette look={look} />
          )}
        </div>
      </div>

      <p className="stage__hint" aria-hidden="true">
        Drag to spin
      </p>
    </div>
  );
}
