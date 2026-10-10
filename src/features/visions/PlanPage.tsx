import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Dialog } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { EmptyState } from '../../components/Page';
import { useToast } from '../../components/Toasts';
import { useTodayKey } from '../../date/clock';
import { formatMedium, isDateKey } from '../../date/localDate';
import { PLAN_KIND_LABEL } from '../../domain/goals';
import type { VisionPlan } from '../../domain/models';
import { sprintCountdown } from '../../domain/plans';
import { useGoalBoard } from '../../storage/queries';
import { useProfile, useRepo } from '../../storage/StorageProvider';
import { buildBoard } from './boardModel';
import { GoalEditor } from './GoalEditor';
import { EditableText, GoalRow, TimeVsAchievement } from './parts';
import { achievementText } from './VisionsPage';

const STATEMENT_PROMPT: Record<VisionPlan['kind'], string> = {
  decade: 'Who are you in ten years? Describe the person, the work and the life.',
  year: 'By this date next year, what is true about you that is not true today?',
  sprint: 'How will you finish this run strong? What does done look like?',
};

export function PlanPage() {
  const { planId } = useParams();
  const profile = useProfile();
  const today = useTodayKey(profile.timeZone);
  const board = useGoalBoard();
  const model = useMemo(() => (board ? buildBoard(board, today, { includeArchived: true }) : null), [board, today]);
  const repo = useRepo();
  const toast = useToast();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [editingDates, setEditingDates] = useState(false);

  if (!model || !board) {
    return (
      <div className="page page--narrow">
        <div className="skeleton-list" aria-hidden="true">
          <span />
        </div>
      </div>
    );
  }
  const pv = model.plans.find((p) => p.plan.id === planId);
  if (!pv) {
    return (
      <div className="page page--narrow">
        <EmptyState icon="vision" title="This plan isn't here." body="It may have been removed, or the link is old.">
          <Link to="/visions" className="btn btn--primary">
            Back to Visions
          </Link>
        </EmptyState>
      </div>
    );
  }
  const { plan } = pv;
  const goals = pv.goals.filter((g) => g.goal.status !== 'archived');
  const archived = pv.goals.filter((g) => g.goal.status === 'archived');
  const countdown = plan.kind === 'sprint' ? sprintCountdown(today, plan.startDate, plan.endDate) : null;
  const save = (patch: Parameters<typeof repo.updatePlan>[1]) => repo.updatePlan(plan.id, patch).then(() => toast({ message: 'Saved', tone: 'success' }));

  return (
    <div className="page page--goal">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/visions">Visions</Link>
      </nav>

      <header className={`goal-head goal-head--${plan.kind === 'decade' ? 'focus' : plan.kind === 'year' ? 'learning' : 'gold'}`}>
        <div className="goal-head__text">
          <p className="overline">{PLAN_KIND_LABEL[plan.kind]}</p>
          <h1 className="goal-head__title">{plan.title}</h1>
          <div className="goal-head__chips">
            <span className="status-chip tabular">
              {formatMedium(plan.startDate)} → {formatMedium(plan.endDate)}
            </span>
            {countdown && <span className="status-chip status-chip--gold">{countdown.label}</span>}
            {plan.archivedAt && <span className="status-chip status-chip--archived">Archived</span>}
          </div>
        </div>
        <div className="goal-head__actions">
          <button type="button" className="btn btn--quiet btn--sm" onClick={() => setEditingDates(true)}>
            <Icon name="pen" size={14} /> Name and dates
          </button>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setCreating(true)}>
            <Icon name="plus" size={14} /> Add goal
          </button>
        </div>
      </header>

      <section className="panel panel--vision" aria-labelledby="statement-heading">
        <h2 id="statement-heading" className="panel__title">
          {plan.kind === 'decade' ? 'Who I am becoming' : plan.kind === 'year' ? 'This year, I become' : 'Finish strong'}
        </h2>
        <EditableText label="Vision statement" value={plan.statement} placeholder={STATEMENT_PROMPT[plan.kind]} onSave={(statement) => save({ statement })} className="editable--statement" />
      </section>

      <TimeVsAchievement plan={plan} today={today} achievement={pv.achievement.fraction} achievementText={achievementText(pv)} />

      <section className="panel" aria-labelledby="goals-heading">
        <div className="panel__head">
          <div>
            <h2 id="goals-heading" className="panel__title">
              Goals
            </h2>
            <p className="panel__sub">Achievement here comes only from these goals, never from time passing.</p>
          </div>
        </div>
        {goals.length === 0 ? (
          <p className="panel__empty">No goals yet. A good goal is concrete: “Make $1,000,000”, “Ship 12 products”, “Run a marathon”.</p>
        ) : (
          <ul className="goal-list">
            {goals.map((g) => (
              <GoalRow key={g.goal.id} view={g} />
            ))}
          </ul>
        )}
        {archived.length > 0 && (
          <details className="archived">
            <summary>{archived.length} archived</summary>
            <ul className="goal-list">
              {archived.map((g) => (
                <GoalRow key={g.goal.id} view={g} />
              ))}
            </ul>
          </details>
        )}
      </section>

      <div className="goal-grid">
        <section className="panel" aria-labelledby="success-heading">
          <h2 id="success-heading" className="panel__title">
            What success looks like
          </h2>
          <EditableText label="Success criteria" value={plan.successCriteria} placeholder="Write the result that would make you proud on the last day." onSave={(successCriteria) => save({ successCriteria })} />
        </section>
        <section className="panel" aria-labelledby="review-heading">
          <h2 id="review-heading" className="panel__title">
            Review
          </h2>
          <EditableText label="Plan review" value={plan.review} placeholder="Every so often: what is working, what is not, and what changes next." onSave={(review) => save({ review })} />
        </section>
      </div>

      <div className="plan-foot">
        <button
          type="button"
          className="link-btn link-btn--quiet"
          onClick={async () => {
            await repo.setPlanArchived(plan.id, !plan.archivedAt);
            toast({ message: plan.archivedAt ? 'Plan restored' : 'Plan archived. Its goals and history are kept.' });
            if (!plan.archivedAt) navigate('/visions');
          }}
        >
          {plan.archivedAt ? 'Restore this plan' : 'Archive this plan'}
        </button>
      </div>

      {creating && (
        <GoalEditor
          goal={null}
          plans={board.plans}
          goals={board.goals}
          defaultPlanId={plan.id}
          today={today}
          onClose={() => setCreating(false)}
          onSaved={(g) => {
            toast({ message: 'Goal created. Add a daily habit to start your streak.', tone: 'success' });
            navigate(`/goals/${g.id}`);
          }}
        />
      )}
      {editingDates && <PlanDatesDialog plan={plan} onClose={() => setEditingDates(false)} />}
    </div>
  );
}

function PlanDatesDialog({ plan, onClose }: { plan: VisionPlan; onClose: () => void }) {
  const repo = useRepo();
  const toast = useToast();
  const [title, setTitle] = useState(plan.title);
  const [start, setStart] = useState(plan.startDate);
  const [end, setEnd] = useState(plan.endDate);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!isDateKey(start) || !isDateKey(end)) {
      setError('Choose valid dates.');
      return;
    }
    try {
      await repo.updatePlan(plan.id, { title, startDate: start, endDate: end });
      toast({ message: 'Plan saved', tone: 'success' });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Name and dates"
      description="Dates are yours to change. Past progress and history stay as they are."
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={save}>
            Save
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
          <span className="field__label">Name</span>
          <input className="input" id="plan-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Starts</span>
          <input className="input" id="plan-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Ends</span>
          <input className="input" id="plan-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <button type="submit" hidden />
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
