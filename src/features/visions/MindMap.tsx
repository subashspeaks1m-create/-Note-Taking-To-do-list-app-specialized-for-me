import { useMemo, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DateKey } from '../../date/localDate';
import { PLAN_KIND_LABEL } from '../../domain/goals';
import type { BoardModel, GoalView } from './boardModel';

type Tone = 'focus' | 'learning' | 'doing' | 'gold' | 'muted';

interface MapNode {
  id: string;
  label: string;
  sub: string;
  kind: 'plan' | 'goal' | 'habit';
  tone: Tone;
  /** 0..1 or null when unmeasured. */
  fraction: number | null;
  lit: boolean;
  href: string | null;
  children: MapNode[];
}

interface Placed extends MapNode {
  x: number;
  y: number;
  depth: number;
}

const COL_W = 250;
const ROW_H = 64;
const NODE_W = 210;
const NODE_H = 48;
const PAD = 20;

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function goalNode(gv: GoalView, model: BoardModel): MapNode {
  const tone: Tone = gv.goal.category === 'both' ? 'gold' : gv.goal.category;
  const subGoals = gv.children.filter((c) => c.status !== 'archived').map((c) => goalNode(model.goalViews.get(c.id)!, model));
  const habits: MapNode[] = gv.habits
    .filter((h) => !h.stoppedAt)
    .map((h) => ({
      id: `habit-${h.id}`,
      label: h.title,
      sub: 'Daily habit',
      kind: 'habit',
      tone: h.category,
      fraction: null,
      lit: gv.streak.activeToday,
      href: `/goals/${gv.goal.id}`,
      children: [],
    }));
  const streak = gv.streak.current > 0 ? ` · 🔥 ${gv.streak.current}` : '';
  return {
    id: gv.goal.id,
    label: gv.goal.title,
    sub: `${gv.goal.status === 'achieved' ? 'Achieved' : gv.progress.summary}${streak}`,
    kind: 'goal',
    tone,
    fraction: gv.goal.status === 'achieved' ? 1 : gv.progress.fraction,
    lit: gv.streak.current > 0,
    href: `/goals/${gv.goal.id}`,
    children: [...subGoals, ...habits],
  };
}

/** Vision in the centre-left, horizons and goals branching right, habits at the leaves. */
function buildTree(model: BoardModel): MapNode {
  const planNode = (pv: BoardModel['plans'][number], extra: MapNode[] = []): MapNode => ({
    id: pv.plan.id,
    label: pv.plan.title,
    sub: pv.achievement.fraction === null ? PLAN_KIND_LABEL[pv.plan.kind] : `${PLAN_KIND_LABEL[pv.plan.kind]} · ${Math.round(pv.achievement.fraction * 100)}%`,
    kind: 'plan',
    tone: pv.plan.kind === 'decade' ? 'focus' : pv.plan.kind === 'year' ? 'learning' : 'gold',
    fraction: pv.achievement.fraction,
    lit: pv.goals.some((g) => g.streak.current > 0),
    href: `/visions/${pv.plan.id}`,
    children: [...pv.goals.map((g) => goalNode(g, model)), ...extra],
  });
  const decade = model.plans.find((p) => p.plan.kind === 'decade');
  const others = model.plans.filter((p) => p !== decade).map((p) => planNode(p));
  if (decade) return planNode(decade, others);
  return { id: 'root', label: 'My vision', sub: 'Add a 10-year plan', kind: 'plan', tone: 'focus', fraction: null, lit: false, href: null, children: others };
}

function layout(root: MapNode): { nodes: Placed[]; edges: { from: Placed; to: Placed }[]; width: number; height: number } {
  const nodes: Placed[] = [];
  const edges: { from: Placed; to: Placed }[] = [];
  let row = 0;
  let maxDepth = 0;
  const place = (n: MapNode, depth: number): Placed => {
    maxDepth = Math.max(maxDepth, depth);
    const kids = n.children.map((c) => place(c, depth + 1));
    const y = kids.length ? (kids[0]!.y + kids[kids.length - 1]!.y) / 2 : PAD + NODE_H / 2 + row++ * ROW_H;
    const placed: Placed = { ...n, x: PAD + depth * COL_W, y, depth };
    nodes.push(placed);
    for (const k of kids) edges.push({ from: placed, to: k });
    return placed;
  };
  place(root, 0);
  return { nodes, edges, width: PAD * 2 + maxDepth * COL_W + NODE_W, height: Math.max(row, 1) * ROW_H + PAD * 2 - (ROW_H - NODE_H) };
}

export function MindMap({ model }: { model: BoardModel; today: DateKey }) {
  const navigate = useNavigate();
  const { nodes, edges, width, height } = useMemo(() => layout(buildTree(model)), [model]);
  const go = (href: string | null) => href && navigate(href);
  const onKey = (e: KeyboardEvent, href: string | null) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      go(href);
    }
  };
  const goalCount = nodes.filter((n) => n.kind === 'goal').length;

  return (
    <section className="mindmap" aria-label="Vision mind map">
      <div className="mindmap__legend">
        <span>
          <i className="mindmap__key mindmap__key--lit" /> Moving: streak alive
        </span>
        <span>
          <i className="mindmap__key" /> Waiting for you
        </span>
        <span className="mindmap__hint">Tap any branch to open it.</span>
      </div>
      <div className="mindmap__scroll">
        <svg className="mindmap__svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`${goalCount} goals mapped`}>
          <defs>
            <filter id="mm-glow" x="-30%" y="-60%" width="160%" height="220%">
              <feGaussianBlur stdDeviation="6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {edges.map(({ from, to }) => {
            const x1 = from.x + NODE_W;
            const x2 = to.x;
            const mx = (x1 + x2) / 2;
            return (
              <path
                key={`${from.id}-${to.id}`}
                className={`mindmap__edge mindmap__edge--${to.tone} ${to.lit ? 'is-lit' : ''}`}
                d={`M${x1},${from.y} C${mx},${from.y} ${mx},${to.y} ${x2},${to.y}`}
              />
            );
          })}
          {nodes.map((n) => {
            const pct = n.fraction === null ? null : Math.round(n.fraction * 100);
            return (
              <g
                key={n.id}
                className={`mindmap__node mindmap__node--${n.kind} mindmap__node--${n.tone} ${n.lit ? 'is-lit' : ''} ${n.href ? 'is-link' : ''}`}
                transform={`translate(${n.x},${n.y - NODE_H / 2})`}
                role={n.href ? 'link' : undefined}
                tabIndex={n.href ? 0 : undefined}
                aria-label={`${n.label}. ${n.sub}`}
                onClick={() => go(n.href)}
                onKeyDown={(e) => onKey(e, n.href)}
              >
                <title>{`${n.label} · ${n.sub}`}</title>
                <rect className="mindmap__box" width={NODE_W} height={NODE_H} rx={n.kind === 'habit' ? NODE_H / 2 : 12} filter={n.lit && n.kind !== 'habit' ? 'url(#mm-glow)' : undefined} />
                {pct !== null && <rect className="mindmap__fill" x={1} y={NODE_H - 4} width={Math.max(0, (NODE_W - 2) * (pct / 100))} height={3} rx={1.5} />}
                <text className="mindmap__label" x={14} y={20}>
                  {truncate(n.label, n.kind === 'habit' ? 26 : 24)}
                </text>
                <text className="mindmap__sub" x={14} y={36}>
                  {truncate(n.sub, 32)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {goalCount === 0 && <p className="mindmap__empty">Add goals to your horizons and they will branch out here, with their daily habits at the tips.</p>}
    </section>
  );
}
