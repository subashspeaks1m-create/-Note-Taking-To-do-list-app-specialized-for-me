import { EmptyState, PageHeader, StageNote } from '../../components/Page';

const METRICS = [
  { label: 'Tasks completed', def: 'Completed tasks in the selected range.' },
  { label: 'Completion rate', def: 'Completed ÷ scheduled tasks that were not canceled.' },
  { label: 'Documented entries', def: 'Logs you explicitly marked as documented.' },
  { label: 'Current streak', def: 'Days in a row with a completed task or documented log.' },
];

export function InsightsPage() {
  return (
    <div className="page">
      <PageHeader overline="Truthful numbers" title="Insights" />
      <div className="metric-grid">
        {METRICS.map((m) => (
          <div key={m.label} className="metric">
            <p className="metric__label">{m.label}</p>
            <p className="metric__value metric__value--none">No data yet</p>
            <p className="metric__def">{m.def}</p>
          </div>
        ))}
      </div>
      <EmptyState icon="insights" title="Nothing to measure yet." body="Insights only count what you actually record. Every number will show its date range and sample size." />
      <StageNote stage={4}>Trends, weekly and monthly reviews and category breakdowns arrive in stage 4.</StageNote>
    </div>
  );
}
