import { asset } from '../../app/asset';

/**
 * Cut-out pictures of you in each outfit, in public/assets/character/outfits.
 * Every picture shares one canvas (feet on the bottom edge, body centred) so
 * outfits swap on the platform without jumping. Made with tools/cutout-figures.py.
 */
export interface OutfitPicture {
  /** The front view. */
  src: string;
  /** Eight views turning in 45° steps (front first), when a turnaround exists. */
  frames?: string[];
}

const FRONT = new Set(['initiate', 'golden-streetwear', 'city-athlete', 'tropical-runner', 'web-runner', 'showman', 'flame-rider', 'symbiote']);
const TURNAROUND = new Set(['training-tee']);

export const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315] as const;

const dir = '/assets/character/outfits';

/** The outfit's picture, or null while it hasn't been made yet. */
export function outfitPicture(id: string): OutfitPicture | null {
  if (TURNAROUND.has(id)) {
    const frames = ANGLES.map((a) => asset(`${dir}/${id}/${a}.webp`));
    return { src: frames[0]!, frames };
  }
  if (FRONT.has(id)) return { src: asset(`${dir}/${id}.webp`) };
  return null;
}

/** The body shape a missing picture is drawn from (filled with the outfit's colors). */
export const PLACEHOLDER_SHAPE = asset(`${dir}/initiate.webp`);

/** Which of the eight views faces the camera when the platform has turned `deg`. */
export function frameFor(deg: number): number {
  const a = ((deg % 360) + 360) % 360;
  return Math.round(a / 45) % 8;
}
