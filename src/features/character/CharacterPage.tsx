import { useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { asset } from '../../app/asset';
import { Art } from '../../components/art/Art';
import { Icon } from '../../components/Icon';
import { LevelRing, Meter } from '../../components/Progress';
import { PageHeader, StageNote } from '../../components/Page';
import { useToast } from '../../components/Toasts';
import { useTodayKey } from '../../date/clock';
import { dateKeyInZone, formatMedium, isDateKey, type DateKey } from '../../date/localDate';
import {
  FORMS, SUITS, currentForm, formatMoney, isUnlocked, lookById, nextForm, progressToward, remainingText, requirementText,
  type Look,
} from '../../domain/character';
import { BADGES, rankLabel } from '../../domain/config';
import { PLATFORMS, TRANSFORMATIONS, cosmeticId, platformById, transformationState } from '../../domain/unlocks';
import { useChestGoals, useEarnings, useOutfit, usePlatform } from '../../storage/queries';
import { useProfile, useRepo } from '../../storage/StorageProvider';
import { CharacterStage } from './CharacterStage';
import { ChestCard, PlatformSwatch } from './Chests';
import { ContentForm, ContentLog, EquipmentGrid } from './Equipment';
import { Silhouette } from './Silhouette';
import { useGameState, type GameState } from './useGame';

/** Art that exists so far. Each look gains `image` and `spin` as Prem makes them. */
const ART: Record<string, Pick<Look, 'image' | 'spin'>> = {
  base: { image: asset('/assets/character/base-poster.webp') },
  scholar: { image: asset('/assets/character/scholar.webp') },
  builder: { image: asset('/assets/character/builder.webp') },
  ascendant: { image: asset('/assets/character/ascendant.webp') },
};

const withArt = (look: Look): Look => ({ ...look, ...ART[look.id] });

export function CharacterPage() {
  const profile = useProfile();
  const today = useTodayKey(profile.timeZone);
  const game = useGameState();
  const outfit = useOutfit();
  const platform = usePlatform();
  const chests = useChestGoals();
  const repo = useRepo();
  const toast = useToast();
  const [preview, setPreview] = useState<string | null>(null);

  if (!game) return <div className="page page--character" />;
  const { stats, progress, habit } = game;

  const form = currentForm(stats);
  const next = nextForm(stats);
  const chosen = outfit ? lookById(outfit) : null;
  const equipped = chosen && game.lookUnlocked(chosen) ? chosen : form;
  const shown = withArt(preview ? lookById(preview) : equipped);
  const previewing = preview !== null && preview !== equipped.id;
  const ownedPlatform = (id: string) => id === 'base' || game.owned.has(cosmeticId.platform(id));
  const platformId = platform && ownedPlatform(platform) ? platform : 'base';
  const tf = transformationState(habit.streak.longest, habit.streak.current);

  const equip = async (look: Look) => {
    try {
      await repo.setOutfit(look.id);
      setPreview(null);
      toast({ message: `${look.name} equipped`, tone: 'success' });
    } catch (e) {
      toast({ message: (e as Error).message, tone: 'error' });
    }
  };

  const equipPlatform = async (id: string) => {
    try {
      await repo.setPlatform(id);
      toast({ message: `${platformById(id).name} platform equipped`, tone: 'success' });
    } catch (e) {
      toast({ message: (e as Error).message, tone: 'error' });
    }
  };

  return (
    <div className="page page--character">
      <PageHeader overline="Character Chamber" title="Your character" art="shield" artMotion="pop" />

      <section className={`chamber chamber--stage accent--${shown.accent}`} aria-label="Your character">
        <div className="chamber__stage-wrap">
          <CharacterStage
            look={shown}
            platform={platformId}
            aura={tf.earned ? { id: tf.earned.id, lit: tf.lit } : null}
            gear={game.gear}
            label={`${shown.name}${previewing ? ', trying on' : ', equipped'}`}
          />
          <span className="chamber__equipped">
            {previewing ? (
              <>
                Trying on <strong>{shown.name}</strong>
                {!game.lookUnlocked(shown) && ' · locked'}
              </>
            ) : (
              <>
                <strong>{shown.name}</strong> · equipped
              </>
            )}
          </span>
          {previewing && (
            <button type="button" className="btn btn--quiet btn--sm chamber__back" onClick={() => setPreview(null)}>
              Back to {equipped.name}
            </button>
          )}
        </div>

        <div className="chamber__panel">
          <div className="chamber__levels">
            <LevelRing fraction={progress.global.fraction} level={progress.global.level} size={64} label={`Level ${progress.global.level}, ${progress.global.xp} XP`} />
            <div>
              <p className="overline">{rankLabel(progress.global.level)}</p>
              <p className="chamber__rank">Level {progress.global.level}</p>
              <p className="chamber__xp tabular">
                {progress.global.xp} / {progress.global.nextLevelAt} XP
              </p>
            </div>
          </div>
          <div className="chamber__meters">
            <Meter tone="learning" label="Learning" fraction={progress.learning.fraction} valueText={`Lv ${progress.learning.level} · ${progress.learning.xp} XP`} />
            <Meter tone="doing" label="Doing" fraction={progress.doing.fraction} valueText={`Lv ${progress.doing.level} · ${progress.doing.xp} XP`} />
          </div>

          <div className="earn">
            <p className="overline">Rank form · {form.name}</p>
            <p className="earn__total tabular">${stats.earned.toLocaleString('en-US')}</p>
            {next ? (
              <>
                <div className="earn__bar" role="progressbar" aria-label={`Progress to ${next.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressToward(next, stats) * 100)}>
                  <span style={{ width: `${progressToward(next, stats) * 100}%` }} />
                </div>
                <p className="earn__next">
                  <strong>{next.name}</strong> at {formatMoney((next.requirement as { amount: number }).amount)} · {remainingText(next, stats)}
                </p>
              </>
            ) : (
              <p className="earn__next">Every rank form unlocked.</p>
            )}
          </div>

          <ol className="ladder" aria-label="Rank forms">
            {FORMS.map((f) => (
              <li key={f.id} className={`ladder__step ${isUnlocked(f, stats) ? 'is-done' : ''} ${f.id === form.id ? 'is-current' : ''}`}>
                <span className="ladder__dot" aria-hidden="true" />
                <span className="ladder__name">{f.name}</span>
                <span className="ladder__amt tabular">{f.requirement.kind === 'earned' ? formatMoney(f.requirement.amount) : '$0'}</span>
              </li>
            ))}
          </ol>

          <EarningForm today={today} />
          <p className="chamber__fine">Only money you log counts. Suits, forms and badges you earn from habits are never taken away.</p>
        </div>
      </section>

      <h2 className="section-title">Equipment</h2>
      <p className="section-sub">
        Five pieces of gear that upgrade from your real numbers and orbit your platform. Each has five levels.
      </p>
      <EquipmentGrid gear={game.gear} />
      <ContentForm today={today} />

      <h2 className="section-title">Transformations</h2>
      <p className="section-sub">
        Earned by your streak and kept forever. The aura glows at full while your current streak is at least that long.
        {' '}Current streak <strong className="tabular">{habit.streak.current}</strong>, best <strong className="tabular">{habit.streak.longest}</strong>.
      </p>
      <ul className="forms">
        {TRANSFORMATIONS.map((t) => {
          const earned = habit.streak.longest >= t.days;
          const lit = earned && habit.streak.current >= t.days;
          const pct = Math.min(100, Math.round((habit.streak.longest / t.days) * 100));
          return (
            <li key={t.id} className={`form-card form-card--${t.id} ${earned ? 'is-earned' : ''} ${lit ? 'is-lit' : ''}`}>
              <span className={`form-card__aura aura--${t.id} ${earned && !lit ? 'aura--dim' : ''}`} aria-hidden="true" />
              <Art name={t.id === 'legend' ? 'fire' : t.id === 'godhead' ? 'crown' : t.id === 'awakened' ? 'high-voltage' : 'sparkles'} size={34} motion="float" />
              <p className="form-card__name">{t.name}</p>
              <p className="form-card__req tabular">{t.days}-day streak</p>
              <p className="form-card__desc">{t.description}</p>
              <p className="form-card__state">{earned ? (lit ? 'Earned · aura lit' : `Earned · relights at ${t.days} days`) : `${habit.streak.longest} of ${t.days} days`}</p>
              {!earned && (
                <div className="suit__progress" aria-hidden="true" style={{ '--pct': `${pct}%` } as CSSProperties}>
                  <span />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <h2 className="section-title">Rank forms</h2>
      <p className="section-sub">Who you become as your earnings grow.</p>
      <LookGrid looks={FORMS} game={game} equippedId={equipped.id} shownId={shown.id} onTry={setPreview} onEquip={equip} />

      <h2 className="section-title">Hero suits</h2>
      <p className="section-sub">
        All open from day one: wear whichever fits the day. See them in 3D in the <Link to="/vault">Vault</Link>.
      </p>
      <LookGrid looks={SUITS} game={game} equippedId={equipped.id} shownId={shown.id} onTry={setPreview} onEquip={equip} />

      <h2 className="section-title">Platforms</h2>
      <p className="section-sub">What you stand on. Some are earned by milestones; the rarest only come out of reward chests.</p>
      <ul className="platforms">
        {PLATFORMS.map((p) => {
          const have = ownedPlatform(p.id);
          const on = p.id === platformId;
          return (
            <li key={p.id} className={`platform-card ${have ? '' : 'platform-card--locked'} ${on ? 'platform-card--on' : ''}`}>
              {have || !p.chest ? <PlatformSwatch id={p.id} size={120} /> : <span className="platform-card__mystery" aria-hidden="true">?</span>}
              <p className="platform-card__name">{have || !p.chest ? p.name : 'Hidden platform'}</p>
              <p className="platform-card__how">{have ? p.description : p.how}</p>
              <button type="button" className="btn btn--quiet btn--sm" disabled={!have || on} onClick={() => void equipPlatform(p.id)}>
                {on ? 'Equipped' : have ? 'Equip' : 'Locked'}
              </button>
            </li>
          );
        })}
      </ul>

      <h2 className="section-title">Reward chests</h2>
      <p className="section-sub">Every goal in your 82-day sprint and your 1-year plan carries a sealed chest. Achieve the goal to open it.</p>
      {chests && chests.length > 0 ? (
        <ul className="chests">
          {chests.map((c) => (
            <ChestCard key={c.goal.id} item={c} owned={game.owned} />
          ))}
        </ul>
      ) : (
        <p className="panel__empty">
          No chests yet. Add a goal to your <Link to="/visions#sprint">sprint or 1-year plan</Link> and a chest appears here.
        </p>
      )}

      <EarningsLog />
      <ContentLog />

      <h2 className="section-title">Badges</h2>
      <ul className="badges">
        {BADGES.map((b) => {
          const got = game.badgeUnlocks.get(b.id);
          return (
            <li key={b.id} className={`badge ${got ? 'badge--earned' : 'badge--locked'}`}>
              <img src={b.image} alt="" width={48} height={48} />
              <div>
                <p className="badge__name">{b.name}</p>
                <p className="badge__req">{got ? `Earned ${formatMedium(dateKeyInZone(new Date(got.unlockedAt), profile.timeZone))}` : b.requirement}</p>
              </div>
            </li>
          );
        })}
      </ul>

      <StageNote stage={5}>Suit art and 360° spin clips are added as you make them. Everything else on this page works now.</StageNote>
    </div>
  );
}

function LookGrid({
  looks, game, equippedId, shownId, onTry, onEquip,
}: {
  looks: readonly Look[];
  game: GameState;
  equippedId: string;
  shownId: string;
  onTry: (id: string) => void;
  onEquip: (look: Look) => void;
}) {
  return (
    <ul className="wardrobe">
      {looks.map((raw) => {
        const look = withArt(raw);
        const { stats } = game;
        const unlocked = game.lookUnlocked(look);
        const isEquipped = look.id === equippedId;
        const pct = Math.round(progressToward(look, stats) * 100);
        return (
          <li key={look.id} className={`suit accent--${look.accent} ${unlocked ? '' : 'suit--locked'} ${isEquipped ? 'suit--equipped' : ''} ${look.id === shownId ? 'suit--shown' : ''}`}>
            <button type="button" className="suit__art" onClick={() => onTry(look.id)} aria-label={`Try on ${look.name}`}>
              {look.image ? <img src={look.image} alt="" loading="lazy" decoding="async" /> : <Silhouette look={look} />}
              {!unlocked && (
                <span className="suit__lock">
                  <Icon name="lock" size={14} /> {pct}%
                </span>
              )}
            </button>
            <div className="suit__body">
              <p className="suit__name">{look.name}</p>
              <p className="suit__desc">{look.description}</p>
              <p className="suit__req">{unlocked ? (isEquipped ? 'Equipped' : 'Unlocked') : `${requirementText(look.requirement)} · ${remainingText(look, stats)}`}</p>
              {!unlocked && (
                <div className="suit__progress" aria-hidden="true" style={{ '--pct': `${pct}%` } as CSSProperties}>
                  <span />
                </div>
              )}
              <button type="button" className="btn btn--quiet btn--sm" disabled={isEquipped} onClick={() => (unlocked ? onEquip(look) : onTry(look.id))}>
                {isEquipped ? 'Equipped' : unlocked ? 'Equip' : 'Try on'}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function EarningForm({ today }: { today: DateKey }) {
  const repo = useRepo();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState<string>(today);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const value = Number(amount.replace(/[,\s$]/g, ''));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const entry = await repo.addEarning({ dateKey: isDateKey(date) ? date : today, amount: value, note });
      setAmount('');
      setNote('');
      toast({ message: `$${entry.amount.toLocaleString('en-US')} logged`, tone: 'success', action: { label: 'Undo', run: () => repo.deleteEarning(entry.id) } });
    } catch (err) {
      toast({ message: (err as Error).message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="earn-form" onSubmit={(e) => void submit(e)}>
      <p className="overline">Log money earned</p>
      <div className="earn-form__row">
        <label className="earn-form__amount">
          <span className="visually-hidden">Amount in US dollars</span>
          <span aria-hidden="true">$</span>
          <input className="input" inputMode="decimal" placeholder="2,500" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          <span className="visually-hidden">Date earned</span>
          <input className="input" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <label>
        <span className="visually-hidden">Note</span>
        <input className="input" placeholder="Where it came from (optional)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button type="submit" className="btn btn--primary btn--sm" disabled={busy || !(value > 0)}>
        Log earnings
      </button>
    </form>
  );
}

function EarningsLog() {
  const earnings = useEarnings();
  const repo = useRepo();
  const toast = useToast();
  if (!earnings || earnings.length === 0) return null;
  return (
    <section className="panel earn-log" aria-labelledby="earn-log-heading">
      <h2 id="earn-log-heading" className="panel__title">
        Earnings log
      </h2>
      <ul>
        {earnings.slice(0, 50).map((e) => (
          <li key={e.id}>
            <span className="earn-log__amt tabular">${e.amount.toLocaleString('en-US')}</span>
            <span className="earn-log__note">{e.note || 'No note'}</span>
            <span className="earn-log__date">{formatMedium(e.dateKey)}</span>
            <button
              type="button"
              className="icon-btn icon-btn--sm"
              aria-label={`Delete $${e.amount.toLocaleString('en-US')} from ${formatMedium(e.dateKey)}`}
              onClick={async () => {
                await repo.deleteEarning(e.id);
                toast({ message: 'Entry deleted', action: { label: 'Undo', run: () => repo.restoreEarning(e.id) } });
              }}
            >
              <Icon name="close" size={14} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
