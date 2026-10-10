import { useId, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { addDays, formatShort, type DateKey } from '../../date/localDate';
import type { PaceState, Streak } from '../../domain/goals';
import type { VisionPlan } from '../../domain/models';
import { planTimeline } from '../../domain/plans';
import type { GoalView } from './boardModel';

/** Time elapsed and achievement side by side, so passing months never look like progress. */
export function TimeVsAchievement({ plan, today, achievement, achievementText }: { plan: Pick<VisionPlan, 'startDate' | 'endDate'>; today: DateKey; achievement: number | null; achievementText: string }) {
  const t = planTimeline(today, plan.startDate, plan.endDate);
  const pct = achievement === null ? null : Math.round(achievement * 1000) / 10;
  return (
    <div className="plan-card__measures">
      <div className="measure">
        <div className="measure__head">
          <span>Time elapsed</span>
          <span className="tabular">
            {t.elapsedDays.toLocaleString('en-US')} of {t.totalDays.toLocaleString('en-US')} days
          </span>
        </div>
        <div className="measure__track measure__track--time" role="progressbar" aria-label="Time elapsed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(t.timeFraction * 100)}>
          <div style={{ width: `${t.timeFraction * 100}%` }} />
        </div>
      </div>
      <div className="measure">
        <div className="measure__head">
          <span>Achievement</span>
          <span className="tabular">{achievementText}</span>
        </div>
        {pct === null ? (
          <div className="measure__track measure__track--empty" aria-hidden="true" />
        ) : (
          <div className="measure__track measure__track--achieved" role="progressbar" aria-label="Achievement" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <div style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

const PACE_TONE: Record<PaceState, string> = {
  'not-started': 'quiet',
  ahead: 'good',
  'on-pace': 'good',
  behind: 'warn',
  done: 'gold',
  ended: 'warn',
  unmeasured: 'quiet',
};

export function PaceChip({ state, label }: { state: PaceState; label: string }) {
  if (state === 'unmeasured') return null;
  return <span className={`pace pace--${PACE_TONE[state]}`}>{label}</span>;
}

export function StreakFlame({ streak, compact }: { streak: Streak; compact?: boolean }) {
  const lit = streak.current > 0;
  const label = `${streak.current}-day streak${streak.activeToday ? ', today counted' : lit ? ', keep it alive today' : ''}`;
  return (
    <span className={`flame ${lit ? 'flame--lit' : ''} ${streak.activeToday ? 'flame--today' : ''}`} title={label} aria-label={label}>
      <Icon name="flame" size={compact ? 14 : 16} />
      <span className="tabular">{streak.current}</span>
    </span>
  );
}

/** The last N days as dots: filled when the goal moved forward that day. */
export function ActivityStrip({ dates, today, days = 14 }: { dates: Set<DateKey>; today: DateKey; days?: number }) {
  const keys = Array.from({ length: days }, (_, i) => addDays(today, i - days + 1));
  const count = keys.filter((k) => dates.has(k)).length;
  return (
    <div className="strip-days" style={{ '--days': days } as CSSProperties} role="img" aria-label={`Active on ${count} of the last ${days} days`}>
      {keys.map((k) => (
        <span key={k} className={`strip-days__dot ${dates.has(k) ? 'is-on' : ''} ${k === today ? 'is-today' : ''}`} title={`${formatShort(k)}${dates.has(k) ? ': moved forward' : ''}`} />
      ))}
    </div>
  );
}

export function GoalRow({ view }: { view: GoalView }) {
  const { goal, progress, streak, pace } = view;
  const pct = progress.fraction === null ? null : Math.round(progress.fraction * 100);
  const tone = goal.category === 'both' ? 'gold' : goal.category;
  return (
    <li>
      <Link to={`/goals/${goal.id}`} className={`goal-row goal-row--${tone} ${goal.status === 'achieved' ? 'is-achieved' : ''}`}>
        <div className="goal-row__top">
          <span className="goal-row__title">{goal.title}</span>
          <StreakFlame streak={streak} compact />
        </div>
        <div className="goal-row__bar" aria-hidden="true">
          <div style={{ width: `${pct ?? 0}%` }} />
        </div>
        <div className="goal-row__meta">
          <span className="tabular">{goal.status === 'achieved' ? 'Achieved' : progress.summary}</span>
          {goal.status === 'paused' ? <span className="pace pace--quiet">Paused</span> : <PaceChip state={pace.state} label={pace.label} />}
          {goal.domain && <span className="goal-row__domain">{goal.domain}</span>}
          {view.habits.some((h) => !h.stoppedAt) && (
            <span className="goal-row__domain">
              ↻ {view.habits.filter((h) => !h.stoppedAt).length} habit{view.habits.filter((h) => !h.stoppedAt).length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}

/** Text that reads as prose until you choose to edit it. Saves explicitly. */
export function EditableText({
  label, value, placeholder, onSave, multiline = true, className = '',
}: { label: string; value: string; placeholder: string; onSave: (next: string) => Promise<void>; multiline?: boolean; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } catch (e) {
      setError((e as Error).message || 'Could not save. Your text is still here.');
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <div className={`editable ${className}`}>
        {value ? <p className="editable__text">{value}</p> : <p className="editable__empty">{placeholder}</p>}
        <button
          type="button"
          className="link-btn link-btn--quiet editable__edit"
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
        >
          <Icon name="pen" size={13} /> {value ? 'Edit' : 'Write'}
          <span className="visually-hidden"> {label}</span>
        </button>
      </div>
    );
  }
  return (
    <div className={`editable editable--editing ${className}`}>
      <label className="visually-hidden" htmlFor={id}>
        {label}
      </label>
      {multiline ? (
        <textarea id={id} className="input input--area" rows={3} value={draft} autoFocus onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} />
      ) : (
        <input id={id} className="input" value={draft} autoFocus onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} />
      )}
      <div className="editable__actions">
        <button type="button" className="btn btn--primary btn--sm" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(false)}>
          Cancel
        </button>
        {error && (
          <span className="form-error" role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
