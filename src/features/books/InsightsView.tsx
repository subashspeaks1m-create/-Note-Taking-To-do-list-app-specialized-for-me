import { useState } from 'react';
import type { BookInsights, Insight } from './schema';

export function InsightsView({ insights }: { insights: BookInsights }) {
  const areas = [...new Set(insights.insights.map((i) => i.area))];
  const [area, setArea] = useState<string>('all');
  const list = area === 'all' ? insights.insights : insights.insights.filter((i) => i.area === area);
  const k = insights.keystoneHabit;

  return (
    <div className="insights">
      <section className="hero-card hero-card--gold">
        <p className="overline">Who you're becoming</p>
        <p className="hero-card__line">{insights.identityShift}</p>
        <div className="keystone">
          <h3 className="mini-title">Keystone habit</h3>
          <p className="keystone__habit">{k.habit}</p>
          <p>{k.why}</p>
          <dl className="keystone__facts">
            <div>
              <dt>Cue</dt>
              <dd>{k.cue}</dd>
            </div>
            <div>
              <dt>Start with</dt>
              <dd>{k.smallestVersion}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="ssk">
        <SskColumn title="Start doing" tone="doing" items={insights.startDoing} />
        <SskColumn title="Stop doing" tone="error" items={insights.stopDoing} />
        <SskColumn title="Keep doing" tone="learning" items={insights.keepDoing} />
      </section>

      <div className="section-row">
        <h2 className="section-title">Insights that change behavior</h2>
        {areas.length > 1 && (
          <div className="segmented" role="group" aria-label="Filter by area">
            <button type="button" className="segmented__btn" aria-pressed={area === 'all'} onClick={() => setArea('all')}>
              All
            </button>
            {areas.map((a) => (
              <button key={a} type="button" className="segmented__btn" aria-pressed={area === a} onClick={() => setArea(a)}>
                {a[0]!.toUpperCase() + a.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>
      <ol className="insight-list">
        {list.map((i) => (
          <InsightCard key={i.title} insight={i} rank={insights.insights.indexOf(i) + 1} />
        ))}
      </ol>
    </div>
  );
}

function SskColumn({ title, tone, items }: { title: string; tone: string; items: string[] }) {
  return (
    <div className={`ssk__col ssk__col--${tone}`}>
      <h3 className="mini-title">{title}</h3>
      <ul className="bullets">
        {items.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </div>
  );
}

function InsightCard({ insight: i, rank }: { insight: Insight; rank: number }) {
  return (
    <li className="insight">
      <div className="insight__head">
        <span className="insight__rank tabular">{rank}</span>
        <div>
          <h3 className="insight__title">{i.title}</h3>
          <p className="insight__tags">
            <span className="chip chip--quiet">{i.area}</span>
            <span className={`chip insight__impact--${i.impact}`}>{i.impact} impact</span>
            <span className="chip chip--quiet">{i.effort}</span>
            {i.pages && <span className="muted tabular">p. {i.pages}</span>}
          </p>
        </div>
      </div>
      <p className="insight__idea">{i.idea}</p>
      <p className="insight__why">
        <strong>Why it matters.</strong> {i.whyItMatters}
      </p>
      <div className="shift" aria-label="Behavior shift">
        <div className="shift__from">
          <span className="shift__label">From</span>
          {i.shiftFrom}
        </div>
        <span className="shift__arrow" aria-hidden="true">
          →
        </span>
        <div className="shift__to">
          <span className="shift__label">To</span>
          {i.shiftTo}
        </div>
      </div>
      <dl className="insight__facts">
        <div>
          <dt>Do this</dt>
          <dd>{i.action}</dd>
        </div>
        <div>
          <dt>If-then plan</dt>
          <dd>{i.ifThenPlan}</dd>
        </div>
        <div>
          <dt>Watch out</dt>
          <dd>{i.obstacle}</dd>
        </div>
        <div>
          <dt>Reflect</dt>
          <dd>{i.reflection}</dd>
        </div>
      </dl>
    </li>
  );
}
