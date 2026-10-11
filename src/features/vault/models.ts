/**
 * 3D model files found in src/assets/models at build time. Two kinds work:
 * - `subash-wardrobe.glb`: one body with every outfit as a node named
 *   `outfit_<id>` (layered clothes on a shared skeleton);
 * - `<outfit-id>.glb`: one complete model of you wearing that outfit.
 * Dropping a file into the folder is all it takes to wire it in.
 */
const files = import.meta.glob('../../assets/models/*.glb', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const byName: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.split('/').pop()!.replace(/\.glb$/, ''), url]),
);

export const LAYERED_FILE = 'subash-wardrobe';

export type ModelSource = { kind: 'layered'; url: string; node: string } | { kind: 'whole'; url: string };

/** Where an outfit's 3D model comes from, or null when only the stand-in exists. */
export function modelSource(outfitId: string, layeredOutfits: ReadonlySet<string> | null = null): ModelSource | null {
  const whole = byName[outfitId];
  if (whole) return { kind: 'whole', url: whole };
  const layered = byName[LAYERED_FILE];
  if (layered && (!layeredOutfits || layeredOutfits.has(outfitId))) return { kind: 'layered', url: layered, node: `outfit_${outfitId}` };
  return null;
}

/** Concept pictures exist for these outfits (the rest show a color swatch). */
export const THUMBS = new Set(['initiate', 'golden-streetwear', 'city-athlete', 'tropical-runner', 'web-runner', 'showman', 'flame-rider', 'symbiote']);
