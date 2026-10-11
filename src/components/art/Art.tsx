import type { CSSProperties } from 'react';
import { asset } from '../../app/asset';

/** Full-color art from Microsoft Fluent Emoji (MIT), served from public/assets/art. */
export type ArtName =
  | '1st-place-medal' | 'books' | 'bow-and-arrow' | 'bullseye' | 'chart-increasing' | 'compass' | 'crossed-swords'
  | 'crown' | 'crystal-ball' | 'fire' | 'gear' | 'gem-stone' | 'glowing-star' | 'high-voltage' | 'hourglass-done'
  | 'party-popper' | 'rocket' | 'scroll' | 'seedling' | 'shield' | 'sparkles' | 'spiral-calendar' | 'sunrise'
  | 'trophy' | 'warning' | 'wrapped-gift' | 'writing-hand'
  // Equipment
  | 'notebook' | 'open-book' | 'hammer-and-wrench' | 'toolbox' | 'mechanical-arm' | 'candle' | 'nazar-amulet'
  | 'mobile-phone' | 'camera' | 'movie-camera' | 'studio-microphone' | 'satellite-antenna' | 'coin' | 'watch' | 'money-bag' | 'ring';

/**
 * How the art moves when it, or the nearest `.art-host`, is hovered.
 * `flicker` and `float` also move gently at rest.
 */
export type ArtMotion = 'bounce' | 'wiggle' | 'spin' | 'pop' | 'flicker' | 'float' | 'shake';

interface Props {
  name: ArtName;
  size?: number;
  motion?: ArtMotion;
  className?: string;
}

export function Art({ name, size = 28, motion = 'bounce', className = '' }: Props) {
  return (
    <span className={`art art--${motion} ${className}`} style={{ '--art-size': `${size}px` } as CSSProperties} aria-hidden="true">
      <img src={asset(`/assets/art/${name}.svg`)} alt="" width={size} height={size} draggable={false} decoding="async" />
    </span>
  );
}
