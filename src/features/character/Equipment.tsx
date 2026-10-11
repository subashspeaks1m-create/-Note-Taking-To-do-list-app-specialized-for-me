import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Art } from '../../components/art/Art';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toasts';
import { formatMedium, isDateKey, type DateKey } from '../../date/localDate';
import { AUDIENCE_STARS, formatCount, gearRemaining, type GearState } from '../../domain/equipment';
import { useContentLog } from '../../storage/queries';
import { useRepo } from '../../storage/StorageProvider';

/** Where each slot's number comes from, with a link to the place you raise it. */
const SOURCE: Record<GearState['slot']['id'], { text: string; to?: string; label?: string }> = {
  knowledge: { text: 'Grows with Learning XP from finished learning tasks and their write-ups.', to: '/', label: 'Today' },
  skills: { text: 'Grows with Doing XP from finished doing tasks and their write-ups.', to: '/', label: 'Today' },
  beliefs: { text: 'Grows with each principle you write down.', to: '/principles', label: 'Principles' },
  content: { text: 'Grows with posts you log below. Audience size lights the stars.' },
  earnings: { text: 'Grows with money you log in the chamber above.' },
};

/** The five gear cards: current piece, level pips, and what the next piece needs. */
export function EquipmentGrid({ gear }: { gear: GearState[] }) {
  return (
    <ul className="gear-grid">
      {gear.map((g) => {
        const src = SOURCE[g.slot.id];
        const shown = g.current ?? g.slot.tiers[0]!;
        return (
          <li key={g.slot.id} className={`gear orb--${g.slot.tone} ${g.current ? '' : 'gear--empty'}`}>
            <div className="gear__top">
              <span className="gear__icon">
                <Art name={shown.art} size={34} motion="float" />
              </span>
              <div>
                <p className="gear__slot">{g.slot.name}</p>
                <p className="gear__name">{g.current ? g.current.name : 'Empty slot'}</p>
                <p className="gear__meaning">{g.slot.meaning}</p>
              </div>
            </div>
            <div className="gear__pips" role="img" aria-label={`Level ${g.tier} of ${g.slot.tiers.length}`}>
              {g.slot.tiers.map((t, i) => (
                <span key={t.name} className={`gear__pip ${i < g.tier ? 'is-on' : ''}`} />
              ))}
            </div>
            <p className="gear__value tabular">{g.slot.unit(g.value)}</p>
            {g.next ? (
              <>
                <div className="gear__bar" aria-hidden="true">
                  <span style={{ width: `${g.fraction * 100}%` }} />
                </div>
                <p className="gear__next">
                  Next: <strong>{g.next.name}</strong> · {gearRemaining(g)}
                </p>
              </>
            ) : (
              <p className="gear__next">Fully upgraded.</p>
            )}
            {g.stars !== undefined && (
              <p className="gear__stars">
                Audience <b aria-hidden="true">{'★'.repeat(g.stars)}{'☆'.repeat(AUDIENCE_STARS.length - g.stars)}</b>
                <span className="visually-hidden">{g.stars} of {AUDIENCE_STARS.length} stars</span>
                {g.stars < AUDIENCE_STARS.length && ` · next star at ${formatCount(AUDIENCE_STARS[g.stars]!)}`}
              </p>
            )}
            <p className="gear__next">
              {src.text}
              {src.to && (
                <>
                  {' '}
                  <Link to={src.to}>{src.label}</Link>
                </>
              )}
            </p>
            <div className="gear__ladder" aria-label="All pieces">
              {g.slot.tiers.map((t, i) => (
                <span key={t.name} className={i < g.tier ? 'is-on' : ''} title={`${t.name} · ${g.slot.unit(t.at)}`}>
                  <Art name={t.art} size={20} motion="pop" />
                </span>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Log posts published and, optionally, the audience size now. */
export function ContentForm({ today }: { today: DateKey }) {
  const repo = useRepo();
  const toast = useToast();
  const [posts, setPosts] = useState('');
  const [audience, setAudience] = useState('');
  const [date, setDate] = useState<string>(today);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(/[,\s]/g, '')));
  const p = num(posts);
  const a = num(audience);
  const valid = (p !== null && p > 0) || (a !== null && a >= 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const entry = await repo.addContent({ dateKey: isDateKey(date) ? date : today, posts: p ?? 0, audience: a, note });
      setPosts('');
      setAudience('');
      setNote('');
      const bits = [entry.posts ? `${entry.posts} post${entry.posts === 1 ? '' : 's'}` : '', entry.audience !== null ? `audience ${entry.audience.toLocaleString('en-US')}` : ''].filter(Boolean);
      toast({ message: `Logged ${bits.join(' and ')}`, tone: 'success', action: { label: 'Undo', run: () => repo.deleteContent(entry.id) } });
    } catch (err) {
      toast({ message: (err as Error).message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="earn-form content-form" onSubmit={(e) => void submit(e)}>
      <p className="overline">Log content</p>
      <div className="earn-form__row">
        <label>
          <span className="visually-hidden">Posts published</span>
          <input className="input" inputMode="numeric" placeholder="Posts, e.g. 3" value={posts} onChange={(e) => setPosts(e.target.value)} />
        </label>
        <label>
          <span className="visually-hidden">Audience size now (optional)</span>
          <input className="input" inputMode="numeric" placeholder="Audience now" value={audience} onChange={(e) => setAudience(e.target.value)} />
        </label>
        <label>
          <span className="visually-hidden">Date</span>
          <input className="input" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <label>
        <span className="visually-hidden">Note</span>
        <input className="input" placeholder="Where, e.g. YouTube, Instagram (optional)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button type="submit" className="btn btn--primary btn--sm" disabled={busy || !valid}>
        Log content
      </button>
    </form>
  );
}

export function ContentLog() {
  const log = useContentLog();
  const repo = useRepo();
  const toast = useToast();
  if (!log || log.length === 0) return null;
  return (
    <section className="panel earn-log" aria-labelledby="content-log-heading">
      <h2 id="content-log-heading" className="panel__title">
        Content log
      </h2>
      <ul>
        {log.slice(0, 50).map((e) => {
          const what = [e.posts ? `${e.posts} post${e.posts === 1 ? '' : 's'}` : '', e.audience !== null ? `${formatCount(e.audience)} audience` : ''].filter(Boolean).join(' · ');
          return (
            <li key={e.id}>
              <span className="earn-log__amt tabular">{what}</span>
              <span className="earn-log__note">{e.note || 'No note'}</span>
              <span className="earn-log__date">{formatMedium(e.dateKey)}</span>
              <button
                type="button"
                className="icon-btn icon-btn--sm"
                aria-label={`Delete ${what} from ${formatMedium(e.dateKey)}`}
                onClick={async () => {
                  await repo.deleteContent(e.id);
                  toast({ message: 'Entry deleted', action: { label: 'Undo', run: () => repo.restoreContent(e.id) } });
                }}
              >
                <Icon name="close" size={14} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
