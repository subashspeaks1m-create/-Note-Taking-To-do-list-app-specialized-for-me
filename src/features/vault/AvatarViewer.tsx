import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import type { Outfit } from '../../domain/wardrobe';
import { modelSource } from './models';
import { ViewerEngine, type ViewerStatus } from './viewerEngine';

export interface ViewerHandle {
  view: (deg: number) => void;
  rotateBy: (deg: number) => void;
  fit: () => void;
}

interface Props {
  outfit: Outfit;
  accent: string;
  autoRotate: boolean;
  reducedMotion: boolean;
  /** Must be stable (a state setter): the engine is created once with it. */
  onStatus: (s: ViewerStatus | { state: 'no-webgl' }) => void;
  ref?: Ref<ViewerHandle>;
}

/** The WebGL chamber. Owns one engine for its lifetime and swaps outfits inside it. */
export function AvatarViewer({ outfit, accent, autoRotate, reducedMotion, onStatus, ref }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<ViewerEngine | null>(null);

  useEffect(() => {
    if (!host.current) return;
    try {
      engine.current = new ViewerEngine(host.current, onStatus);
    } catch {
      // No WebGL (old device, blocked GPU): the vault still works as a list.
      onStatus({ state: 'no-webgl' });
      return;
    }
    return () => {
      engine.current?.dispose();
      engine.current = null;
    };
  }, [onStatus]);

  useEffect(() => {
    void engine.current?.show(modelSource(outfit.id), outfit.colors);
  }, [outfit]);

  useEffect(() => engine.current?.setAccent(accent), [accent]);
  useEffect(() => engine.current?.setMotion({ autoRotate: autoRotate && !reducedMotion, reducedMotion }), [autoRotate, reducedMotion]);

  useImperativeHandle(ref, () => ({
    view: (deg) => engine.current?.view(deg),
    rotateBy: (deg) => engine.current?.rotateBy(deg),
    fit: () => engine.current?.fit(),
  }));

  return <div ref={host} className="viewer" />;
}
