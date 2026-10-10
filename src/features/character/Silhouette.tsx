import { useId } from 'react';
import type { Look } from '../../domain/character';

/** Stand-in figure for a look whose art hasn't been made yet, tinted in its colors. */
export function Silhouette({ look }: { look: Look }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <div className="silhouette">
      <svg viewBox="0 0 200 400" role="img" aria-label={`${look.name} outline. Art for this suit comes later.`}>
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--stage-glow)" stopOpacity="0.9" />
            <stop offset="1" stopColor="var(--stage-glow)" stopOpacity="0.25" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="50" r="27" fill={`url(#${id}-fill)`} />
        <path
          d="M100 84c-31 0-53 10-61 31l-15 92c-2 11 11 15 15 4l17-71 4 77-9 168c0 11 17 11 19 0l23-152h14l23 152c2 11 19 11 19 0l-9-168 4-77 17 71c4 11 17 7 15-4l-15-92c-8-21-30-31-61-31z"
          fill={`url(#${id}-fill)`}
        />
        <path d="M100 120 112 140 100 160 88 140Z" fill="#fff" fillOpacity="0.55" />
      </svg>
      <span className="silhouette__tag">Art coming</span>
    </div>
  );
}
