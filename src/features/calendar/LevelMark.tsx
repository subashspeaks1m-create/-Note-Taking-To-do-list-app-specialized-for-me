import { useId } from 'react';
import type { IntensityLevel } from '../../domain/intensity';

const FLAME = 'M12 2c1.6 3.3 5.5 6.4 5.5 11.2A5.5 5.5 0 0 1 12 19a5.5 5.5 0 0 1-5.5-5.8c0-2.3 1.2-3.9 2.3-5 .2 1.6 1 2.7 2 3.1C10.5 8.6 10.9 5 12 2Z';
const CORE = 'M12 10.5c.9 1.6 2.6 2.7 2.6 4.6a2.6 2.6 0 0 1-5.2 0c0-1.2.7-2 1.3-2.6.1.7.5 1.1.9 1.3-.2-1.3 0-2.3.4-3.3Z';

/** The symbol drawn inside a calendar day: ember, blaze or crystal. */
export function LevelMark({ level, size = 36 }: { level: IntensityLevel; size?: number }) {
  const id = useId().replace(/:/g, '');
  if (level === 0) return null;
  if (level === 3) {
    return (
      <svg className="lvl-mark lvl-mark--3" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <linearGradient id={`cr-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e6fbff" />
            <stop offset="0.45" stopColor="#6fd6ff" />
            <stop offset="1" stopColor="#8a6bff" />
          </linearGradient>
        </defs>
        <path d="M12 1.5 18.5 8 12 22.5 5.5 8Z" fill={`url(#cr-${id})`} />
        <path d="M5.5 8h13M12 1.5 9.2 8 12 22.5 14.8 8Z" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="0.8" strokeLinejoin="round" />
        <path d="M12 1.5 9.2 8h5.6Z" fill="#ffffff" fillOpacity="0.45" />
      </svg>
    );
  }
  const flame = (key: string, transform?: string) => (
    <g key={key} transform={transform}>
      <path d={FLAME} fill={`url(#fl-${id})`} />
      <path d={CORE} fill="#fff4c2" fillOpacity="0.9" />
    </g>
  );
  return (
    <svg className={`lvl-mark lvl-mark--${level}`} width={level === 2 ? size * 1.35 : size} height={size} viewBox={level === 2 ? '0 0 32 24' : '0 0 24 24'} aria-hidden="true">
      <defs>
        <linearGradient id={`fl-${id}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={level === 2 ? '#ff3d2e' : '#ff8a2a'} />
          <stop offset="1" stopColor={level === 2 ? '#ffb02e' : '#ffd166'} />
        </linearGradient>
      </defs>
      {level === 1 ? flame('a') : [flame('b', 'translate(-1.5 3) scale(0.82)'), flame('a', 'translate(8.5 0)')]}
    </svg>
  );
}
