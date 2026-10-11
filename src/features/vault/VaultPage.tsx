import { useMemo, useRef, useState, type CSSProperties } from 'react';
import '../../styles/vault.css';
import { Link } from 'react-router-dom';
import { asset } from '../../app/asset';
import { useReducedMotion } from '../../app/displayPrefs';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toasts';
import { currentForm, formatMoney } from '../../domain/character';
import { OUTFITS, matchesOutfit, nextTier, outfitById, tierForLevel, type Outfit, type OutfitCategory } from '../../domain/wardrobe';
import { useWearing } from '../../storage/queries';
import { useProfile, useRepo } from '../../storage/StorageProvider';
import { useGameState } from '../character/useGame';
import { AvatarViewer, type ViewerHandle } from './AvatarViewer';
import { RENDERED_THUMBS, THUMBS, modelSource } from './models';
import type { ViewerStatus } from './viewerEngine';

type Filter = 'all' | OutfitCategory;
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All outfits' },
  { id: 'casual', label: 'Casual' },
  { id: 'hero', label: 'Heroes' },
];

const VIEWS = [
  { deg: 0, label: 'Front' },
  { deg: 90, label: 'Left' },
  { deg: 180, label: 'Back' },
  { deg: 270, label: 'Right' },
];

function OutfitThumb({ outfit, size }: { outfit: Outfit; size: 'sm' | 'lg' }) {
  if (THUMBS.has(outfit.id)) return <img className={`vault-thumb vault-thumb--${size}`} src={asset(`/assets/vault/${outfit.id}.webp`)} alt="" loading="lazy" decoding="async" />;
  const c = outfit.colors;
  return (
    <span className={`vault-thumb vault-thumb--${size} vault-thumb--swatch`} style={{ '--t': c.top, '--b': c.bottom, '--g': c.glow ?? c.cape ?? c.top } as CSSProperties} aria-hidden="true">
      <span />
    </span>
  );
}

/**
 * The vault: a game-style wardrobe. Every outfit is open; pick one for the
 * day, inspect it from every side, and wear it. The counters on top only
 * measure what you have done; nothing is spent.
 */
export function VaultPage() {
  const profile = useProfile();
  const game = useGameState();
  const wearing = useWearing();
  const repo = useRepo();
  const toast = useToast();
  const reduced = useReducedMotion();
  const viewer = useRef<ViewerHandle>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [helmet, setHelmet] = useState(false);
  const [status, setStatus] = useState<ViewerStatus | { state: 'no-webgl' }>({ state: 'loading' });

  const wornId = wearing ?? 'initiate';
  const shown = outfitById(selected ?? wornId);
  const list = useMemo(() => OUTFITS.filter((o) => (filter === 'all' || o.category === filter) && matchesOutfit(o, query)), [filter, query]);

  const level = game?.progress.global.level ?? 1;
  const tier = tierForLevel(level);
  const next = nextTier(level);
  const rank = game ? currentForm(game.stats) : null;

  const wear = async (o: Outfit) => {
    try {
      await repo.setWearing(o.id);
      setSelected(null);
      toast({ message: `Wearing ${o.name} today`, tone: 'success' });
    } catch (e) {
      toast({ message: (e as Error).message, tone: 'error' });
    }
  };

  const statusText =
    status.state === 'loading' ? 'Loading 3D model…'
      : status.state === 'model' ? '3D model · drag to rotate'
        : status.state === 'stand-in' ? (status.reason === 'missing-outfit' ? 'Stand-in · this outfit is not in your 3D file yet' : 'Stand-in · your 3D model of this outfit is not added yet')
          : status.state === 'error' ? 'The 3D file could not be loaded · showing the stand-in'
            : '3D is not available on this device';

  return (
    <div className="page page--vault" style={{ '--tier': tier.accent } as CSSProperties}>
      <header className="vault-top">
        <div className="vault-top__who">
          <span className="vault-top__avatar" aria-hidden="true">{profile.displayName.slice(0, 1)}</span>
          <div>
            <h1 className="vault-top__name">{profile.displayName}</h1>
            <p className="vault-top__chips">
              <span className="vault-chip vault-chip--level">Level {level}</span>
              <span className="vault-chip vault-chip--tier">{tier.name}</span>
              {rank && <span className="vault-chip">{rank.name}</span>}
            </p>
          </div>
        </div>
        <dl className="vault-stats" aria-label="What you have done">
          <div>
            <dt>XP</dt>
            <dd className="tabular">{(game?.progress.global.xp ?? 0).toLocaleString('en-US')}</dd>
          </div>
          <div>
            <dt>Earned</dt>
            <dd className="tabular">{formatMoney(game?.stats.earned ?? 0)}</dd>
          </div>
          <div>
            <dt>Best streak</dt>
            <dd className="tabular">{game?.stats.bestStreak ?? 0}d</dd>
          </div>
          <div>
            <dt>Tasks done</dt>
            <dd className="tabular">{(game?.stats.tasksDone ?? 0).toLocaleString('en-US')}</dd>
          </div>
        </dl>
      </header>

      <div className="vault">
        <aside className="vault-list" aria-label="Outfits">
          <label className="vault-search">
            <Icon name="search" size={16} />
            <span className="visually-hidden">Search outfits</span>
            <input className="input" type="search" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="vault-filters" role="tablist" aria-label="Outfit type">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className="vault-filter" onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          <ul className="vault-grid">
            {list.map((o) => {
              const on = o.id === shown.id;
              const worn = o.id === wornId;
              const has3d = !!modelSource(o.id);
              return (
                <li key={o.id}>
                  <button type="button" className={`vault-item ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => setSelected(o.id)}>
                    <OutfitThumb outfit={o} size="sm" />
                    <span className="vault-item__name">{o.name}</span>
                    <span className="vault-item__tags">
                      {worn && <span className="vault-item__badge vault-item__badge--worn">Wearing</span>}
                      <span className={`vault-item__badge ${has3d ? 'vault-item__badge--3d' : ''}`}>{has3d ? '3D' : 'Stand-in'}</span>
                    </span>
                  </button>
                </li>
              );
            })}
            {list.length === 0 && <li className="vault-empty">No outfit matches “{query}”.</li>}
          </ul>
        </aside>

        <section className="vault-stage" aria-label={`${shown.name} in 3D`}>
          <AvatarViewer ref={viewer} outfit={shown} accent={tier.accent} autoRotate={autoRotate} reducedMotion={reduced} helmet={helmet} onStatus={setStatus} />
          <p className={`vault-status vault-status--${status.state}`} role="status">
            {statusText}
          </p>
          <div className="vault-controls" role="group" aria-label="Turn the character">
            <button type="button" className="icon-btn" aria-label="Rotate left 45 degrees" onClick={() => viewer.current?.rotateBy(-45)}>
              <Icon name="chevronLeft" size={18} />
            </button>
            {VIEWS.map((v) => (
              <button key={v.deg} type="button" className="vault-ctrl" onClick={() => viewer.current?.view(v.deg)}>
                {v.label}
              </button>
            ))}
            <button type="button" className="icon-btn" aria-label="Rotate right 45 degrees" onClick={() => viewer.current?.rotateBy(45)}>
              <Icon name="chevronRight" size={18} />
            </button>
            {status.state === 'model' && (
              <button type="button" className="vault-ctrl" onClick={() => viewer.current?.face()}>
                Face
              </button>
            )}
            <button type="button" className="vault-ctrl" onClick={() => viewer.current?.fit()}>
              Fit
            </button>
            <button type="button" className="vault-ctrl" aria-pressed={autoRotate && !reduced} disabled={reduced} title={reduced ? 'Off while reduced motion is on' : undefined} onClick={() => setAutoRotate((v) => !v)}>
              Auto-rotate
            </button>
            {status.state === 'model' && status.hasHelmet && (
              <button type="button" className="vault-ctrl" aria-pressed={helmet} onClick={() => setHelmet((v) => !v)}>
                Mask
              </button>
            )}
          </div>
        </section>

        <aside className="vault-detail" aria-label="Selected outfit">
          <p className="overline">{shown.category === 'hero' ? 'Hero suit' : 'Casual'}</p>
          <h2 className="vault-detail__name">{shown.name}</h2>
          <p className="vault-detail__desc">{shown.description}</p>
          {shown.id === wornId ? (
            <p className="vault-detail__worn">
              <Icon name="check" size={16} /> You're wearing this today
            </p>
          ) : (
            <button type="button" className="btn btn--primary" onClick={() => void wear(shown)}>
              Wear today
            </button>
          )}
          {selected && selected !== wornId && (
            <button type="button" className="btn btn--quiet btn--sm" onClick={() => setSelected(null)}>
              Back to {outfitById(wornId).name}
            </button>
          )}
          <div className="vault-detail__art">
            <OutfitThumb outfit={shown} size="lg" />
            <p className="vault-detail__caption">{RENDERED_THUMBS.has(shown.id) ? 'Picture of your 3D model' : THUMBS.has(shown.id) ? 'Concept picture' : 'Concept picture not made yet'}</p>
          </div>
          <p className="vault-detail__model">
            {modelSource(shown.id)
              ? 'Your 3D model in this outfit. Drag to turn, or use Face for a close-up.'
              : 'The 3D model of you in this outfit is not added yet, so a simple stand-in shows its colors.'}
          </p>
          {modelSource(shown.id)?.kind === 'layered' && (
            <p className="vault-detail__model vault-detail__credits">
              3D body and clothing bases: MakeHuman community (CC0); hoodie, tank and shirt bases by Elvaerwyn (CC-BY). Face from your photos.
            </p>
          )}
          <div className="vault-detail__tier">
            <p className="overline">Tier · {tier.name}</p>
            <p className="vault-detail__next">{next ? `${next.name} at level ${next.minLevel}` : 'Highest tier reached'}</p>
            <Link to="/character" className="vault-detail__link">
              Rank, gear and platforms
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default VaultPage;
