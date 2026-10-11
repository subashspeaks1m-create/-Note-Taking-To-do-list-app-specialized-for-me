import { useId } from 'react';
import { useReducedMotion } from '../../app/displayPrefs';

const ORBIT = 'M4 40a28 9 0 1 0 56 0a28 9 0 1 0 -56 0';
const RAYS = [0, 45, 90, 135, 180, 225, 270, 315];

/**
 * The summit mark, alive: it draws itself in, the core breathes and a spark
 * orbits. Hovering the brand spins the peak and throws out rays.
 */
export function BrandMark({ size = 36 }: { size?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const reduced = useReducedMotion();
  return (
    <svg className="brand-mark" viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE9B0" />
          <stop offset="1" stopColor="#C9973F" />
        </linearGradient>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" stopColor="#E8C477" stopOpacity="0.5" />
          <stop offset="1" stopColor="#E8C477" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle className="brand-mark__halo" cx="32" cy="36" r="30" fill={`url(#${id}-glow)`} />
      <path className="brand-mark__orbit" d={ORBIT} fill="none" stroke="#E8C477" strokeWidth="1.2" />
      <g className="brand-mark__rays" stroke="#FFE9B0" strokeWidth="2.4" strokeLinecap="round">
        {RAYS.map((a) => (
          <line key={a} x1="32" y1="6" x2="32" y2="1" transform={`rotate(${a} 32 34)`} />
        ))}
      </g>
      <g className="brand-mark__peak">
        <path className="brand-mark__outline" d="M32 5 58 51H6Z" pathLength={1} fill="none" stroke={`url(#${id}-gold)`} strokeWidth="3.2" strokeLinejoin="round" />
        <path className="brand-mark__core" d="M32 21 44 43H20Z" fill={`url(#${id}-gold)`} />
        <path d="M32 7V15M10 51H20M44 51H54" stroke="#F4F1E8" strokeWidth="2" strokeLinecap="round" />
      </g>
      {!reduced && (
        <circle className="brand-mark__spark" r="2.3" fill="#FFF6DD">
          <animateMotion dur="5s" repeatCount="indefinite" path={ORBIT} />
        </circle>
      )}
    </svg>
  );
}
