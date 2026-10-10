import type { CSSProperties } from 'react';

interface RingProps {
  fraction: number;
  level: number;
  size?: number;
  label: string;
}

/** Level ring: the arc is the progress inside the current level. */
export function LevelRing({ fraction, level, size = 64, label }: RingProps) {
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, fraction));
  return (
    <div className="level-ring" style={{ width: size, height: size } as CSSProperties} role="img" aria-label={label}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="level-ring__track" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="level-ring__value"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="level-ring__num" aria-hidden="true">
        {level}
      </span>
    </div>
  );
}

interface MeterProps {
  fraction: number;
  tone: 'learning' | 'doing' | 'gold' | 'neutral';
  label: string;
  /** Visible text shown beside the bar. */
  valueText?: string;
}

export function Meter({ fraction, tone, label, valueText }: MeterProps) {
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 1000) / 10;
  return (
    <div className={`meter meter--${tone}`}>
      <div className="meter__head">
        <span className="meter__label">{label}</span>
        {valueText && <span className="meter__value">{valueText}</span>}
      </div>
      <div
        className="meter__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={valueText}
      >
        <div className="meter__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function CategoryTag({ category, size = 'md' }: { category: 'learning' | 'doing'; size?: 'sm' | 'md' }) {
  return (
    <span className={`cat-tag cat-tag--${category} cat-tag--${size}`}>
      <span className="cat-tag__glyph" aria-hidden="true">
        {category === 'learning' ? '◆' : '▲'}
      </span>
      {category === 'learning' ? 'Learning' : 'Doing'}
    </span>
  );
}
