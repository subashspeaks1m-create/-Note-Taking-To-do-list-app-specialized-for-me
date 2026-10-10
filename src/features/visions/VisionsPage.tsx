import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/Page';
import { useToast } from '../../components/Toasts';
import { useTodayKey } from '../../date/clock';
import { formatMedium } from '../../date/localDate';
import { PLAN_KIND_LABEL } from '../../domain/goals';
import type { ID } from '../../domain/models';
import { sprintCountdown } from '../../domain/plans';
import { useGoalBoard } from '../../storage/queries';
import { useProfile } from '../../storage/StorageProvider';
import { buildBoard, type PlanView } from './boardModel';
import { GoalEditor } from './GoalEditor';
import { MindMap } from './MindMap';
import { GoalRow, TimeVsAchievement } from './parts';

const KIND_ACCENT = { decade: 'focus', year: 'learning', sprint: 'gold' } as const;

export function achievementText(view: PlanView): string {
  const a = view.achievement;
  if (a.total === 0) return 'No goals yet';
  if (a.fraction === null) return 'Goals not measured yet';
  return `${Math.round(a.fraction * 100)}%${a.measured < a.total ? ` of ${a.measured} measured` : ''}`;
}

export function VisionsPage() {
  const profile = useProfile();
  const today = useTodayKey(profile.timeZone);
  const board = useGoalBoard();
  const model = useMemo(() => (board ? buildBoard(board, today) : null), [board, today]);
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'map' ? 'map' : 'cards';
  const [creating, setCreating] = useState<{ planId: ID | null } | null>(null);
  const navigate = useNavigate();
  const toast = useToast();

  const setView = (v: 'cards' | 'map') =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (v === 'map') next.set('view', 'map');
        else next.delete('view');
        return next;
      },
      { replace: true },
    );

  const standalone = model ? board!.goals.filter((g) => !g.planId && !g.parentId && g.status !== 'archived').map((g) => model.goalViews.get(g.id)!) : [];

  return (
    <div className="page">
      <PageHeader overline="Connected horizons" title="Visions" art="crystal-ball" artMotion="float">
        <div className="segmented" role="group" aria-label="View">
          <button type="button" className="segmented__btn" aria-pressed={view === 'cards'} onClick={() => setView('cards')}>
            Board
          </button>
          <button type="button" className="segmented__btn" aria-pressed={view === 'map'} onClick={() => setView('map')}>
            Mind map
          </button>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => setCreating({ planId: model?.plans.find((p) => p.plan.kind === 'year')?.plan.id ?? null })}>
          <Icon name="plus" size={16} /> New goal
        </button>
      </PageHeader>
      <p className="page-lede">Ten-year vision → one-year foundation → sprint → daily habits → written evidence. Tap any horizon to open it.</p>

      {!model ? (
        <div className="skeleton-list" aria-hidden="true">
          <span />
          <span />
        </div>
      ) : view === 'map' ? (
        <MindMap model={model} today={today} />
      ) : (
        <>
          <div className="plan-grid">
            {model.plans.map((pv) => {
              const { plan } = pv;
              const countdown = plan.kind === 'sprint' ? sprintCountdown(today, plan.startDate, plan.endDate) : null;
              return (
                <article key={plan.id} className={`plan-card plan-card--${KIND_ACCENT[plan.kind]}`}>
                  <p className="overline">{PLAN_KIND_LABEL[plan.kind]}</p>
                  <h2 className="plan-card__title">
                    <Link to={`/visions/${plan.id}`} className="plan-card__link">
                      {plan.title}
                    </Link>
                  </h2>
                  <p className="plan-card__dates tabular">
                    {formatMedium(plan.startDate)} → {formatMedium(plan.endDate)}
                  </p>
                  {plan.statement ? <p className="plan-card__statement">“{plan.statement}”</p> : <p className="plan-card__blurb">Open it and write who you are becoming.</p>}

                  <TimeVsAchievement plan={plan} today={today} achievement={pv.achievement.fraction} achievementText={achievementText(pv)} />

                  {countdown && (
                    <p className="plan-card__countdown">
                      <Icon name="sparkle" size={14} /> {countdown.label}
                    </p>
                  )}

                  <div className="plan-card__goals">
                    {pv.goals.length === 0 ? (
                      <p className="plan-card__empty">No goals yet. Add the outcomes that matter to you.</p>
                    ) : (
                      <ul className="goal-list">
                        {pv.goals.map((gv) => (
                          <GoalRow key={gv.goal.id} view={gv} />
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="plan-card__actions">
                    <button type="button" className="btn btn--quiet btn--sm" onClick={() => setCreating({ planId: plan.id })}>
                      <Icon name="plus" size={14} /> Add goal
                    </button>
                    <Link to={`/visions/${plan.id}`} className="link-btn link-btn--quiet">
                      Open {PLAN_KIND_LABEL[plan.kind].toLowerCase()}
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>

          {standalone.length > 0 && (
            <>
              <h2 className="section-title">Standalone goals</h2>
              <ul className="goal-list goal-list--grid">
                {standalone.map((gv) => (
                  <GoalRow key={gv.goal.id} view={gv} />
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {creating && board && (
        <GoalEditor
          goal={null}
          plans={board.plans}
          goals={board.goals}
          defaultPlanId={creating.planId}
          today={today}
          onClose={() => setCreating(null)}
          onSaved={(g) => {
            toast({ message: 'Goal created. Add a daily habit to start your streak.', tone: 'success' });
            navigate(`/goals/${g.id}`);
          }}
        />
      )}
    </div>
  );
}
