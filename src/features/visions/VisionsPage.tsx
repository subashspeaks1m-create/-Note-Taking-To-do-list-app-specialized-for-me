import { PageHeader, StageNote } from '../../components/Page';
import { Icon } from '../../components/Icon';
import { useTodayKey } from '../../date/clock';
import { formatMedium } from '../../date/localDate';
import { PLAN_DEFAULTS, PROFILE_DEFAULTS } from '../../domain/config';
import { planTimeline, sprintCountdown } from '../../domain/plans';

const KIND_COPY = {
  decade: { overline: 'Ten years', blurb: 'Who you are becoming, and the work that proves it.', accent: 'focus' },
  year: { overline: 'One year', blurb: 'An anniversary-to-anniversary foundation, not January to December.', accent: 'learning' },
  sprint: { overline: 'Sprint', blurb: 'Finish 2026 strong: a focused run to December 31.', accent: 'gold' },
} as const;

export function VisionsPage() {
  const today = useTodayKey(PROFILE_DEFAULTS.timeZone);
  return (
    <div className="page">
      <PageHeader overline="Connected horizons" title="Visions" />
      <p className="page-lede">
        Ten-year vision → annual outcome → sprint and monthly outcome → weekly focus → daily task → written evidence.
      </p>

      <div className="plan-grid">
        {PLAN_DEFAULTS.map((plan) => {
          const t = planTimeline(today, plan.startDate, plan.endDate);
          const copy = KIND_COPY[plan.kind];
          const countdown = plan.kind === 'sprint' ? sprintCountdown(today, plan.startDate, plan.endDate) : null;
          return (
            <article key={plan.kind} id={plan.kind} className={`plan-card plan-card--${copy.accent}`}>
              <p className="overline">{copy.overline}</p>
              <h2 className="plan-card__title">{plan.title}</h2>
              <p className="plan-card__dates tabular">
                {formatMedium(plan.startDate)} → {formatMedium(plan.endDate)}
              </p>
              <p className="plan-card__blurb">{copy.blurb}</p>

              <div className="plan-card__measures">
                <div className="measure">
                  <div className="measure__head">
                    <span>Time elapsed</span>
                    <span className="tabular">
                      {t.elapsedDays} of {t.totalDays} days
                    </span>
                  </div>
                  <div className="measure__track measure__track--time" aria-hidden="true">
                    <div style={{ width: `${t.timeFraction * 100}%` }} />
                  </div>
                </div>
                <div className="measure">
                  <div className="measure__head">
                    <span>Achievement</span>
                    <span>No goals measured yet</span>
                  </div>
                  <div className="measure__track measure__track--empty" aria-hidden="true" />
                </div>
              </div>

              {countdown && (
                <p className="plan-card__countdown">
                  <Icon name="sparkle" size={14} /> {countdown.label}
                </p>
              )}

              <div className="plan-card__goals">
                <p className="plan-card__empty">No goals yet. Add the outcomes that matter to you.</p>
              </div>
            </article>
          );
        })}
      </div>

      <StageNote stage={3}>Goals, milestones, progress tracking and monthly, weekly and daily direction arrive in stage 3.</StageNote>
    </div>
  );
}
