import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Menu, type MenuItem } from '../../components/Menu';
import { EmptyState } from '../../components/Page';
import { useToast } from '../../components/Toasts';
import { useTodayKey } from '../../date/clock';
import { dateKeyInZone, formatMedium, formatShort, formatTimeInZone } from '../../date/localDate';
import { dailyNeeded, formatAmount, PLAN_KIND_LABEL } from '../../domain/goals';
import type { GoalStatus, GoalUpdate, Task } from '../../domain/models';
import { useGoalBoard, useUnlockRecords } from '../../storage/queries';
import { ChestCard } from '../character/Chests';
import { useProfile, useRepo } from '../../storage/StorageProvider';
import { buildBoard, type GoalView } from './boardModel';
import { GoalEditor } from './GoalEditor';
import { HabitsSection } from './HabitsSection';
import { ActivityStrip, GoalRow, PaceChip, StreakFlame } from './parts';

export function GoalPage() {
  const { goalId } = useParams();
  const profile = useProfile();
  const tz = profile.timeZone;
  const today = useTodayKey(tz);
  const repo = useRepo();
  const toast = useToast();
  const navigate = useNavigate();
  const board = useGoalBoard();
  const unlocks = useUnlockRecords();
  const model = useMemo(() => (board ? buildBoard(board, today, { includeArchived: true }) : null), [board, today]);
  const [editing, setEditing] = useState<'edit' | 'sub' | null>(null);

  // Habits for today must exist before the page can offer their checkboxes.
  useEffect(() => {
    repo.ensureOccurrences(today, today).catch(() => undefined);
  }, [repo, today]);

  if (!model || !board) {
    return (
      <div className="page page--narrow">
        <div className="skeleton-list" aria-hidden="true">
          <span />
          <span />
        </div>
      </div>
    );
  }
  const view = goalId ? model.goalViews.get(goalId) : undefined;
  if (!view) {
    return (
      <div className="page page--narrow">
        <EmptyState icon="vision" title="This goal isn't here." body="It may have been removed on another device, or the link is old.">
          <Link to="/visions" className="btn btn--primary">
            Back to Visions
          </Link>
        </EmptyState>
      </div>
    );
  }

  const { goal, plan } = view;
  const parent = goal.parentId ? board.goals.find((g) => g.id === goal.parentId) : null;
  const setStatus = async (status: GoalStatus, message: string) => {
    try {
      await repo.setGoalStatus(goal.id, status, today);
      toast({ message, tone: status === 'achieved' ? 'gold' : 'neutral', action: { label: 'Undo', run: () => repo.setGoalStatus(goal.id, goal.status, today).then(() => undefined) } });
    } catch (e) {
      toast({ message: (e as Error).message, tone: 'error' });
    }
  };
  const menu: (MenuItem | 'separator')[] = [
    { label: 'Edit goal', onSelect: () => setEditing('edit') },
    { label: 'Add a sub-goal', onSelect: () => setEditing('sub') },
    'separator',
    goal.status === 'achieved'
      ? { label: 'Mark not achieved', onSelect: () => void setStatus('active', 'Goal reopened') }
      : { label: 'Mark achieved', onSelect: () => void setStatus('achieved', 'Goal achieved. Well earned.') },
    goal.status === 'paused' ? { label: 'Resume goal', onSelect: () => void setStatus('active', 'Goal resumed') } : { label: 'Pause goal', onSelect: () => void setStatus('paused', 'Goal paused'), disabled: goal.status !== 'active' },
    goal.status === 'archived' ? { label: 'Restore from archive', onSelect: () => void setStatus('active', 'Goal restored') } : { label: 'Archive goal', tone: 'danger', onSelect: () => void setStatus('archived', 'Goal archived. Its history is kept.') },
  ];
  const tone = goal.category === 'both' ? 'gold' : goal.category;

  return (
    <div className="page page--goal">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/visions">Visions</Link>
        {plan && (
          <>
            <span aria-hidden="true">/</span>
            <Link to={`/visions/${plan.id}`}>{plan.title}</Link>
          </>
        )}
        {parent && (
          <>
            <span aria-hidden="true">/</span>
            <Link to={`/goals/${parent.id}`}>{parent.title}</Link>
          </>
        )}
      </nav>

      <header className={`goal-head goal-head--${tone}`}>
        <div className="goal-head__text">
          <p className="overline">
            {plan ? PLAN_KIND_LABEL[plan.kind] : 'Standalone goal'}
            {goal.domain && ` · ${goal.domain}`}
          </p>
          <h1 className="goal-head__title">{goal.title}</h1>
          <div className="goal-head__chips">
            {goal.status !== 'active' && <span className={`status-chip status-chip--${goal.status}`}>{goal.status === 'achieved' ? 'Achieved' : goal.status === 'paused' ? 'Paused' : 'Archived'}</span>}
            <span className={`status-chip status-chip--${tone}`}>{goal.category === 'both' ? 'Learning + Doing' : goal.category === 'learning' ? 'Learning' : 'Doing'}</span>
            {goal.reviewDate && <span className="status-chip">Review {formatMedium(goal.reviewDate)}</span>}
          </div>
        </div>
        <div className="goal-head__actions">
          <button type="button" className="btn btn--quiet btn--sm" onClick={() => setEditing('edit')}>
            <Icon name="pen" size={14} /> Edit
          </button>
          <Menu label="Goal actions" trigger={<Icon name="more" size={18} />} items={menu} />
        </div>
      </header>

      {goal.why && <blockquote className="goal-why">{goal.why}</blockquote>}

      <div className="goal-grid">
        <ProgressPanel view={view} today={today} />
        <StreakPanel view={view} today={today} />
      </div>

      <HabitsSection goal={goal} habits={view.habits} tasks={view.tasks} today={today} timeZone={tz} />

      {goal.measurementMode === 'milestones' && <MilestonesPanel view={view} today={today} />}

      <section className="panel" aria-labelledby="sub-heading">
        <div className="panel__head">
          <div>
            <h2 id="sub-heading" className="panel__title">
              Sub-goals
            </h2>
            <p className="panel__sub">Smaller outcomes that build this one.</p>
          </div>
          <button type="button" className="btn btn--quiet btn--sm" onClick={() => setEditing('sub')}>
            <Icon name="plus" size={14} /> Add sub-goal
          </button>
        </div>
        {view.children.length === 0 ? (
          <p className="panel__empty">None yet.</p>
        ) : (
          <ul className="goal-list">
            {view.children.map((c) => (
              <GoalRow key={c.id} view={model.goalViews.get(c.id)!} />
            ))}
          </ul>
        )}
      </section>

      {plan && (plan.kind === 'sprint' || plan.kind === 'year') && goal.status !== 'archived' ? (
        unlocks && (
          <ul className="chests chests--single" aria-label="Reward chest">
            <ChestCard item={{ goal, plan }} owned={new Map(unlocks.cosmetics.map((c) => [c.cosmeticId, c]))} compact />
          </ul>
        )
      ) : (
        goal.sealedReward && <RewardPanel achieved={goal.status === 'achieved'} reward={goal.sealedReward} />
      )}

      <HistoryPanel view={view} tz={tz} entries={board.entries.filter((e) => e.goalIds.includes(goal.id) || e.taskIds.some((id) => view.tasks.some((t) => t.id === id)))} />

      {editing && (
        <GoalEditor
          goal={editing === 'edit' ? goal : null}
          plans={board.plans}
          goals={board.goals}
          defaultPlanId={editing === 'sub' ? goal.planId : null}
          defaultParentId={editing === 'sub' ? goal.id : null}
          today={today}
          onClose={() => setEditing(null)}
          onSaved={(g, created) => {
            toast({ message: created ? 'Sub-goal created' : 'Goal saved', tone: 'success' });
            if (created) navigate(`/goals/${g.id}`);
          }}
        />
      )}
    </div>
  );
}

function ProgressPanel({ view, today }: { view: GoalView; today: string }) {
  const repo = useRepo();
  const toast = useToast();
  const { goal, progress, pace, plan } = view;
  const [amount, setAmount] = useState('');
  const [how, setHow] = useState<'add' | 'set'>(goal.measurementMode === 'numeric' ? 'add' : 'set');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const pct = progress.fraction === null ? null : Math.round(progress.fraction * 1000) / 10;
  const needed = dailyNeeded(goal, plan, today);
  const canLog = goal.measurementMode === 'numeric' || goal.measurementMode === 'manual';

  const log = async () => {
    const n = Number(amount.replace(/[,\s]/g, ''));
    if (!amount.trim() || !Number.isFinite(n)) {
      toast({ message: 'Enter a number first.', tone: 'error' });
      return;
    }
    const value = how === 'add' ? (goal.current ?? 0) + n : n;
    setBusy(true);
    try {
      await repo.logGoalValue(goal.id, value, note, today);
      setAmount('');
      setNote('');
      toast({ message: goal.measurementMode === 'numeric' ? `Now at ${formatAmount(value, goal.unit)}` : `Progress set to ${value}%`, tone: 'success' });
    } catch (e) {
      toast({ message: (e as Error).message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel panel--progress" aria-labelledby="progress-heading">
      <h2 id="progress-heading" className="panel__title">
        Progress
      </h2>
      <div className="big-progress">
        <span className="big-progress__pct tabular">{pct === null ? '—' : `${pct}%`}</span>
        <span className="big-progress__summary">{progress.summary}</span>
      </div>
      <div className="pace-track" aria-hidden="true">
        <div className="pace-track__fill" style={{ width: `${pct ?? 0}%` }} />
        {pace.state !== 'unmeasured' && pace.state !== 'done' && <div className="pace-track__mark" style={{ left: `${pace.expectedFraction * 100}%` }} title="Where even progress would put you today" />}
      </div>
      <div className="future-self">
        <PaceChip state={pace.state} label={pace.label} />
        <p>
          {pace.state === 'unmeasured'
            ? 'Measure this goal to see whether you are on track.'
            : pace.state === 'done'
              ? 'You became the person this goal asked for.'
              : plan
                ? `The marker shows where even progress would put you today (${Math.round(pace.expectedFraction * 100)}% of the way to ${formatMedium(plan.endDate)}).`
                : 'Add this goal to a plan to compare against a deadline.'}
          {needed !== null && needed > 0 && ` To finish on time you need about ${formatAmount(Math.ceil(needed * 100) / 100, goal.unit)} a day.`}
        </p>
      </div>

      {canLog && goal.status !== 'archived' && (
        <form
          className="log-form"
          onSubmit={(e) => {
            e.preventDefault();
            void log();
          }}
        >
          {goal.measurementMode === 'numeric' && (
            <div className="segmented" role="group" aria-label="How to log">
              <button type="button" className="segmented__btn" aria-pressed={how === 'add'} onClick={() => setHow('add')}>
                Add to it
              </button>
              <button type="button" className="segmented__btn" aria-pressed={how === 'set'} onClick={() => setHow('set')}>
                Set new total
              </button>
            </div>
          )}
          <div className="log-form__row">
            <label className="visually-hidden" htmlFor="log-amount">
              {goal.measurementMode === 'manual' ? 'New percent' : how === 'add' ? 'Amount to add' : 'New total'}
            </label>
            <input
              id="log-amount"
              className="input tabular"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={goal.measurementMode === 'manual' ? 'Percent, 0–100' : how === 'add' ? `+ amount${goal.unit ? ` (${goal.unit})` : ''}` : `New total${goal.unit ? ` (${goal.unit})` : ''}`}
            />
            <label className="visually-hidden" htmlFor="log-note">
              Note
            </label>
            <input id="log-note" className="input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="What moved it?" />
            <button type="submit" className="btn btn--primary" disabled={busy}>
              Log
            </button>
          </div>
        </form>
      )}
      {goal.measurementMode === 'tasks' && <p className="panel__sub">Finish linked tasks and habits to move this. Link any task to this goal from its edit screen.</p>}
    </section>
  );
}

function StreakPanel({ view, today }: { view: GoalView; today: string }) {
  const repo = useRepo();
  const toast = useToast();
  const [note, setNote] = useState('');
  const { streak } = view;
  return (
    <section className="panel panel--streak" aria-labelledby="streak-heading">
      <h2 id="streak-heading" className="panel__title">
        Goal streak
      </h2>
      <div className="streak-big">
        <StreakFlame streak={streak} />
        <div>
          <p className="streak-big__line">
            {streak.current === 0 ? 'No streak yet' : `${streak.current} day${streak.current === 1 ? '' : 's'} in a row`}
          </p>
          <p className="panel__sub">
            {streak.activeToday ? 'Today counts. ' : streak.current > 0 ? 'Move it today to keep the fire lit. ' : ''}Best: {streak.longest} day{streak.longest === 1 ? '' : 's'}
          </p>
        </div>
      </div>
      <ActivityStrip dates={view.activeDates} today={today} days={28} />
      <p className="panel__sub">A day counts when you finish a linked task or habit, log progress, or write a check-in.</p>
      <form
        className="log-form__row"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await repo.logGoalNote(view.goal.id, note, today);
            setNote('');
            toast({ message: 'Check-in saved', tone: 'success' });
          } catch (err) {
            toast({ message: (err as Error).message, tone: 'error' });
          }
        }}
      >
        <label className="visually-hidden" htmlFor="checkin">
          Quick check-in
        </label>
        <input id="checkin" className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="What did you do for it today?" />
        <button type="submit" className="btn btn--quiet" disabled={!note.trim()}>
          Save
        </button>
      </form>
    </section>
  );
}

function MilestonesPanel({ view, today }: { view: GoalView; today: string }) {
  const repo = useRepo();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const active = view.milestones.filter((m) => !m.archivedAt);
  return (
    <section className="panel" aria-labelledby="ms-heading">
      <div className="panel__head">
        <h2 id="ms-heading" className="panel__title">
          Milestones
        </h2>
        <span className="panel__sub tabular">
          {active.filter((m) => m.achievedAt).length} of {active.length} done
        </span>
      </div>
      {active.length === 0 && <p className="panel__empty">Break this goal into steps you can tick off.</p>}
      <ul className="milestones">
        {active.map((m) => (
          <li key={m.id} className={`milestone ${m.achievedAt ? 'is-done' : ''}`}>
            <label className="task__check">
              <input
                type="checkbox"
                checked={!!m.achievedAt}
                onChange={(e) => void repo.setMilestoneAchieved(m.id, e.target.checked, today).then(() => e.target.checked && toast({ message: `Milestone reached: ${m.title}`, tone: 'gold' }))}
                aria-label={`${m.achievedAt ? 'Mark not reached' : 'Mark reached'}: ${m.title}`}
              />
              <span className="task__box" aria-hidden="true">
                {m.achievedAt && <Icon name="check" size={14} />}
              </span>
            </label>
            <span className="milestone__title">{m.title}</span>
            <button type="button" className="icon-btn icon-btn--sm" aria-label={`Remove ${m.title}`} onClick={() => void repo.archiveMilestone(m.id, true).then(() => toast({ message: 'Milestone removed', action: { label: 'Undo', run: () => repo.archiveMilestone(m.id, false) } }))}>
              <Icon name="close" size={14} />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="log-form__row"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await repo.addMilestone(view.goal.id, title);
            setTitle('');
          } catch (err) {
            toast({ message: (err as Error).message, tone: 'error' });
          }
        }}
      >
        <label className="visually-hidden" htmlFor="ms-new">
          New milestone
        </label>
        <input id="ms-new" className="input" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} placeholder="Add a milestone" />
        <button type="submit" className="btn btn--quiet" disabled={!title.trim()}>
          Add
        </button>
      </form>
    </section>
  );
}

function RewardPanel({ achieved, reward }: { achieved: boolean; reward: string }) {
  return (
    <section className={`reward ${achieved ? 'reward--open' : ''}`} aria-label="Sealed reward">
      <div className="reward__chest" aria-hidden="true">
        <Icon name={achieved ? 'sparkle' : 'lock'} size={26} />
      </div>
      <div>
        <p className="overline">{achieved ? 'Reward unlocked' : 'Sealed reward'}</p>
        <p className="reward__text">{achieved ? reward : 'Something you promised yourself is locked inside. It opens the moment you achieve this goal.'}</p>
      </div>
    </section>
  );
}

type HistoryItem = { at: string; key: string; text: string; detail?: string; tone: string; href?: string };

const UPDATE_TEXT = (u: GoalUpdate, view: GoalView): HistoryItem => {
  const fmt = (v: number | null) => (v === null ? '—' : view.goal.measurementMode === 'manual' ? `${v}%` : formatAmount(v, view.goal.unit));
  switch (u.kind) {
    case 'value':
      return { at: u.at, key: u.id, text: u.previous === null ? `Started at ${fmt(u.value)}` : `${fmt(u.previous)} → ${fmt(u.value)}`, detail: u.note, tone: 'gold' };
    case 'milestone':
      return { at: u.at, key: u.id, text: `Milestone reached: ${u.note}`, tone: 'gold' };
    case 'note':
      return { at: u.at, key: u.id, text: u.note, tone: 'muted' };
    case 'status':
      return { at: u.at, key: u.id, text: `Goal ${u.note === 'active' ? 'reopened' : u.note}`, tone: 'muted' };
  }
};

function HistoryPanel({ view, tz, entries }: { view: GoalView; tz: string; entries: { id: string; dateKey: string; title: string; plainText: string; happenedAt: string; documentedAt: string | null }[] }) {
  const [all, setAll] = useState(false);
  const items: HistoryItem[] = [
    ...view.updates.map((u) => UPDATE_TEXT(u, view)),
    ...view.tasks
      .filter((t: Task) => t.status === 'completed' && t.completedAt)
      .map((t) => ({ at: t.completedAt!, key: t.id, text: `Done: ${t.title}`, tone: t.category, href: t.scheduledDate ? `/?date=${t.scheduledDate}` : undefined })),
    ...entries.map((e) => ({
      at: e.happenedAt,
      key: e.id,
      text: e.title || (e.plainText.trim() ? `${e.plainText.trim().slice(0, 90)}${e.plainText.length > 90 ? '…' : ''}` : 'Empty entry'),
      detail: e.documentedAt ? 'Documented entry' : 'Journal entry',
      tone: 'journal',
      href: `/?date=${e.dateKey}`,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const shown = (all ? items : items.slice(0, 12)).map((it, i, list) => {
    const day = dateKeyInZone(new Date(it.at), tz);
    const prev = i > 0 ? dateKeyInZone(new Date(list[i - 1]!.at), tz) : null;
    return { ...it, header: day !== prev ? day : null };
  });

  return (
    <section className="panel" aria-labelledby="hist-heading">
      <div className="panel__head">
        <h2 id="hist-heading" className="panel__title">
          History and evidence
        </h2>
        <span className="panel__sub tabular">{items.length} records</span>
      </div>
      {items.length === 0 ? (
        <p className="panel__empty">Everything you do for this goal lands here: check-ins, finished habits, milestones and journal entries.</p>
      ) : (
        <ol className="timeline">
          {shown.map(({ header, ...it }) => {
            return (
              <li key={it.key} className={`timeline__item timeline__item--${it.tone}`}>
                {header && <p className="timeline__day">{formatShort(header)}</p>}
                <div className="timeline__row">
                  <span className="timeline__time tabular">{formatTimeInZone(new Date(it.at), tz)}</span>
                  <div>
                    {it.href ? (
                      <Link to={it.href} className="timeline__text timeline__text--link">
                        {it.text}
                      </Link>
                    ) : (
                      <span className="timeline__text">{it.text}</span>
                    )}
                    {it.detail && <span className="timeline__detail">{it.detail}</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {items.length > 12 && (
        <button type="button" className="link-btn link-btn--quiet" onClick={() => setAll((v) => !v)}>
          {all ? 'Show less' : `Show all ${items.length}`}
        </button>
      )}
    </section>
  );
}
