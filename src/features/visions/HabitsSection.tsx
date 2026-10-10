import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toasts';
import { dayOfWeek, type DateKey } from '../../date/localDate';
import type { Category } from '../../domain/config';
import { computeStreak } from '../../domain/goals';
import type { Goal, RecurrenceRule, Task, TaskSeries } from '../../domain/models';
import { describeRule } from '../../domain/recurrence';
import { useRepo } from '../../storage/StorageProvider';
import { useTaskActions } from '../tasks/useTaskActions';
import { StreakFlame } from './parts';

type Freq = 'daily' | 'weekdays' | 'custom';

const WEEKDAYS = [
  { d: 1, label: 'Mon' },
  { d: 2, label: 'Tue' },
  { d: 3, label: 'Wed' },
  { d: 4, label: 'Thu' },
  { d: 5, label: 'Fri' },
  { d: 6, label: 'Sat' },
  { d: 0, label: 'Sun' },
];

interface Props {
  goal: Goal;
  habits: TaskSeries[];
  /** Linked tasks, used to find each habit's occurrence for today and its streak. */
  tasks: Task[];
  today: DateKey;
  timeZone: string;
  onCompleted?: (task: Task) => void;
}

/**
 * Daily habits: repeating tasks tied to this goal. Each one appears on Today
 * on its days, and ticking it off moves the goal's streak.
 */
export function HabitsSection({ goal, habits, tasks, today, timeZone, onCompleted }: Props) {
  const repo = useRepo();
  const toast = useToast();
  const actions = useTaskActions(timeZone);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<Category>(goal.category === 'learning' ? 'learning' : 'doing');
  const [freq, setFreq] = useState<Freq>('daily');
  const [days, setDays] = useState<number[]>([dayOfWeek(today)]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const live = habits.filter((h) => !h.stoppedAt);
  const paused = habits.filter((h) => h.stoppedAt);

  const add = async () => {
    setError(null);
    const rule: RecurrenceRule =
      freq === 'daily' ? { freq: 'daily', interval: 1 } : freq === 'weekdays' ? { freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] } : { freq: 'weekly', interval: 1, byWeekday: days.length ? days : [dayOfWeek(today)] };
    setBusy(true);
    try {
      await repo.addHabit({ goalId: goal.id, title, category, rule, startDate: today });
      setTitle('');
      setAdding(false);
      toast({ message: 'Habit added. It shows up on Today on its days.', tone: 'success' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const row = (h: TaskSeries) => {
    const occurrences = tasks.filter((t) => t.seriesId === h.id);
    const todays = occurrences.find((t) => t.occurrenceDate === today && !t.deletedAt);
    const streak = computeStreak(
      occurrences.filter((t) => t.status === 'completed' && t.completionLocalDate).map((t) => t.completionLocalDate!),
      today,
    );
    const done = todays?.status === 'completed';
    return (
      <li key={h.id} className={`habit habit--${h.category} ${h.stoppedAt ? 'habit--paused' : ''} ${done ? 'habit--done' : ''}`}>
        {todays && !h.stoppedAt ? (
          <label className="task__check">
            <input
              type="checkbox"
              checked={done}
              onChange={async () => {
                const after = await actions.setStatus(todays, done ? 'todo' : 'completed');
                if (after && !done) onCompleted?.(after);
              }}
              aria-label={`${done ? 'Mark not done today' : 'Done today'}: ${h.title}`}
            />
            <span className="task__box" aria-hidden="true">
              {done && <Icon name="check" size={14} />}
            </span>
          </label>
        ) : (
          <span className="habit__off" aria-hidden="true">
            ↻
          </span>
        )}
        <div className="habit__main">
          <span className="habit__title">{h.title}</span>
          <span className="habit__rule">
            {h.stoppedAt ? 'Paused' : describeRule(h.rule)}
            {!h.stoppedAt && !todays && ' · not scheduled today'}
          </span>
        </div>
        <StreakFlame streak={streak} compact />
        {h.stoppedAt ? (
          <button type="button" className="btn btn--quiet btn--sm" onClick={() => void repo.resumeSeries(h.id, today).then(() => toast({ message: 'Habit resumed' }))}>
            Resume
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() =>
              void repo.stopSeries(h.id).then(() =>
                toast({ message: 'Habit paused. Past days are kept.', action: { label: 'Undo', run: () => repo.resumeSeries(h.id, today) } }),
              )
            }
          >
            Pause
          </button>
        )}
      </li>
    );
  };

  return (
    <section className="panel" aria-labelledby="habits-heading">
      <div className="panel__head">
        <div>
          <h2 id="habits-heading" className="panel__title">
            Daily habits
          </h2>
          <p className="panel__sub">Constant actions that move this goal. They appear on Today by themselves.</p>
        </div>
        {!adding && (
          <button type="button" className="btn btn--quiet btn--sm" onClick={() => setAdding(true)}>
            <Icon name="plus" size={14} /> Add habit
          </button>
        )}
      </div>

      {live.length === 0 && paused.length === 0 && !adding && (
        <p className="panel__empty">No habits yet. Add one small thing you will do every day, like “Make 20 sales calls” or “Read 10 pages”.</p>
      )}
      {(live.length > 0 || paused.length > 0) && <ul className="habits">{[...live, ...paused].map(row)}</ul>}

      {adding && (
        <form
          className="habit-form"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <label className="field field--full">
            <span className="field__label">Habit</span>
            <input className="input" id="habit-title" value={title} autoFocus maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Make 20 sales calls" />
          </label>
          <div className="habit-form__row">
            <div className="segmented" role="group" aria-label="Track">
              <button type="button" className="segmented__btn segmented__btn--learning" aria-pressed={category === 'learning'} onClick={() => setCategory('learning')}>
                Learning
              </button>
              <button type="button" className="segmented__btn segmented__btn--doing" aria-pressed={category === 'doing'} onClick={() => setCategory('doing')}>
                Doing
              </button>
            </div>
            <label className="visually-hidden" htmlFor="habit-freq">
              How often
            </label>
            <select id="habit-freq" className="input input--sm" value={freq} onChange={(e) => setFreq(e.target.value as Freq)}>
              <option value="daily">Every day</option>
              <option value="weekdays">Weekdays</option>
              <option value="custom">Pick days…</option>
            </select>
          </div>
          {freq === 'custom' && (
            <div className="weekday-picks" role="group" aria-label="Days">
              {WEEKDAYS.map(({ d, label }) => (
                <button key={d} type="button" className="segmented__btn" aria-pressed={days.includes(d)} onClick={() => setDays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]))}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="habit-form__actions">
            <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
              {busy ? 'Adding…' : 'Add habit'}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
