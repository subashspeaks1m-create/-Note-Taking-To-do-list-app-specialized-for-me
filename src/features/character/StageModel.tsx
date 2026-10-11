import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import type { Outfit } from '../../domain/wardrobe';
import type { ModelSource } from '../vault/models';
import { ViewerEngine } from '../vault/viewerEngine';

export interface StageModelHandle {
  setYaw: (deg: number) => void;
}

interface Props {
  source: ModelSource;
  outfit: Outfit;
  /** Called when the model is on screen. */
  onReady: () => void;
  /** Called once if the model can't be shown (no WebGL, file failed), so the stage falls back to 2D. */
  onFail: () => void;
  ref?: Ref<StageModelHandle>;
}

/** The real 3D character standing on the Character page's own platform, turned by the stage. */
export function StageModel({ source, outfit, onReady, onFail, ref }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<ViewerEngine | null>(null);
  const failed = useRef(onFail);
  const ready = useRef(onReady);
  useEffect(() => {
    failed.current = onFail;
    ready.current = onReady;
  });

  useEffect(() => {
    if (!host.current) return;
    try {
      engine.current = new ViewerEngine(
        host.current,
        (s) => {
          if (s.state === 'model') ready.current();
          else if (s.state === 'error') failed.current();
        },
        { embedded: true },
      );
    } catch {
      failed.current();
      return;
    }
    return () => {
      engine.current?.dispose();
      engine.current = null;
    };
  }, []);

  useEffect(() => {
    void engine.current?.show(source, outfit.colors);
  }, [source, outfit]);

  useImperativeHandle(ref, () => ({ setYaw: (deg) => engine.current?.setYaw(deg) }));

  return <div ref={host} className="stage__model" role="img" aria-label={`You in 3D, wearing ${outfit.name}`} />;
}
