import { StaleNotice } from '../../components/StaleNotice';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { dayOfWeek, formatMedium, isDateKey, parseKey, type DateKey } from '../../date/localDate';
import { TASK_TITLE_MAX, type Category, type Effort } from '../../domain/config';
import type { ID, Priority, RecurrenceRule, Task, TaskStatus } from '../../domain/models';
import { describeRule } from '../../domain/recurrence';
import { goalChain } from '../../domain/goals';
import { withGoalDefaults } from '../../storage/queries';
import { PRIORITY_LABEL } from '../../domain/tasks';
import { StaleEditError } from '../../storage/repo';
import { useRepo, useStorage } from '../../storage/StorageProvider';
import { requestPersistenceOnce } from '../../storage/persistence';

type RepeatChoice = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly';

interface Props {
  /** Existing task to edit, or null to create one. */
  task: Task | null;
  defaultDate: DateKey;
  defaultCategory: Category;
  initialTitle?: string;
  timeZone: string;
  onClose: () => void;
  onSaved?: (message: string) => void;
}

const WEEKDAYS = [
  { d: 1, label: 'Mon' },
  { d: 2, label: 'Tue' },
  { d: 3, label: 'Wed' },
  { d: 4, label: 'Thu' },
  { d: 5, label: 'Fri' },
  { d: 6, label: 'Sat' },
  { d: 0, label: 'Sun' },
];

const EFFORT_HELP: Record<Effort, string> = { small: 'Small · 10 XP', standard: 'Standard · 20 XP', deep: 'Deep · 35 XP' };

function ruleFor(choice: RepeatChoice, date: DateKey, weekdays: number[]): RecurrenceRule | null {
  switch (choice) {
    case 'none':
      return null;
    case 'daily':
      return { freq: 'daily', interval: 1 };
    case 'weekdays':
      return { freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] };
    case 'weekly':
      return { freq: 'weekly', interval: 1, byWeekday: weekdays.length ? weekdays : [dayOfWeek(date)] };
    case 'monthly':
      return { freq: 'monthly', interval: 1, byMonthDay: parseKey(date).day };
  }
}

export function TaskEditor({ task, defaultDate, defaultCategory, initialTitle = '', timeZone, onClose, onSaved }: Props) {
  const repo = useRepo();
  const { db } = useStorage();
  const [title, setTitle] = useState(task?.title ?? initialTitle);
  const [details, setDetails] = useState(task?.details ?? '');
  const [category, setCategory] = useState<Category>(task?.category ?? defaultCategory);
  const [date, setDate] = useState<string>(task?.scheduledDate ?? defaultDate);
  const [unscheduled, setUnscheduled] = useState(task ? task.scheduledDate === null : false);
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'todo');
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 0);
  const [effort, setEffort] = useState<Effort>(task?.effort ?? 'standard');
  const [dueTime, setDueTime] = useState(task?.dueTime ?? '');
  const [minutes, setMinutes] = useState(task?.estimatedMinutes?.toString() ?? '');
  const [tags, setTags] = useState(task?.tags.join(', ') ?? '');
  const [repeat, setRepeat] = useState<RepeatChoice>('none');
  const [weekdays, setWeekdays] = useState<number[]>([dayOfWeek(defaultDate)]);
  const [goalIds, setGoalIds] = useState<ID[]>(task?.goalIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The revision this form started from, so an edit made in another tab is never silently overwritten.
  const [baseRevision, setBaseRevision] = useState(task?.revision);
  const [stale, setStale] = useState(false);
  const goalData = useLiveQuery(async () => ({ goals: (await db.goals.toArray()).map(withGoalDefaults), plans: await db.plans.toArray() }), [db]);
  const linkable = (goalData?.goals ?? []).filter((g) => (g.status === 'active' || g.status === 'paused') || goalIds.includes(g.id));

  const series = useLiveQuery(async () => (task?.seriesId ? db.taskSeries.get(task.seriesId) : undefined), [db, task?.seriesId]);
  const moves = useLiveQuery(async () => (task ? repo.taskMoves(task.id) : []), [repo, task?.id]);

  const save = async () => {
    setError(null);
    if (!unscheduled && !isDateKey(date)) {
      setError('Choose a valid day, or mark the task unscheduled.');
      return;
    }
    const est = minutes.trim() ? Number(minutes) : null;
    if (est !== null && (!Number.isFinite(est) || est <= 0 || est > 24 * 60)) {
      setError('Estimated minutes should be a number between 1 and 1440.');
      return;
    }
    const fields = {
      title,
      details: details.trim(),
      category,
      priority,
      effort,
      dueTime: dueTime || null,
      estimatedMinutes: est,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      goalIds,
    };
    setBusy(true);
    try {
      const scheduledDate = unscheduled ? null : (date as DateKey);
      if (!task) {
        const rule = scheduledDate ? ruleFor(repeat, scheduledDate, weekdays) : null;
        if (rule && scheduledDate) {
          await repo.createSeries({ ...fields, scheduledDate, rule });
          onSaved?.(`Repeating task added: ${describeRule(rule).toLowerCase()}`);
        } else {
          await repo.addTask({ ...fields, scheduledDate });
          onSaved?.('Task added');
        }
      } else {
        await repo.updateTask(task.id, fields, baseRevision);
        if (scheduledDate !== task.scheduledDate) await repo.moveTasks([task.id], scheduledDate, 'reschedule');
        if (status !== task.status) await repo.setTaskStatus(task.id, status, timeZone);
        onSaved?.('Task saved');
      }
      void requestPersistenceOnce(repo);
      onClose();
    } catch (e) {
      if (e instanceof StaleEditError) setStale(true);
      else setError((e as Error).message || 'Could not save. Your changes are still here.');
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={task ? 'Edit task' : 'New task'}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : task ? 'Save task' : 'Add task'}
          </button>
        </>
      }
    >
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="field field--full">
          <span className="field__label">
            Task <span className="field__hint">one line · {title.length}/{TASK_TITLE_MAX}</span>
          </span>
          <input id="task-title" className="input input--lg" value={title} maxLength={TASK_TITLE_MAX} onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))} autoFocus required />
        </label>

        <div className="field">
          <span className="field__label" id="te-cat">
            Category
          </span>
          <div className="segmented" role="group" aria-labelledby="te-cat">
            <button type="button" className="segmented__btn segmented__btn--learning" aria-pressed={category === 'learning'} onClick={() => setCategory('learning')}>
              Learning
            </button>
            <button type="button" className="segmented__btn segmented__btn--doing" aria-pressed={category === 'doing'} onClick={() => setCategory('doing')}>
              Doing
            </button>
          </div>
        </div>

        <div className="field">
          <span className="field__label">Day</span>
          <div className="field__row">
            <input id="task-date" className="input" type="date" value={unscheduled ? '' : date} disabled={unscheduled} onChange={(e) => setDate(e.target.value)} aria-label="Scheduled day" />
            <label className="check">
              <input id="task-unscheduled" type="checkbox" checked={unscheduled} onChange={(e) => setUnscheduled(e.target.checked)} />
              <span>Unscheduled</span>
            </label>
          </div>
        </div>

        <div className="field">
          <span className="field__label" id="te-effort">
            Effort
          </span>
          <div className="segmented" role="group" aria-labelledby="te-effort">
            {(['small', 'standard', 'deep'] as const).map((e) => (
              <button key={e} type="button" className="segmented__btn" aria-pressed={effort === e} onClick={() => setEffort(e)} title={EFFORT_HELP[e]}>
                {e[0]!.toUpperCase() + e.slice(1)}
              </button>
            ))}
          </div>
          {task?.award && <span className="field__note">Reward locked at first completion: {task.award.nominalXp} XP.</span>}
        </div>

        <label className="field">
          <span className="field__label">Priority</span>
          <select id="task-priority" className="input" value={priority} onChange={(e) => setPriority(Number(e.target.value) as Priority)}>
            {([0, 1, 2, 3] as const).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field__label">Time</span>
          <input id="task-time" className="input" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
        </label>

        <label className="field">
          <span className="field__label">Estimated minutes</span>
          <input id="task-minutes" className="input" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/[^\d]/g, ''))} placeholder="Optional" />
        </label>

        {task && (
          <label className="field">
            <span className="field__label">Status</span>
            <select id="task-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
              <option value="todo">To do</option>
              <option value="in-progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="canceled">Canceled</option>
            </select>
          </label>
        )}

        <label className="field">
          <span className="field__label">Tags</span>
          <input id="task-tags" className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Comma separated" />
        </label>

        <label className="field field--full">
          <span className="field__label">Details</span>
          <textarea id="task-details" className="input input--area" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Optional notes, links or steps" />
        </label>

        {!task && !unscheduled && (
          <div className="field field--full">
            <span className="field__label">Repeat</span>
            <select id="task-repeat" className="input" value={repeat} onChange={(e) => setRepeat(e.target.value as RepeatChoice)}>
              <option value="none">Does not repeat</option>
              <option value="daily">Every day</option>
              <option value="weekdays">Every weekday (Mon–Fri)</option>
              <option value="weekly">Weekly on chosen days</option>
              <option value="monthly">Monthly on day {isDateKey(date) ? parseKey(date).day : ''}</option>
            </select>
            {repeat === 'weekly' && (
              <div className="weekday-picks" role="group" aria-label="Repeat on">
                {WEEKDAYS.map(({ d, label }) => (
                  <button
                    key={d}
                    type="button"
                    className="segmented__btn"
                    aria-pressed={weekdays.includes(d)}
                    onClick={() => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]))}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {repeat !== 'none' && <span className="field__note">Each day gets its own task. A missed day stays on its date and doesn't pile up.</span>}
          </div>
        )}

        {linkable.length > 0 && (
          <div className="field field--full">
            <span className="field__label" id="te-goals">
              Moves these goals <span className="field__hint">optional</span>
            </span>
            <div className="goal-picks" role="group" aria-labelledby="te-goals">
              {linkable.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="goal-pick"
                  aria-pressed={goalIds.includes(g.id)}
                  onClick={() => setGoalIds((ids) => (ids.includes(g.id) ? ids.filter((x) => x !== g.id) : [...ids, g.id]))}
                >
                  {g.title}
                </button>
              ))}
            </div>
            {goalIds.length > 0 && goalData && (
              <ul className="goal-chain">
                {goalIds.map((id) => {
                  const chain = goalChain(goalData.goals, goalData.plans, id);
                  if (!chain.goals.length) return null;
                  return (
                    <li key={id}>
                      <span className="goal-chain__task">This task</span>
                      {chain.goals.map((g) => (
                        <span key={g.id}>
                          <span aria-hidden="true"> → </span>
                          {g.title}
                        </span>
                      ))}
                      {chain.plan && (
                        <span>
                          <span aria-hidden="true"> → </span>
                          <strong>{chain.plan.title}</strong>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {series && (
          <div className="field field--full series-note">
            <span>
              Repeats: <strong>{describeRule(series.rule)}</strong>
              {series.stoppedAt ? ' (stopped)' : ''}
            </span>
            {!series.stoppedAt && (
              <button
                type="button"
                className="btn btn--quiet btn--sm"
                onClick={async () => {
                  await repo.stopSeries(series.id);
                  onSaved?.('Repeating stopped. Existing days are kept.');
                }}
              >
                Stop repeating
              </button>
            )}
          </div>
        )}

        {moves && moves.length > 0 && (
          <div className="field field--full">
            <span className="field__label">Moves</span>
            <ul className="move-history">
              {moves.map((m) => (
                <li key={m.id}>
                  {m.fromDate ? formatMedium(m.fromDate) : 'Unscheduled'} → {m.toDate ? formatMedium(m.toDate) : 'Unscheduled'}
                </li>
              ))}
            </ul>
          </div>
        )}
        <button type="submit" hidden />
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {stale && (
        <StaleNotice
          what="task"
          onKeepTheirs={onClose}
          onKeepMine={() => {
            setStale(false);
            setBaseRevision(undefined);
          }}
        />
      )}
    </Dialog>
  );
}
