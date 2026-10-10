import { useId } from 'react';

const SPARKS = [
  [24, 9],
  [37, 18],
  [34, 36],
  [12, 33],
  [11, 16],
];

/**
 * The emblem beside "What I'll do": a target whose outer ring fills as the
 * day's tasks are completed. Hovering it fires the arrow into the center.
 */
export function TaskEmblem({ done, total, size = 40 }: { done: number; total: number; size?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const complete = total > 0 && done === total;
  return (
    <span className={`task-emblem ${complete ? 'is-complete' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 48 48" width={size} height={size} focusable="false">
        <defs>
          <linearGradient id={`${id}-arc`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFE9B0" />
            <stop offset="1" stopColor="#E8C477" />
          </linearGradient>
        </defs>
        <circle cx="24" cy="24" r="21.5" fill="none" stroke="var(--border-quiet)" strokeWidth="3" />
        <circle
          className="task-emblem__arc"
          cx="24"
          cy="24"
          r="21.5"
          fill="none"
          stroke={`url(#${id}-arc)`}
          strokeWidth="3"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${pct} 100`}
          transform="rotate(-90 24 24)"
        />
        <g className="task-emblem__target">
          <circle cx="24" cy="24" r="15" fill="#E8655A" />
          <circle cx="24" cy="24" r="11.2" fill="#F4F1E8" />
          <circle cx="24" cy="24" r="7.4" fill="#E8655A" />
          <circle cx="24" cy="24" r="3.4" fill="#F4F1E8" />
        </g>
        <circle className="task-emblem__shock" cx="24" cy="24" r="4" fill="none" stroke="#FFE9B0" strokeWidth="2" />
        <g className="task-emblem__sparks" fill="#FFE9B0">
          {SPARKS.map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />
          ))}
        </g>
        <g className="task-emblem__arrow">
          <path d="M24.5 23.5 39 9" stroke="#C99A52" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M23 25 24.2 19.6 28.4 23.8Z" fill="#DDE6EE" />
          <path d="M37 8.5 38.5 4M39.5 11 44 9.5M38.3 9.7 42.5 5.5" stroke="#79DEEC" strokeWidth="2" strokeLinecap="round" />
        </g>
      </svg>
    </span>
  );
}
