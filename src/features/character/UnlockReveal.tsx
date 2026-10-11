import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSound } from '../../app/sound';
import { Art, type ArtName } from '../../components/art/Art';
import { Icon } from '../../components/Icon';
import { revealFor, type RevealItem } from '../../domain/unlocks';
import { useRepo } from '../../storage/StorageProvider';
import { useGameState } from './useGame';

const SHOW_MS = 6500;
const GROUP_OVER = 3;

/** True while the person is typing, so a reveal never lands in the middle of a sentence. */
function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'text');
}

/**
 * Watches the records for newly earned badges, suits, transformations and
 * platforms, stores them permanently, and reveals each one with a short card
 * once the person is not typing. Many at once (e.g. first run on old data)
 * collapse into a single summary card.
 */
export function UnlockWatcher() {
  const game = useGameState();
  const repo = useRepo();
  const sound = useSound();
  const [queue, setQueue] = useState<RevealItem[]>([]);
  const [shown, setShown] = useState<RevealItem | null>(null);
  const writing = useRef(false);

  useEffect(() => {
    if (!game || writing.current) return;
    const badges = new Map([...game.badgesMet].filter(([id]) => !game.badgeUnlocks.has(id)));
    const cosmetics = game.cosmeticsMet.filter((id) => !game.owned.has(id));
    if (badges.size === 0 && cosmetics.length === 0) return;
    writing.current = true;
    repo
      .recordUnlocks(badges, cosmetics)
      .then((fresh) => {
        const items = fresh.map(revealFor).filter((x): x is RevealItem => !!x);
        if (items.length > GROUP_OVER) {
          setQueue((q) => [
            ...q,
            { key: `group-${Date.now()}`, kind: 'badge', title: `${items.length} new unlocks`, detail: items.map((i) => i.title.replace(/^[^:]+: /, '')).join(', '), art: 'party-popper' },
          ]);
        } else if (items.length) setQueue((q) => [...q, ...items]);
      })
      .catch(() => undefined)
      .finally(() => {
        writing.current = false;
      });
  }, [game, repo]);

  // Show the next queued reveal once nobody is typing.
  useEffect(() => {
    if (shown || queue.length === 0) return;
    const tryShow = () => {
      if (isTyping()) return false;
      setShown(queue[0]!);
      setQueue((q) => q.slice(1));
      sound('unlock');
      return true;
    };
    if (tryShow()) return;
    const timer = window.setInterval(() => {
      if (tryShow()) window.clearInterval(timer);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [queue, shown, sound]);

  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(null), SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [shown]);

  if (!shown) return null;
  return (
    <div className={`reveal reveal--${shown.kind}`} role="status" aria-live="polite">
      <span className="reveal__glow" aria-hidden="true" />
      <Art name={shown.art as ArtName} size={44} motion="pop" />
      <div className="reveal__body">
        <p className="reveal__title">{shown.title}</p>
        <p className="reveal__detail">{shown.detail}</p>
        <Link to="/character" className="reveal__link" onClick={() => setShown(null)}>
          See it on your character
        </Link>
      </div>
      <button type="button" className="icon-btn icon-btn--sm reveal__close" aria-label="Dismiss" onClick={() => setShown(null)}>
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
