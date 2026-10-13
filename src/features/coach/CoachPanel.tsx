import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Art } from '../../components/art/Art';
import { useToast } from '../../components/Toasts';
import { formatShort, dateKeyInZone } from '../../date/localDate';
import { useCoachNote, usePrinciples } from '../../storage/queries';
import { useProfile, useRepo } from '../../storage/StorageProvider';
import { coachMessages, parseCoach, type CoachInput } from './coachPrompt';
import { askClaudeCoach, useClaudeCoach } from './claudeCoach';
import { askCoach, coachKey, coachModel } from './openrouter';

type Props = Omit<CoachInput, 'principles' | 'name'>;

/** The AI coach's notes for one report period: written on request, saved with the record. */
export function CoachPanel(props: Props) {
  const { kind, range } = props;
  const note = useCoachNote(kind, range.start);
  const principles = usePrinciples();
  const profile = useProfile();
  const repo = useRepo();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ctl = useRef<AbortController | null>(null);
  const claude = useClaudeCoach();
  const hasKey = !!coachKey.get() || claude === true;
  const empty = props.stats.completed === 0 && props.stats.entries === 0 && props.stats.scheduled === 0;
  const label = kind === 'week' ? 'week' : 'month';

  const write = async () => {
    setBusy(true);
    setError('');
    ctl.current = new AbortController();
    try {
      const messages = coachMessages({ ...props, name: profile.displayName, principles: (principles ?? []).map((p) => p.text) });
      const r = claude ? await askClaudeCoach(messages, ctl.current.signal) : await askCoach(coachKey.get(), coachModel.get(), messages, { signal: ctl.current.signal });
      await repo.saveCoachNote(kind, range.start, r);
      toast({ message: "Coach's notes saved with this report", tone: 'success' });
    } catch (e) {
      if (!ctl.current?.signal.aborted) setError((e as Error).message);
    } finally {
      setBusy(false);
      ctl.current = null;
    }
  };

  return (
    <section className="panel coach" aria-labelledby="coach-heading" aria-busy={busy}>
      <h2 id="coach-heading" className="panel__title panel__title--art art-host">
        <Art name="crystal-ball" size={26} motion="wiggle" />
        Coach's notes
      </h2>
      {!hasKey ? (
        <p className="panel__sub">
          An AI coach can read this {label}'s record and write what went well, what slipped and three moves for next {label}. Add your OpenRouter key in{' '}
          <Link to="/settings">Settings</Link> to turn it on. Free models only.
        </p>
      ) : note ? (
        <>
          <div className="coach__body">
            {parseCoach(note.text).map((b, i) =>
              b.type === 'heading' ? (
                <h3 key={i} className="coach__h">
                  {b.text}
                </h3>
              ) : b.type === 'item' ? (
                <p key={i} className={`coach__item ${b.n ? 'coach__item--n' : ''}`}>
                  {b.n ? <span className="coach__n">{b.n}</span> : null}
                  {b.text}
                </p>
              ) : (
                <p key={i} className="coach__p">
                  {b.text}
                </p>
              ),
            )}
          </div>
          <p className="coach__meta">
            Written {formatShort(dateKeyInZone(new Date(note.createdAt), profile.timeZone))} by {note.model.replace(/:free$/, '')} · AI can be wrong; your record is the truth.
          </p>
          <div className="coach__actions">
            <button type="button" className="btn btn--quiet btn--sm" onClick={() => void write()} disabled={busy}>
              {busy ? 'Rewriting…' : 'Rewrite'}
            </button>
            <button type="button" className="btn btn--quiet btn--sm" onClick={() => void repo.deleteCoachNote(kind, range.start)} disabled={busy}>
              Delete notes
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="panel__sub">
            {empty ? `Nothing is recorded for this ${label} yet, so there is nothing to coach on.` : `Reads this ${label}'s tasks, journal, goals and principles, then writes honest notes. It takes a few seconds.`}
          </p>
          <div className="coach__actions">
            <button type="button" className="btn btn--primary btn--sm" onClick={() => void write()} disabled={busy || empty}>
              {busy ? 'Writing…' : `Write my ${label}'s notes`}
            </button>
            {busy && (
              <button type="button" className="btn btn--quiet btn--sm" onClick={() => ctl.current?.abort()}>
                Cancel
              </button>
            )}
          </div>
        </>
      )}
      {error && (
        <p className="coach__error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
