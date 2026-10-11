import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSound } from '../../app/sound';
import { Art } from '../../components/art/Art';
import { Dialog } from '../../components/Dialog';
import { useToast } from '../../components/Toasts';
import type { CosmeticUnlock, Goal } from '../../domain/models';
import { cosmeticId, platformById, type Platform } from '../../domain/unlocks';
import type { ChestGoal } from '../../storage/queries';
import { useRepo } from '../../storage/StorageProvider';

/** A small picture of a platform skin. */
export function PlatformSwatch({ id, size = 96 }: { id: string; size?: number }) {
  return (
    <span className={`swatch plat--${id}`} style={{ width: size, height: size * 0.5 }} aria-hidden="true">
      <span className="stage__platform swatch__platform">
        <span className="stage__deco" />
        <span className="swatch__disc" />
      </span>
    </span>
  );
}

type ChestState = 'sealed' | 'ready' | 'opened';

export function chestState(goal: Goal, owned: Map<string, CosmeticUnlock>): ChestState {
  if (owned.has(cosmeticId.chest(goal.id))) return 'opened';
  return goal.status === 'achieved' ? 'ready' : 'sealed';
}

export function chestPrize(goal: Goal, owned: Map<string, CosmeticUnlock>): Platform | null {
  const contents = owned.get(cosmeticId.chest(goal.id))?.contents;
  return contents ? platformById(contents.slice('stage:'.length)) : null;
}

/** One goal's chest: sealed until the goal is achieved, then opened once with a reveal. */
export function ChestCard({ item, owned, compact = false }: { item: ChestGoal; owned: Map<string, CosmeticUnlock>; compact?: boolean }) {
  const { goal, plan } = item;
  const state = chestState(goal, owned);
  const prize = chestPrize(goal, owned);
  const [opening, setOpening] = useState(false);

  return (
    <li className={`chest chest--${state} ${compact ? 'chest--compact' : ''}`}>
      <div className="chest__art">
        <Art name={state === 'opened' ? 'sparkles' : 'wrapped-gift'} size={compact ? 40 : 52} motion={state === 'ready' ? 'shake' : 'bounce'} />
      </div>
      <div className="chest__body">
        <p className="overline">{plan.kind === 'sprint' ? '82-day sprint chest' : '1-year chest'}</p>
        {compact ? <p className="chest__goal">{goal.title}</p> : (
          <Link to={`/goals/${goal.id}`} className="chest__goal">
            {goal.title}
          </Link>
        )}
        {state === 'sealed' && <p className="chest__note">Sealed. It opens when you achieve this goal. Nobody knows what's inside.</p>}
        {state === 'ready' && <p className="chest__note chest__note--ready">Goal achieved. Your chest is ready.</p>}
        {state === 'opened' && prize && (
          <div className="chest__prize">
            <PlatformSwatch id={prize.id} size={64} />
            <span>
              Found: <strong>{prize.name}</strong>
            </span>
          </div>
        )}
        {state === 'opened' && goal.sealedReward && <p className="chest__real">Your real-life reward: {goal.sealedReward}</p>}
        {state === 'ready' && (
          <button type="button" className="btn btn--primary btn--sm chest__open" onClick={() => setOpening(true)}>
            Open chest
          </button>
        )}
      </div>
      {opening && <ChestOpenDialog goal={goal} onClose={() => setOpening(false)} />}
    </li>
  );
}

function ChestOpenDialog({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const repo = useRepo();
  const toast = useToast();
  const sound = useSound();
  const [phase, setPhase] = useState<'closed' | 'shaking' | 'open'>('closed');
  const [prize, setPrize] = useState<Platform | null>(null);

  const open = async () => {
    setPhase('shaking');
    try {
      const [p] = await Promise.all([repo.openChest(goal.id), new Promise((r) => window.setTimeout(r, 1100))]);
      setPrize(p);
      setPhase('open');
      sound('unlock');
    } catch (e) {
      toast({ message: (e as Error).message, tone: 'error' });
      onClose();
    }
  };

  return (
    <Dialog open onClose={onClose} title={phase === 'open' ? 'Chest opened' : 'Reward chest'} size="sm">
      <div className={`chest-open chest-open--${phase}`}>
        <div className="chest-open__stage">
          <span className="chest-open__rays" aria-hidden="true" />
          {phase === 'open' && prize ? <PlatformSwatch id={prize.id} size={180} /> : <Art name="wrapped-gift" size={110} motion="shake" />}
        </div>
        {phase !== 'open' ? (
          <>
            <p className="chest-open__lead">You achieved “{goal.title}”. This chest was sealed for that moment.</p>
            <button type="button" className="btn btn--primary" disabled={phase === 'shaking'} onClick={() => void open()}>
              {phase === 'shaking' ? 'Opening…' : 'Open it'}
            </button>
          </>
        ) : (
          prize && (
            <>
              <p className="chest-open__found">
                New platform: <strong>{prize.name}</strong>
              </p>
              <p className="chest-open__lead">{prize.description} Equip it under Platforms on your Character page.</p>
              {goal.sealedReward && (
                <div className="chest-open__real">
                  <p className="overline">The reward you promised yourself</p>
                  <p>{goal.sealedReward}</p>
                </div>
              )}
              <button type="button" className="btn btn--primary" onClick={onClose}>
                Claim it
              </button>
            </>
          )
        )}
      </div>
    </Dialog>
  );
}
