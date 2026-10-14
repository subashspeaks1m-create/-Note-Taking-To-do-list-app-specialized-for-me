import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { layoutMindMap, type MapLayout, type PlacedNode } from './mindMapLayout';
import type { MindMap } from './schema';

const PAD = 40;
const MIN_SCALE = 0.2;
const MAX_SCALE = 2.5;

interface View {
  scale: number;
  x: number;
  y: number;
}

export function MindMapView({ map }: { map: MindMap }) {
  const [mode, setMode] = useState<'map' | 'outline'>('map');
  return (
    <div className="mindmap">
      <div className="section-row">
        <p className="muted">Tap a node to fold or unfold it. Drag to move, use the buttons or Ctrl + scroll to zoom.</p>
        <div className="segmented" role="group" aria-label="Mind map view">
          <button type="button" className="segmented__btn" aria-pressed={mode === 'map'} onClick={() => setMode('map')}>
            Map
          </button>
          <button type="button" className="segmented__btn" aria-pressed={mode === 'outline'} onClick={() => setMode('outline')}>
            Outline
          </button>
        </div>
      </div>
      {mode === 'map' ? <MapCanvas map={map} /> : <Outline map={map} />}
    </div>
  );
}

function fitView(layout: MapLayout, width: number, height: number): View {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min((width - PAD * 2) / layout.width, (height - PAD * 2) / layout.height, 1.1)));
  return {
    scale,
    x: width / 2 - (layout.minX + layout.width / 2) * scale,
    y: height / 2 - (layout.minY + layout.height / 2) * scale,
  };
}

function MapCanvas({ map }: { map: MindMap }) {
  // Start with leaves folded so the first view is readable; everything is one tap away.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(map.branches.flatMap((b, bi) => b.children.map((_, ci) => `b${bi}.${ci}`))));
  const layout = useMemo(() => layoutMindMap(map, collapsed), [map, collapsed]);
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View | null>(null);
  const [selected, setSelected] = useState<PlacedNode | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; pinch?: number }>({ moved: false });

  const fit = useCallback(() => {
    const el = box.current;
    if (el) setView(fitView(layout, el.clientWidth, el.clientHeight));
  }, [layout]);

  // Refit only when the map itself changes, not on every fold.
  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current) {
      fit();
      fitted.current = true;
    }
  }, [fit]);

  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    const el = box.current;
    if (!el) return;
    setView((v) => {
      if (!v) return v;
      const px = cx ?? el.clientWidth / 2;
      const py = cy ?? el.clientHeight / 2;
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      const k = scale / v.scale;
      return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  };

  const onPointerDown = (e: PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) gesture.current = { moved: false };
  };
  const onPointerMove = (e: PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const pts = pointers.current;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const before = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [c, d] = [...pts.values()];
      const after = Math.hypot(c!.x - d!.x, c!.y - d!.y);
      const rect = box.current!.getBoundingClientRect();
      if (before > 0) zoomAt(after / before, (c!.x + d!.x) / 2 - rect.left, (c!.y + d!.y) / 2 - rect.top);
      gesture.current.moved = true;
      return;
    }
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    if (!gesture.current.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
    // Capture only once a drag starts, so a plain tap still clicks the node under it.
    if (!gesture.current.moved) (e.currentTarget as Element).setPointerCapture(e.pointerId);
    gesture.current.moved = true;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setView((v) => (v ? { ...v, x: v.x + dx, y: v.y + dy } : v));
  };
  const onPointerUp = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
  };
  // React wheel listeners are passive, so attach natively to be able to stop page zoom.
  const zoomRef = useRef(zoomAt);
  useEffect(() => {
    zoomRef.current = zoomAt;
  });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomRef.current(Math.exp(-e.deltaY * 0.0025), e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const toggle = (n: PlacedNode) => {
    if (gesture.current.moved) return;
    setSelected(n);
    if (n.depth === 0 || n.childCount === 0) return;
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(n.id)) next.delete(n.id);
      else next.add(n.id);
      return next;
    });
  };

  const setAll = (fold: boolean) => {
    if (!fold) setCollapsed(new Set());
    else setCollapsed(new Set(map.branches.map((_, bi) => `b${bi}`)));
  };

  return (
    <>
      <div className="mm-toolbar">
        <button type="button" className="btn btn--quiet btn--sm" onClick={() => zoomAt(1.25)} aria-label="Zoom in">
          +
        </button>
        <button type="button" className="btn btn--quiet btn--sm" onClick={() => zoomAt(0.8)} aria-label="Zoom out">
          −
        </button>
        <button type="button" className="btn btn--quiet btn--sm" onClick={fit}>
          Fit
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAll(false)}>
          Expand all
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAll(true)}>
          Collapse all
        </button>
      </div>
      <div
        ref={box}
        className="mm-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <svg width="100%" height="100%" role="img" aria-label={`Mind map: ${map.center}`}>
          {view && (
            <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
              {layout.links.map((l) => (
                <path key={l.id} d={l.d} className={`mm-link mm-b${l.branch % 7}`} strokeWidth={l.depth === 1 ? 3 : l.depth === 2 ? 2 : 1.4} />
              ))}
              {layout.nodes.map((n) => (
                <g
                  key={n.id}
                  className={`mm-node mm-node--d${n.depth} ${n.branch >= 0 ? `mm-b${n.branch % 7}` : ''} ${selected?.id === n.id ? 'mm-node--selected' : ''}`}
                  transform={`translate(${n.x} ${n.y})`}
                  onClick={() => toggle(n)}
                >
                  <title>{n.note ? `${n.label}: ${n.note}` : n.label}</title>
                  <rect width={n.w} height={n.h} rx={n.depth === 0 ? 18 : 10} />
                  <text x={n.w / 2} y={12} textAnchor="middle">
                    {n.lines.map((line, i) => (
                      <tspan key={i} x={n.w / 2} dy={i === 0 ? (n.depth === 0 ? 20 : n.depth === 1 ? 17 : 15) : n.depth === 0 ? 20 : n.depth === 1 ? 18 : n.depth === 2 ? 17 : 16}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                  {n.childCount > 0 && n.depth > 0 && (
                    <g transform={`translate(${n.side === 1 ? n.w : 0} ${n.h / 2})`} className="mm-fold">
                      <circle r={9} />
                      <text textAnchor="middle" dy={4}>
                        {n.collapsed ? n.childCount : '−'}
                      </text>
                    </g>
                  )}
                </g>
              ))}
            </g>
          )}
        </svg>
      </div>
      {selected && (
        <div className="mm-detail" role="status">
          <p className="mm-detail__label">{selected.label}</p>
          {selected.note && <p className="muted">{selected.note}</p>}
        </div>
      )}
    </>
  );
}

function Outline({ map }: { map: MindMap }) {
  return (
    <div className="outline">
      <p className="outline__center">{map.center}</p>
      <ul>
        {map.branches.map((b, bi) => (
          <li key={bi} className={`outline__branch mm-b${bi % 7}`}>
            <p className="outline__label">{b.label}</p>
            <p className="muted">{b.note}</p>
            <ul>
              {b.children.map((c, ci) => (
                <li key={ci}>
                  <p className="outline__child">
                    <strong>{c.label}</strong> <span className="muted">{c.note}</span>
                  </p>
                  {c.children.length > 0 && (
                    <ul className="outline__leaves">
                      {c.children.map((l, li) => (
                        <li key={li}>{l.label}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
