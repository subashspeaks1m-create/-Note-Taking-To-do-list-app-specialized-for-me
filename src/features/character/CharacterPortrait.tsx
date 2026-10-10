import { useEffect, useRef, useState } from 'react';
import { CHARACTER_MEDIA } from '../../domain/config';
import { useDisplayPrefs, useReducedMotion } from '../../app/displayPrefs';

interface Props {
  /** Visual size preset. The portrait is always contained, never cropped. */
  variant: 'strip' | 'chamber' | 'mini';
  className?: string;
}

type Mode = 'video' | 'still' | 'error';

/**
 * The user's base character from the supplied video. The source has a baked
 * black background, so it sits in a deliberately black framed stage; no blend
 * modes are used because the dark hair and hoodie are part of the character.
 *
 * Playback rules: muted, inline, poster first; paused when the tab is hidden
 * or the stage is offscreen; reduced motion and failed playback fall back to
 * the still frame.
 */
export function CharacterPortrait({ variant, className }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { prefs } = useDisplayPrefs();
  const wantsVideo = !reduced && !prefs.lowGraphics && prefs.avatarPlayback === 'auto' && variant !== 'mini';
  const [videoFailed, setVideoFailed] = useState(false);
  const [stillFailed, setStillFailed] = useState(false);
  const [posterSrc, setPosterSrc] = useState<string>(CHARACTER_MEDIA.poster);
  const mode: Mode = stillFailed ? 'error' : wantsVideo && !videoFailed ? 'video' : 'still';

  useEffect(() => {
    const video = videoRef.current;
    const wrap = wrapRef.current;
    if (mode !== 'video' || !video || !wrap) return;

    let onScreen = false;
    const sync = () => {
      if (onScreen && document.visibilityState === 'visible') {
        video.play().catch((err: unknown) => {
          // A pause racing a play rejects with AbortError; that's not a failure.
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setVideoFailed(true);
        });
      } else {
        video.pause();
      }
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = !!entry?.isIntersecting;
        sync();
      },
      { threshold: 0.15 },
    );
    observer.observe(wrap);
    document.addEventListener('visibilitychange', sync);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
      video.pause();
    };
  }, [mode]);

  return (
    <div ref={wrapRef} className={`portrait portrait--${variant} ${className ?? ''}`}>
      {mode === 'video' ? (
        <video
          ref={videoRef}
          className="portrait__media"
          src={CHARACTER_MEDIA.video}
          poster={posterSrc}
          muted
          playsInline
          loop
          preload="metadata"
          aria-label="Your character: an illustrated portrait with curly hair, a beard and glowing cyan eyes, wearing a black hoodie"
          onError={() => setVideoFailed(true)}
        />
      ) : mode === 'still' ? (
        <img
          className="portrait__media"
          src={posterSrc}
          alt="Your character: an illustrated portrait with curly hair, a beard and glowing cyan eyes, wearing a black hoodie"
          decoding="async"
          onError={() => {
            if (posterSrc !== CHARACTER_MEDIA.posterFallback) setPosterSrc(CHARACTER_MEDIA.posterFallback);
            else setStillFailed(true);
          }}
        />
      ) : (
        <div className="portrait__error" role="img" aria-label="Character image could not load">
          <span>Portrait unavailable</span>
        </div>
      )}
    </div>
  );
}
