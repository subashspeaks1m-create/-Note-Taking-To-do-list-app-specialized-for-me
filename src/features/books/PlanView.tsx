import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Meter } from '../../components/Progress';
import { useTodayKey } from '../../date/clock';
import { addDays, formatShort, formatWeekday } from '../../date/localDate';
import { PROFILE_DEFAULTS } from '../../domain/config';
import type { BookRecord, PlanId, PlanProgress } from './db';
import { actionKey, currentDay, dateForDay, dayDone, planStats, weekOfDay } from './planMath';
import { setDayNote, startPlan, stopPlan, toggleAction } from './practice';
import type { Plan30, Plan7, PlanDay } from './schema';

const KIND_LABEL = { do: 'Do', reflect: 'Reflect', learn: 'Learn' } as const;

export function PlanView({ book, planId, plan }: { book: BookRecord; planId: PlanId; plan: Plan7 | Plan30 }) {
  const today = useTodayKey(PROFILE_DEFAULTS.timeZone);
  const progress = book.practice[planId];
  const length = plan.days.length;
  const weeks = 'weeks' in plan ? plan.weeks : null;
  const now = progress ? currentDay(progress, today) : 0;
  const [selected, setSelected] = useState<number>(() => (progress ? Math.min(Math.max(now, 1), length) : 1));
  const day = plan.days.find((d) => d.day === selected) ?? plan.days[0];

  return (
    <div className="plan">
      <section className="hero-card">
        <p className="overline">{length}-day roadmap · goal</p>
        <p className="hero-card__line">{plan.goal}</p>
        {progress ? (
          <PlanStatus progress={progress} days={plan.days} now={now} length={length} onStop={() => window.confirm('Stop this plan and clear its check-offs?') && void stopPlan(book.id, planId)} />
        ) : (
          <div className="plan__start">
            <button type="button" className="btn btn--primary" onClick={() => void startPlan(book.id, planId, today)}>
              <Icon name="flame" size={16} /> Start today
            </button>
            <button type="button" className="btn btn--quiet" onClick={() => void startPlan(book.id, planId, addDays(today, 1))}>
              Start tomorrow
            </button>
            <span className="muted">Each day gets a date, a checklist and a check-in. Today's actions also show on the Books page.</span>
          </div>
        )}
      </section>

      {weeks && (
        <ol className="weeks">
          {weeks.map((w) => (
            <li key={w.week} className={`week ${day && weekOfDay(day.day) === w.week ? 'week--current' : ''}`}>
              <p className="overline">Week {w.week}</p>
              <p className="week__focus">{w.focus}</p>
              <p className="week__milestone">
                <Icon name="vision" size={14} /> {w.milestone}
              </p>
            </li>
          ))}
        </ol>
      )}

      <div className={`day-strip ${length > 7 ? 'day-strip--long' : ''}`} role="tablist" aria-label="Plan days">
        {plan.days.map((d) => {
          const complete = progress ? dayDone(progress, d) : false;
          const partial = progress && !complete && d.actions.some((_, i) => progress.done[actionKey(d.day, i)]);
          const isToday = progress && d.day === now;
          return (
            <button
              key={d.day}
              type="button"
              role="tab"
              aria-selected={d.day === selected}
              className={`day-chip ${complete ? 'day-chip--done' : ''} ${partial ? 'day-chip--partial' : ''} ${isToday ? 'day-chip--today' : ''}`}
              onClick={() => setSelected(d.day)}
              title={d.theme}
            >
              <span className="day-chip__n tabular">{d.day}</span>
              {progress && length <= 7 && <span className="day-chip__date">{formatShort(dateForDay(progress, d.day))}</span>}
            </button>
          );
        })}
      </div>

      {day && <DayCard key={`${planId}-${day.day}`} book={book} planId={planId} day={day} progress={progress} isToday={!!progress && day.day === now} />}

      {'successSigns' in plan && plan.successSigns.length > 0 && (
        <section>
          <h2 className="section-title">Signs it's working</h2>
          <ul className="bullets">
            {plan.successSigns.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PlanStatus({ progress, days, now, length, onStop }: { progress: PlanProgress; days: PlanDay[]; now: number; length: number; onStop: () => void }) {
  const stats = planStats(progress, days);
  const label = now < 1 ? `Starts ${formatShort(progress.startDate)}` : now > length ? 'Plan finished' : `Day ${now} of ${length}`;
  return (
    <div className="plan__status">
      <p className="plan__day">{label}</p>
      <Meter fraction={stats.actionsTotal ? stats.actionsDone / stats.actionsTotal : 0} tone="gold" label="Actions completed" valueText={`${stats.actionsDone} of ${stats.actionsTotal}`} />
      <p className="muted tabular">
        {stats.daysDone} of {length} days fully done
      </p>
      <button type="button" className="btn btn--ghost btn--sm" onClick={onStop}>
        Stop plan
      </button>
    </div>
  );
}

function DayCard({ book, planId, day, progress, isToday }: { book: BookRecord; planId: PlanId; day: PlanDay; progress?: PlanProgress; isToday: boolean }) {
  const date = progress ? dateForDay(progress, day.day) : null;
  const total = day.actions.reduce((n, a) => n + a.minutes, 0);
  return (
    <article className={`day-card ${isToday ? 'day-card--today' : ''}`}>
      <header className="day-card__head">
        <div>
          <p className="overline">
            Day {day.day}
            {date && ` · ${formatWeekday(date)}, ${formatShort(date)}`}
            {isToday && ' · Today'}
          </p>
          <h3 className="day-card__theme">{day.theme}</h3>
          <p className="muted">{day.why}</p>
        </div>
        <span className="chip chip--quiet tabular">{total} min</span>
      </header>
      <ul className="checklist">
        {day.actions.map((a, i) => {
          const checked = !!progress?.done[actionKey(day.day, i)];
          return (
            <li key={i}>
              <label className={`check ${checked ? 'check--done' : ''} ${progress ? '' : 'check--locked'}`}>
                <input type="checkbox" checked={checked} disabled={!progress} onChange={() => void toggleAction(book.id, planId, day.day, i)} />
                <span className="check__box" aria-hidden="true">
                  <Icon name="check" size={14} />
                </span>
                <span className="check__text">{a.text}</span>
                <span className={`check__kind check__kind--${a.kind}`}>{KIND_LABEL[a.kind]}</span>
                <span className="check__meta tabular">{a.minutes} min</span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="day-card__reflect">
        <p className="mini-title">
          <Icon name="reflection" size={14} /> Evening check-in
        </p>
        <p>{day.reflection}</p>
        {progress && <NoteField key={day.day} initial={progress.notes[String(day.day)] ?? ''} onSave={(t) => void setDayNote(book.id, planId, day.day, t)} />}
      </div>
    </article>
  );
}

function NoteField({ initial, onSave }: { initial: string; onSave: (text: string) => void }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(true);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef({ text, onSave });
  useEffect(() => {
    latest.current = { text, onSave };
  });
  useEffect(
    () => () => {
      if (timer.current !== undefined) {
        window.clearTimeout(timer.current);
        latest.current.onSave(latest.current.text);
      }
    },
    [],
  );
  return (
    <label className="field">
      <span className="visually-hidden">Your answer</span>
      <textarea
        rows={3}
        value={text}
        placeholder="What happened? What will you adjust tomorrow?"
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
          window.clearTimeout(timer.current);
          const value = e.target.value;
          timer.current = window.setTimeout(() => {
            timer.current = undefined;
            onSave(value);
            setSaved(true);
          }, 600);
        }}
      />
      <span className="field__hint" aria-live="polite">
        {saved ? (text ? 'Saved' : '') : 'Saving…'}
      </span>
    </label>
  );
}
