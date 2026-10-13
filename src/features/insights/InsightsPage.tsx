import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/Page';
import { isDateKey, type DateKey } from '../../date/localDate';
import { periodRange } from '../../domain/stats';
import { useActivitySource, useGoalBoard } from '../../storage/queries';
import { useProfile } from '../../storage/StorageProvider';
import { buildBoard } from '../visions/boardModel';
import { Overview } from './Overview';
import { useReportInbox } from './reportInbox';
import { ReportView } from './ReportView';

type Tab = 'overview' | 'week' | 'month';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'week', label: 'Weekly report' },
  { id: 'month', label: 'Monthly report' },
];
const PACE_ORDER = ['behind', 'not-started', 'on-pace', 'ahead', 'ended', 'unmeasured', 'done'];

export function InsightsPage() {
  const profile = useProfile();
  const inbox = useReportInbox();
  const { today, minutesNow } = inbox;
  const weekStart = profile.weekStart ?? 'monday';
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'week' || params.get('tab') === 'month' ? (params.get('tab') as Tab) : 'overview';
  const source = useActivitySource();
  const board = useGoalBoard();
  const goals = useMemo(() => {
    if (!board) return [];
    const views = [...buildBoard(board, today).goalViews.values()].filter((g) => g.goal.status === 'active' || g.goal.status === 'achieved');
    return views.sort((a, b) => PACE_ORDER.indexOf(a.pace.state) - PACE_ORDER.indexOf(b.pace.state));
  }, [board, today]);
  const goalsBehind = goals.filter((g) => g.pace.state === 'behind').map((g) => g.goal.title);
  const coachGoals = useMemo(
    () => goals.map((g) => ({ title: g.goal.title, progress: g.progress.fraction === null ? g.progress.summary || 'not measured yet' : `${Math.round(g.progress.fraction * 100)}% (${g.progress.summary})`, pace: g.pace.label })),
    [goals],
  );

  const reportKind = tab === 'month' ? 'month' : 'week';
  const fromUrl = params.get('p');
  const anchor: DateKey = fromUrl && isDateKey(fromUrl) ? periodRange(reportKind, fromUrl, weekStart).start : inbox[reportKind].anchor;

  const setTab = (t: Tab) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true });
  const setAnchor = (p: DateKey) => setParams({ tab, p }, { replace: true });

  return (
    <div className="page page--insights">
      <PageHeader overline="Truthful numbers" title="Insights" art="trophy" artMotion="bounce" />
      <div className="segmented ins-tabs" role="tablist" aria-label="Insights view">
        {TABS.map((t) => {
          const isNew = (t.id === 'week' && inbox.week.isNew) || (t.id === 'month' && inbox.month.isNew);
          return (
            <button key={t.id} type="button" role="tab" className="segmented__btn" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
              {isNew && (
                <span className="new-dot" aria-label="new">
                  New
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!source ? (
        <div className="skeleton-list" aria-hidden="true">
          <span />
          <span />
        </div>
      ) : tab === 'overview' ? (
        <Overview source={source} today={today} weekStart={weekStart} goals={goals} />
      ) : (
        <ReportView
          key={reportKind}
          kind={reportKind}
          anchor={anchor}
          onAnchor={setAnchor}
          source={source}
          today={today}
          minutesNow={minutesNow}
          weekStart={weekStart}
          name={profile.displayName}
          goalsBehind={goalsBehind}
          coachGoals={coachGoals}
          goalViews={goals}
          markSeen={inbox.markSeen}
        />
      )}
    </div>
  );
}
