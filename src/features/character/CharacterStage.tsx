import { lazy, Suspense, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useReducedMotion } from '../../app/displayPrefs';
import { Art } from '../../components/art/Art';
import type { Look } from '../../domain/character';
import type { GearState } from '../../domain/equipment';
import type { Outfit } from '../../domain/wardrobe';
import type { ModelSource } from '../vault/models';
import { CharacterPortrait } from './CharacterPortrait';
import type { StageModelHandle } from './StageModel';
import { Silhouette } from './Silhouette';

// Three.js is large, so the 3D model loads only when there is one to show.
const StageModel = lazy(() => import('./StageModel').then((m) => ({ default: m.StageModel })));

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
  /** Gear that orbits the platform; slots with nothing yet are left out. */
  gear?: GearState[];
  /** Your real 3D model in today's outfit; shown instead of the 2D look when it loads. */
  model?: { source: ModelSource; outfit: Outfit } | null;
}

export function CharacterStage({ look, label, platform = 'base', aura = null, gear = [], model = null }: StageProps) {
  const reduced = useReducedMotion();
  const discRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const orbitRef = useRef<HTMLDivElement>(null);
  const angle = useRef(0);
  const drag = useRef<{ x: number; start: number } | null>(null);
  const lastTouch = useRef(0);
  const modelRef = useRef<StageModelHandle>(null);
  const [modelFailed, setModelFailed] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const use3d = !!model && !modelFailed;

  useEffect(() => {
    const apply = () => {
      const a = angle.current;
      if (discRef.current) discRef.current.style.transform = `rotateX(74deg) rotateZ(${-a}deg)`;
      const video = videoRef.current;
      if (use3d) {
        modelRef.current?.setYaw(a);
        if (figureRef.current) figureRef.current.style.transform = '';
      } else if (video && video.duration > 0) {
        const t = ((((a % 360) + 360) % 360) / 360) * video.duration;
        if (Math.abs(video.currentTime - t) > 0.02) video.currentTime = t;
      } else if (figureRef.current) {
        figureRef.current.style.transform = `rotateY(${Math.sin((a * Math.PI) / 180) * 9}deg)`;
      }
      // Gear circles the platform with it: front pieces pass in front of him, back ones behind.
      const orbs = orbitRef.current?.children;
      if (orbs) {
        for (let i = 0; i < orbs.length; i++) {
          const el = orbs[i] as HTMLElement;
          const th = ((a + (i * 360) / orbs.length) * Math.PI) / 180;
          const depth = Math.cos(th);
          el.style.setProperty('--ox', Math.sin(th).toFixed(4));
          el.style.setProperty('--oy', depth.toFixed(4));
          el.style.setProperty('--os', (0.78 + 0.22 * depth).toFixed(3));
          el.style.zIndex = depth > 0 ? '3' : '1';
        }
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
  }, [reduced, look.id, use3d]);

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

      {gear.some((g) => g.current) && (
        <div ref={orbitRef} className="stage__orbit" aria-hidden="true">
          {gear
            .filter((g) => g.current)
            .map((g) => (
              <span key={g.slot.id} className={`orb orb--${g.slot.tone} orb--t${g.tier}`}>
                <Art name={g.current!.art} size={40} motion="float" />
              </span>
            ))}
        </div>
      )}

      <div key={use3d ? '3d' : look.id} className="stage__figure-wrap">
        {aura && <span className={`stage__aura aura--${aura.id} ${aura.lit ? '' : 'aura--dim'}`} aria-hidden="true" />}
        <span className="stage__flash" aria-hidden="true" />
        <div ref={figureRef} className="stage__figure">
          {use3d && (
            <Suspense fallback={null}>
              <StageModel ref={modelRef} source={model!.source} outfit={model!.outfit} onReady={() => setModelReady(true)} onFail={() => setModelFailed(true)} />
            </Suspense>
          )}
          {/* The 2D look stays until the 3D model has loaded, and is the fallback if it can't. */}
          {!(use3d && modelReady) &&
            (look.spin ? (
              <video ref={videoRef} className="stage__media" src={look.spin} poster={look.image} muted playsInline preload="auto" />
            ) : look.id === 'base' ? (
              <CharacterPortrait variant="chamber" className="stage__portrait" />
            ) : look.image ? (
              <img className="stage__media" src={look.image} alt="" draggable={false} />
            ) : (
              <Silhouette look={look} />
            ))}
        </div>
      </div>

      <p className="stage__hint" aria-hidden="true">
        Drag to spin
      </p>
    </div>
  );
}
