import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { asset } from '../../app/asset';
import { Icon } from '../../components/Icon';
import { PageHeader, StageNote } from '../../components/Page';
import { useToast } from '../../components/Toasts';
import { useTodayKey } from '../../date/clock';
import { formatMedium, isDateKey, type DateKey } from '../../date/localDate';
import {
  FORMS, SUITS, currentForm, formatMoney, isUnlocked, lookById, nextForm, progressToward, remainingText, requirementText,
  type CharacterStats, type Look,
} from '../../domain/character';
import { BADGES } from '../../domain/config';
import { consistency } from '../../domain/stats';
import { useActivitySource, useEarnings, useOutfit } from '../../storage/queries';
import { useProfile, useRepo } from '../../storage/StorageProvider';
import { CharacterStage } from './CharacterStage';
import { Silhouette } from './Silhouette';

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
  const source = useActivitySource();
  const earnings = useEarnings();
  const outfit = useOutfit();
  const repo = useRepo();
  const toast = useToast();
  const [preview, setPreview] = useState<string | null>(null);

  const stats: CharacterStats = useMemo(() => {
    const habit = source ? consistency(source, today, profile.weekStart ?? 'monday') : null;
    return {
      earned: (earnings ?? []).reduce((sum, e) => sum + e.amount, 0),
      bestStreak: habit?.streak.longest ?? 0,
      tasksDone: source?.tasks.filter((t) => t.status === 'completed').length ?? 0,
      learningEntries: source?.entries.filter((e) => e.kind === 'learning' && e.plainText.trim()).length ?? 0,
      entries: source?.entries.filter((e) => e.plainText.trim()).length ?? 0,
    };
  }, [source, earnings, today, profile.weekStart]);

  const form = currentForm(stats);
  const next = nextForm(stats);
  const chosen = outfit ? lookById(outfit) : null;
  const equipped = chosen && isUnlocked(chosen, stats) ? chosen : form;
  const shown = withArt(preview ? lookById(preview) : equipped);
  const previewing = preview !== null && preview !== equipped.id;

  const equip = async (look: Look) => {
    try {
      await repo.setOutfit(look.id);
      setPreview(null);
      toast({ message: `${look.name} equipped`, tone: 'success' });
    } catch (e) {
      toast({ message: (e as Error).message, tone: 'error' });
    }
  };

  return (
    <div className="page page--character">
      <PageHeader overline="Character Chamber" title="Your character" art="shield" artMotion="pop" />

      <section className={`chamber chamber--stage accent--${shown.accent}`} aria-label="Your character">
        <div className="chamber__stage-wrap">
          <CharacterStage look={shown} label={`${shown.name}${previewing ? ', trying on' : ', equipped'}`} />
          <span className="chamber__equipped">
            {previewing ? (
              <>
                Trying on <strong>{shown.name}</strong>
                {!isUnlocked(shown, stats) && ' · locked'}
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
          <div>
            <p className="overline">Rank form</p>
            <p className="chamber__rank">{form.name}</p>
          </div>

          <div className="earn">
            <p className="overline">Earned so far</p>
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
          <p className="chamber__fine">Only money you log counts. Nothing you unlock is ever taken away.</p>
        </div>
      </section>

      <h2 className="section-title">Rank forms</h2>
      <p className="section-sub">Who you become as your earnings grow.</p>
      <LookGrid looks={FORMS} stats={stats} equippedId={equipped.id} shownId={shown.id} onTry={setPreview} onEquip={equip} />

      <h2 className="section-title">Hero suits</h2>
      <p className="section-sub">Unlocked by streaks, finished work, learning and money. Tap any suit to try it on.</p>
      <LookGrid looks={SUITS} stats={stats} equippedId={equipped.id} shownId={shown.id} onTry={setPreview} onEquip={equip} />

      <EarningsLog />

      <h2 className="section-title">Badges</h2>
      <ul className="badges">
        {BADGES.map((b) => (
          <li key={b.id} className="badge badge--locked">
            <img src={b.image} alt="" width={48} height={48} />
            <div>
              <p className="badge__name">{b.name}</p>
              <p className="badge__req">{b.requirement}</p>
            </div>
          </li>
        ))}
      </ul>

      <StageNote stage={5}>Next in stage 5: a 360° spin clip for each look, suit art, XP, badges and streak transformations.</StageNote>
    </div>
  );
}

function LookGrid({
  looks, stats, equippedId, shownId, onTry, onEquip,
}: {
  looks: readonly Look[];
  stats: CharacterStats;
  equippedId: string;
  shownId: string;
  onTry: (id: string) => void;
  onEquip: (look: Look) => void;
}) {
  return (
    <ul className="wardrobe">
      {looks.map((raw) => {
        const look = withArt(raw);
        const unlocked = isUnlocked(look, stats);
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
