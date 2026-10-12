/**
 * The vault: every outfit is open from day one, so the choice is about the
 * day and the mood, not about unlocking. Each outfit is one complete 3D
 * model of you wearing it; until its model file is added, the viewer shows a
 * clearly labeled stand-in in the outfit's colors.
 */

export type OutfitCategory = 'casual' | 'hero';

export interface StandInColors {
  top: string;
  bottom: string;
  shoes: string;
  /** Bare arms (tank top, short sleeves) show skin from the elbow down. */
  sleeves: 'long' | 'short' | 'none';
  /** Optional cape, coat tail or cloak color. */
  cape?: string;
  /** Emissive accent (chest light, flames). */
  glow?: string;
}

export interface Outfit {
  id: string;
  name: string;
  category: OutfitCategory;
  description: string;
  /** Short words for the vault search. */
  tags: string[];
  colors: StandInColors;
}

export const OUTFITS: readonly Outfit[] = [
  { id: 'initiate', name: 'Initiate', category: 'casual', description: 'Black hoodie, joggers and white sneakers. Where it starts.', tags: ['hoodie', 'black', 'starter'], colors: { top: '#1d2027', bottom: '#202329', shoes: '#e9ebee', sleeves: 'long' } },
  { id: 'golden-streetwear', name: 'Golden Streetwear', category: 'casual', description: 'Gold leather jacket over a black tee, dark jeans.', tags: ['jacket', 'gold', 'leather'], colors: { top: '#c9962e', bottom: '#2a2d33', shoes: '#efe8d8', sleeves: 'long' } },
  { id: 'city-athlete', name: 'City Athlete', category: 'casual', description: 'White tank, blue jeans and a brown belt.', tags: ['tank', 'jeans', 'summer'], colors: { top: '#f1f1ee', bottom: '#3b5b8c', shoes: '#eeeeee', sleeves: 'none' } },
  { id: 'tropical-runner', name: 'Tropical Runner', category: 'casual', description: 'Teal floral shirt open over a white tee.', tags: ['shirt', 'floral', 'teal', 'summer'], colors: { top: '#2fb4b4', bottom: '#2a2f38', shoes: '#eeeeee', sleeves: 'short' } },
  { id: 'training-tee', name: 'Training Tee', category: 'casual', description: 'Black tee and joggers. The one you can turn all the way round.', tags: ['tee', 'black', 'gym', '360'], colors: { top: '#1b1d22', bottom: '#202329', shoes: '#e9ebee', sleeves: 'short' } },
  { id: 'web-runner', name: 'Web Runner', category: 'hero', description: 'Red and navy web-lined stealth suit.', tags: ['web', 'red', 'suit', 'spider'], colors: { top: '#b3202f', bottom: '#1f2b52', shoes: '#b3202f', sleeves: 'long' } },
  { id: 'mercenary', name: 'Mercenary', category: 'hero', description: 'Red and black tactical suit with twin sheaths.', tags: ['red', 'tactical', 'blades'], colors: { top: '#a3161f', bottom: '#2a0d10', shoes: '#151515', sleeves: 'long' } },
  { id: 'sorcerer', name: 'Sorcerer', category: 'hero', description: 'Deep blue robes, crimson cloak, glowing amulet.', tags: ['magic', 'cloak', 'blue', 'mystic'], colors: { top: '#1f3a72', bottom: '#1a2440', shoes: '#2a1e16', sleeves: 'long', cape: '#8c1d26', glow: '#5cf2a0' } },
  { id: 'symbiote', name: 'Symbiote', category: 'hero', description: 'Living black suit with a white emblem.', tags: ['black', 'venom', 'suit'], colors: { top: '#0b0b10', bottom: '#0b0b10', shoes: '#0b0b10', sleeves: 'long', glow: '#e8e8f0' } },
  { id: 'thunder-lord', name: 'Thunder Lord', category: 'hero', description: 'Black plate armor, crimson cape, storm in the air.', tags: ['armor', 'cape', 'storm', 'thunder'], colors: { top: '#2b2f38', bottom: '#1c1f26', shoes: '#1c1f26', sleeves: 'long', cape: '#9a1b24', glow: '#9fd0ff' } },
  { id: 'arc-armor', name: 'Arc Armor', category: 'hero', description: 'Red and gold powered armor with a glowing core.', tags: ['armor', 'iron', 'red', 'gold', 'tech'], colors: { top: '#a8161e', bottom: '#a8161e', shoes: '#c79a3a', sleeves: 'long', glow: '#7ef0ff' } },
  { id: 'showman', name: 'Showman', category: 'hero', description: 'Purple long coat, green vest, pinstripes.', tags: ['coat', 'purple', 'joker'], colors: { top: '#5b2a7e', bottom: '#2a2633', shoes: '#141414', sleeves: 'long', cape: '#5b2a7e' } },
  { id: 'mech-arms', name: 'Mech Arms', category: 'hero', description: 'Green trench coat with four mechanical arms.', tags: ['coat', 'green', 'mechanical'], colors: { top: '#4d5a33', bottom: '#2a2c26', shoes: '#4a3424', sleeves: 'long', cape: '#4d5a33' } },
  { id: 'dark-knight', name: 'Dark Knight', category: 'hero', description: 'Matte black armor, cowl and long cape.', tags: ['black', 'armor', 'cape', 'bat'], colors: { top: '#22252b', bottom: '#1a1c21', shoes: '#111214', sleeves: 'long', cape: '#0f1013' } },
  { id: 'flame-rider', name: 'Flame Rider', category: 'hero', description: 'Spiked leather jacket, chains and flames.', tags: ['leather', 'fire', 'chains', 'biker'], colors: { top: '#1a1716', bottom: '#1d1c1c', shoes: '#141210', sleeves: 'long', glow: '#ff8a2a' } },
];

export const DEFAULT_OUTFIT = 'initiate';

export function outfitById(id: string | null | undefined): Outfit {
  return OUTFITS.find((o) => o.id === id) ?? OUTFITS[0]!;
}

/** Search across name, description and tags; empty query matches everything. */
export function matchesOutfit(o: Outfit, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [o.name, o.description, ...o.tags].some((s) => s.toLowerCase().includes(q));
}

// ---------- Tiers (from the Vision kit), shown on top of rank and level ----------

export interface Tier {
  id: 'normal' | 'pro' | 'advanced' | 'legendary';
  name: string;
  minLevel: number;
  accent: string;
}

export const TIERS: readonly Tier[] = [
  { id: 'normal', name: 'Normal', minLevel: 1, accent: '#B6C3D1' },
  { id: 'pro', name: 'Pro', minLevel: 5, accent: '#79DEEC' },
  { id: 'advanced', name: 'Advanced', minLevel: 10, accent: '#BDACFF' },
  { id: 'legendary', name: 'Legendary', minLevel: 20, accent: '#E8C477' },
];

export function tierForLevel(level: number): Tier {
  return [...TIERS].reverse().find((t) => level >= t.minLevel) ?? TIERS[0]!;
}

export function nextTier(level: number): Tier | null {
  return TIERS.find((t) => level < t.minLevel) ?? null;
}
